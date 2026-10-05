"""
Offline Payment Routes
Handles OTP generation, verification, and cash payment confirmation for offline payments.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, EmailStr
import uuid
import secrets
import random
import string
import logging

from models import UserInDB, UserRole
from registration_models import PaymentStatus, RegistrationStatus
from motor.motor_asyncio import AsyncIOMotorDatabase
from audit_log import audit, AuditEventType
from security import sanitize_dict, is_valid_uuid, sanitize_html

router = APIRouter(prefix="/api", tags=["offline-payments"])
security = HTTPBearer()
logger = logging.getLogger(__name__)


# ==================== Models ====================

class OfflinePaymentMethod(str):
    ONLINE = "online"
    OFFLINE = "offline"


class OfflinePaymentStatus(str):
    PENDING = "pending"           # OTP generated, awaiting verification
    VERIFIED = "verified"         # OTP verified, awaiting cash payment
    COMPLETED = "completed"       # Cash received, registration confirmed
    EXPIRED = "expired"           # OTP expired (past deadline)
    NO_SHOW = "no_show"          # User did not show up


class OfflineRegistrationSubmission(BaseModel):
    """Request model for offline registration submission"""
    campaign_id: str
    form_data: Dict[str, Any]
    total_amount: float
    coupon_code: Optional[str] = None
    member_id: Optional[str] = None  # For closed group campaigns


class OfflineRegistrationResponse(BaseModel):
    """Response after offline registration submission"""
    registration_id: str
    otp: str
    otp_expires_at: str
    message: str
    email_sent: bool = False
    amount_due: float


class OTPVerifyRequest(BaseModel):
    """Request to verify OTP"""
    otp: str
    campaign_id: Optional[str] = None  # Optional filter


class OTPVerifyResponse(BaseModel):
    """Response after OTP verification"""
    registration_id: str
    registrant_name: str
    registrant_email: str
    registrant_phone: str
    amount_due: float
    campaign_name: str
    form_data: Dict[str, Any]
    otp_verified: bool = True


class ConfirmPaymentRequest(BaseModel):
    """Request to confirm cash payment"""
    registration_id: str
    amount_received: float
    notes: Optional[str] = None


class ConfirmPaymentResponse(BaseModel):
    """Response after payment confirmation"""
    registration_id: str
    message: str
    receipt_number: str
    payment_confirmed_at: str


class PendingOfflinePayment(BaseModel):
    """Model for pending offline payment list"""
    registration_id: str
    registrant_name: str
    registrant_email: str
    registrant_phone: str
    amount_due: float
    otp_status: str
    otp_expires_at: Optional[str] = None
    created_at: str


# ==================== Dependencies ====================

async def get_db():
    from server import db
    return db


async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db as get_user
    return await get_user(credentials)


def require_organizer_access(current_user: UserInDB = Depends(get_current_user_with_db)) -> UserInDB:
    """
    Require user to be Super Admin, Director (can_approve_transfers), or Org Admin
    """
    if current_user.role == UserRole.SUPER_ADMIN or current_user.can_approve_transfers:
        return current_user
    if current_user.role == UserRole.ORG_ADMIN:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Organizer access required (Super Admin, Director, or Org Admin)"
    )


def require_kiosk_or_organizer_access(current_user: UserInDB = Depends(get_current_user_with_db)) -> UserInDB:
    """
    Require kiosk access - Super Admin, Director, Org Admin, or Kiosk Volunteer
    Used for endpoints that kiosk volunteers need to access
    """
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.KIOSK_VOLUNTEER]
    if current_user.role in allowed_roles or current_user.can_approve_transfers:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Kiosk or organizer access required"
    )


# ==================== Helper Functions ====================

def generate_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP"""
    # Use secrets module for cryptographically secure random numbers
    return ''.join(secrets.choice(string.digits) for _ in range(length))


def extract_registrant_details(form_data: Dict[str, Any]) -> Dict[str, str]:
    """Extract registrant name, email, phone from form data"""
    # Try various field name patterns
    name_fields = ['name', 'full_name', 'first_name', 'registrant_name']
    email_fields = ['email', 'email_address', 'registrant_email']
    phone_fields = ['phone', 'mobile', 'phone_number', 'contact', 'registrant_phone']
    
    name = "Guest"
    email = "guest@example.com"
    phone = "N/A"
    
    for field in name_fields:
        if form_data.get(field):
            name = form_data[field]
            break
        # Check for name parts
        if form_data.get(f"{field}_first"):
            first = form_data.get(f"{field}_first", "")
            last = form_data.get(f"{field}_last", "")
            name = f"{first} {last}".strip()
            break
    
    for field in email_fields:
        if form_data.get(field):
            email = form_data[field]
            break
    
    for field in phone_fields:
        if form_data.get(field):
            phone = form_data[field]
            break
    
    return {"name": name, "email": email, "phone": phone}


# ==================== Routes ====================

@router.post("/registrations/offline/submit", response_model=OfflineRegistrationResponse)
async def submit_offline_registration(
    submission: OfflineRegistrationSubmission,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Submit a registration with offline payment option.
    Generates an OTP that the user can use at the venue to complete payment.
    Public endpoint.
    """
    # Validate campaign_id format
    if not is_valid_uuid(submission.campaign_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format"
        )
    
    # Sanitize form data to prevent XSS/injection
    if submission.form_data:
        submission.form_data = sanitize_dict(submission.form_data)
    
    # Verify campaign exists and is active
    campaign = await db.campaigns.find_one({"id": submission.campaign_id}, {"_id": 0})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    if campaign.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign is not active"
        )
    
    # Check if offline payments are allowed
    payment_config = campaign.get("payment_config") or {}
    payment_method = campaign.get("payment_collection_method", "online")
    
    # Allow offline payments if either:
    # 1. payment_collection_method is 'offline'
    # 2. payment_config.allow_offline_payments is True
    if payment_method != "offline" and not payment_config.get("allow_offline_payments"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offline payments are not enabled for this campaign"
        )
    
    # Check offline payment deadline
    offline_deadline = payment_config.get("offline_payment_deadline_date")
    if offline_deadline:
        try:
            deadline = datetime.fromisoformat(offline_deadline.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) > deadline:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Offline payment deadline has passed"
                )
        except (ValueError, TypeError):
            pass  # If date parsing fails, allow the registration
    
    # For closed group campaigns, verify member
    member_doc = None
    if campaign.get("campaign_type") == "closed_group":
        if not submission.member_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member ID required for closed group campaign"
            )
        
        member_doc = await db.campaign_members.find_one({
            "id": submission.member_id,
            "campaign_id": submission.campaign_id
        })
        
        if not member_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found"
            )
        
        if member_doc.get("status") == "registered":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member has already registered"
            )
    
    # Check registration limit
    max_reg = campaign.get("max_registrations")
    current_reg = campaign.get("current_registrations", 0)
    if max_reg and current_reg >= max_reg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration limit reached"
        )
    
    # Apply coupon if provided
    final_amount = submission.total_amount
    if submission.coupon_code:
        coupon = await db.coupon_codes.find_one({
            "campaign_id": submission.campaign_id,
            "code": submission.coupon_code,
            "is_active": True
        })
        
        if coupon:
            if coupon["discount_type"] == "percentage":
                final_amount = final_amount * (1 - coupon["discount_value"] / 100)
            else:
                final_amount = max(0, final_amount - coupon["discount_value"])
    
    # Generate OTP
    otp = generate_otp(6)
    
    # Determine OTP expiry (use offline_payment_deadline_date or event end_date)
    otp_expires_at = None
    if payment_config.get("offline_payment_deadline_date"):
        otp_expires_at = payment_config["offline_payment_deadline_date"]
    elif campaign.get("end_date"):
        otp_expires_at = campaign["end_date"]
    else:
        # Default to 7 days if no deadline set
        otp_expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    
    # Create registration
    registration_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    invoice_number = f"INV-{now.strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"
    
    registration_doc = {
        "id": registration_id,
        "campaign_id": submission.campaign_id,
        "form_data": submission.form_data,
        "total_amount": final_amount,
        "payment_status": PaymentStatus.PENDING,
        "registration_status": RegistrationStatus.SUBMITTED,
        "payment_id": None,
        "invoice_number": invoice_number,
        "coupon_code": submission.coupon_code,
        "member_id": submission.member_id,
        # Offline payment specific fields
        "payment_method": "offline",
        "offline_otp": otp,
        "offline_otp_expires_at": otp_expires_at,
        "offline_otp_verified": False,
        "offline_otp_verified_by": None,
        "offline_otp_verified_at": None,
        "offline_payment_confirmed": False,
        "offline_payment_confirmed_by": None,
        "offline_payment_confirmed_at": None,
        "offline_payment_notes": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.registrations.insert_one(registration_doc)
    
    # Update member status for closed group campaigns
    if member_doc and submission.member_id:
        await db.campaign_members.update_one(
            {"id": submission.member_id},
            {
                "$set": {
                    "status": "pending_offline",
                    "registration_id": registration_id,
                    "registered_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
            }
        )
    
    # Send OTP via email
    email_sent = False
    registrant = extract_registrant_details(submission.form_data)
    
    try:
        from integration_service import brevo_service
        
        if brevo_service.is_configured() and registrant["email"] != "guest@example.com":
            otp_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #1e293b; margin-bottom: 10px;">{campaign.get('name', 'Event')}</h1>
                    <p style="color: #64748b;">Registration Confirmation</p>
                </div>
                
                <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); border-radius: 16px; padding: 30px; text-align: center; margin-bottom: 30px;">
                    <p style="color: rgba(255,255,255,0.9); margin-bottom: 15px; font-size: 16px;">Your Registration OTP</p>
                    <div style="background: white; border-radius: 12px; padding: 20px; display: inline-block;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #7c3aed;">{otp}</span>
                    </div>
                    <p style="color: rgba(255,255,255,0.8); margin-top: 15px; font-size: 14px;">
                        Show this OTP at the registration desk
                    </p>
                </div>
                
                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; margin-bottom: 15px;">Registration Details</h3>
                    <p style="color: #64748b; margin: 5px 0;"><strong>Name:</strong> {registrant['name']}</p>
                    <p style="color: #64748b; margin: 5px 0;"><strong>Amount Due:</strong> ₹{final_amount:.2f}</p>
                    <p style="color: #64748b; margin: 5px 0;"><strong>Registration ID:</strong> {registration_id[:8].upper()}</p>
                </div>
                
                <div style="background: #fef3c7; border-radius: 12px; padding: 15px; border-left: 4px solid #f59e0b;">
                    <p style="color: #92400e; margin: 0; font-size: 14px;">
                        <strong>Important:</strong> Please present this OTP at the event registration desk to complete your payment.
                    </p>
                </div>
                
                <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">
                    This is an automated message. Please do not reply.
                </p>
            </div>
            """
            
            await brevo_service.send_email(
                to_email=registrant["email"],
                to_name=registrant["name"],
                subject=f"Your Registration OTP for {campaign.get('name', 'Event')}",
                html_content=otp_html
            )
            email_sent = True
            logger.info(f"OTP email sent to {registrant['email']} for registration {registration_id}")
        else:
            logger.info(f"[MOCK EMAIL] OTP {otp} would be sent to {registrant['email']}")
            
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        # Don't fail the registration if email fails
    
    # Log audit event
    await audit.log(
        AuditEventType.REGISTRATION_CREATED,
        user_id=None,
        user_email=registrant["email"],
        resource_type="registration",
        resource_id=registration_id,
        action_details={
            "campaign_id": submission.campaign_id,
            "campaign_name": campaign.get("name"),
            "payment_method": "offline",
            "amount": final_amount,
            "email_sent": email_sent
        }
    )
    
    return OfflineRegistrationResponse(
        registration_id=registration_id,
        otp=otp,
        otp_expires_at=otp_expires_at,
        message="Registration submitted successfully. Please present your OTP at the registration desk to complete payment.",
        email_sent=email_sent,
        amount_due=final_amount
    )


@router.post("/registrations/offline/verify-otp", response_model=OTPVerifyResponse)
async def verify_otp(
    request: OTPVerifyRequest,
    current_user: UserInDB = Depends(require_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Verify an OTP and return registration details.
    Used by organizers at the registration desk.
    """
    # Build query
    query = {
        "offline_otp": request.otp,
        "payment_method": "offline",
        "offline_payment_confirmed": {"$ne": True}
    }
    
    if request.campaign_id:
        # Check user access to this campaign
        if current_user.role != UserRole.SUPER_ADMIN:
            if not current_user.can_approve_transfers and request.campaign_id not in current_user.campaign_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this campaign"
                )
        query["campaign_id"] = request.campaign_id
    
    registration = await db.registrations.find_one(query)
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid OTP or registration not found"
        )
    
    # Check if already verified and paid
    if registration.get("offline_payment_confirmed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This registration has already been completed"
        )
    
    # Check OTP expiry
    otp_expires_at = registration.get("offline_otp_expires_at")
    if otp_expires_at:
        try:
            expiry = datetime.fromisoformat(otp_expires_at.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) > expiry:
                # Mark as expired
                await db.registrations.update_one(
                    {"id": registration["id"]},
                    {"$set": {
                        "payment_status": "expired",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="OTP has expired"
                )
        except (ValueError, TypeError):
            pass
    
    # Get campaign details
    campaign = await db.campaigns.find_one({"id": registration["campaign_id"]})
    campaign_name = campaign.get("name", "Event") if campaign else "Event"
    
    # Mark OTP as verified
    now = datetime.now(timezone.utc)
    await db.registrations.update_one(
        {"id": registration["id"]},
        {"$set": {
            "offline_otp_verified": True,
            "offline_otp_verified_by": current_user.id,
            "offline_otp_verified_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    # Extract registrant details
    registrant = extract_registrant_details(registration.get("form_data", {}))
    
    # Log audit event
    await audit.log(
        AuditEventType.REGISTRATION_UPDATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="registration",
        resource_id=registration["id"],
        action_details={
            "action": "otp_verified",
            "campaign_id": registration["campaign_id"],
            "registrant_email": registrant["email"]
        }
    )
    
    return OTPVerifyResponse(
        registration_id=registration["id"],
        registrant_name=registrant["name"],
        registrant_email=registrant["email"],
        registrant_phone=registrant["phone"],
        amount_due=registration.get("total_amount", 0),
        campaign_name=campaign_name,
        form_data=registration.get("form_data", {}),
        otp_verified=True
    )


@router.post("/registrations/offline/confirm-payment", response_model=ConfirmPaymentResponse)
async def confirm_offline_payment(
    request: ConfirmPaymentRequest,
    current_user: UserInDB = Depends(require_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Confirm cash payment has been received.
    Called after OTP verification when organizer receives cash.
    """
    registration = await db.registrations.find_one({
        "id": request.registration_id,
        "payment_method": "offline"
    })
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Check user access - allow kiosk volunteers with campaign access
    campaign_id = registration["campaign_id"]
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.KIOSK_VOLUNTEER]
    if current_user.role not in allowed_roles and not current_user.can_approve_transfers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    # For kiosk volunteers and org admins, check campaign access
    if current_user.role in [UserRole.KIOSK_VOLUNTEER, UserRole.ORG_ADMIN]:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this campaign"
            )
    
    if registration.get("offline_payment_confirmed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment already confirmed for this registration"
        )
    
    # Generate receipt number
    now = datetime.now(timezone.utc)
    receipt_number = f"RCPT-{now.strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"
    
    # Update registration
    await db.registrations.update_one(
        {"id": request.registration_id},
        {"$set": {
            "payment_status": PaymentStatus.COMPLETED,
            "registration_status": RegistrationStatus.CONFIRMED,
            "offline_payment_confirmed": True,
            "offline_payment_confirmed_by": current_user.id,
            "offline_payment_confirmed_at": now.isoformat(),
            "offline_payment_notes": request.notes,
            "offline_amount_received": request.amount_received,
            "offline_receipt_number": receipt_number,
            "payment_id": f"CASH_{receipt_number}",
            "updated_at": now.isoformat()
        }}
    )
    
    # Update campaign stats
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if campaign:
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {
                "current_registrations": campaign.get("current_registrations", 0) + 1,
                "total_revenue": campaign.get("total_revenue", 0) + request.amount_received,
                "updated_at": now.isoformat()
            }}
        )
    
    # Update member status for closed group campaigns
    if registration.get("member_id"):
        await db.campaign_members.update_one(
            {"id": registration["member_id"]},
            {"$set": {
                "status": "registered",
                "updated_at": now.isoformat()
            }}
        )
    
    # Log audit event
    await audit.log(
        AuditEventType.PAYMENT_RECEIVED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="registration",
        resource_id=request.registration_id,
        action_details={
            "campaign_id": campaign_id,
            "payment_method": "offline_cash",
            "amount_received": request.amount_received,
            "receipt_number": receipt_number,
            "notes": request.notes
        }
    )
    
    return ConfirmPaymentResponse(
        registration_id=request.registration_id,
        message="Payment confirmed successfully",
        receipt_number=receipt_number,
        payment_confirmed_at=now.isoformat()
    )


@router.get("/campaigns/{campaign_id}/offline-payments/pending", response_model=List[PendingOfflinePayment])
async def get_pending_offline_payments(
    campaign_id: str,
    current_user: UserInDB = Depends(require_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get all pending offline payments for a campaign.
    Used by organizers to see who hasn't paid yet.
    """
    # Check user access
    if current_user.role != UserRole.SUPER_ADMIN:
        if not current_user.can_approve_transfers and campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    # Get pending offline registrations
    registrations = await db.registrations.find({
        "campaign_id": campaign_id,
        "payment_method": "offline",
        "offline_payment_confirmed": {"$ne": True}
    }, {"_id": 0}).to_list(1000)
    
    result = []
    now = datetime.now(timezone.utc)
    
    for reg in registrations:
        registrant = extract_registrant_details(reg.get("form_data", {}))
        
        # Determine OTP status
        otp_status = "pending"
        otp_expires_at = reg.get("offline_otp_expires_at")
        
        if otp_expires_at:
            try:
                expiry = datetime.fromisoformat(otp_expires_at.replace('Z', '+00:00'))
                if now > expiry:
                    otp_status = "expired"
            except (ValueError, TypeError):
                pass
        
        if reg.get("offline_otp_verified"):
            otp_status = "verified"
        
        result.append(PendingOfflinePayment(
            registration_id=reg["id"],
            registrant_name=registrant["name"],
            registrant_email=registrant["email"],
            registrant_phone=registrant["phone"],
            amount_due=reg.get("total_amount", 0),
            otp_status=otp_status,
            otp_expires_at=otp_expires_at,
            created_at=reg.get("created_at", "")
        ))
    
    return result


@router.post("/registrations/{registration_id}/mark-no-show")
async def mark_no_show(
    registration_id: str,
    current_user: UserInDB = Depends(require_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Mark an offline registration as no-show.
    Used when the user doesn't show up at the event.
    """
    registration = await db.registrations.find_one({
        "id": registration_id,
        "payment_method": "offline"
    })
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Check user access - allow kiosk volunteers with campaign access
    campaign_id = registration["campaign_id"]
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.KIOSK_VOLUNTEER]
    if current_user.role not in allowed_roles and not current_user.can_approve_transfers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    # For kiosk volunteers and org admins, check campaign access
    if current_user.role in [UserRole.KIOSK_VOLUNTEER, UserRole.ORG_ADMIN]:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this campaign"
            )
    
    if registration.get("offline_payment_confirmed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark as no-show - payment already confirmed"
        )
    
    now = datetime.now(timezone.utc)
    
    # Update registration
    await db.registrations.update_one(
        {"id": registration_id},
        {"$set": {
            "payment_status": "no_show",
            "registration_status": "no_show",
            "marked_no_show_at": now.isoformat(),
            "marked_no_show_by": current_user.id,
            "updated_at": now.isoformat()
        }}
    )
    
    # Log audit event
    await audit.log(
        AuditEventType.REGISTRATION_UPDATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="registration",
        resource_id=registration_id,
        action_details={
            "action": "marked_no_show",
            "campaign_id": campaign_id
        }
    )
    
    return {"message": "Registration marked as no-show", "registration_id": registration_id}


@router.get("/registrations/{registration_id}/resend-otp")
async def resend_otp(
    registration_id: str,
    current_user: UserInDB = Depends(require_kiosk_or_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Resend OTP email for an offline registration.
    """
    registration = await db.registrations.find_one({
        "id": registration_id,
        "payment_method": "offline"
    })
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Check user access - allow kiosk volunteers with campaign access
    campaign_id = registration["campaign_id"]
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.KIOSK_VOLUNTEER]
    if current_user.role not in allowed_roles and not current_user.can_approve_transfers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    # For kiosk volunteers and org admins, check campaign access
    if current_user.role in [UserRole.KIOSK_VOLUNTEER, UserRole.ORG_ADMIN]:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this campaign"
            )
    
    if registration.get("offline_payment_confirmed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment already completed - OTP no longer needed"
        )
    
    # Get campaign
    campaign = await db.campaigns.find_one({"id": campaign_id})
    campaign_name = campaign.get("name", "Event") if campaign else "Event"
    
    otp = registration.get("offline_otp")
    registrant = extract_registrant_details(registration.get("form_data", {}))
    
    # Send email
    email_sent = False
    try:
        from integration_service import brevo_service
        
        if brevo_service.is_configured() and registrant["email"] != "guest@example.com":
            otp_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #1e293b; text-align: center;">{campaign_name}</h1>
                <p style="text-align: center; color: #64748b;">Registration OTP Reminder</p>
                
                <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); border-radius: 16px; padding: 30px; text-align: center; margin: 20px 0;">
                    <p style="color: white; margin-bottom: 15px;">Your OTP</p>
                    <div style="background: white; border-radius: 12px; padding: 20px; display: inline-block;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #7c3aed;">{otp}</span>
                    </div>
                </div>
                
                <p style="color: #64748b; text-align: center;">
                    Amount Due: <strong>₹{registration.get('total_amount', 0):.2f}</strong>
                </p>
            </div>
            """
            
            await brevo_service.send_email(
                to_email=registrant["email"],
                to_name=registrant["name"],
                subject=f"Reminder: Your Registration OTP for {campaign_name}",
                html_content=otp_html
            )
            email_sent = True
        else:
            logger.info(f"[MOCK EMAIL] OTP resend: {otp} to {registrant['email']}")
            
    except Exception as e:
        logger.error(f"Failed to resend OTP email: {e}")
    
    return {
        "message": "OTP email sent" if email_sent else "Email service not configured",
        "email_sent": email_sent,
        "registration_id": registration_id
    }


class KioskOTPVerifyRequest(BaseModel):
    registration_id: str
    otp: str


@router.post("/verify-otp")
async def verify_otp_by_registration(
    request: KioskOTPVerifyRequest,
    current_user: UserInDB = Depends(require_kiosk_or_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Verify OTP for a specific registration. Used by kiosk volunteers.
    """
    registration = await db.registrations.find_one({
        "id": request.registration_id
    })
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Check user access - allow kiosk volunteers with campaign access
    campaign_id = registration["campaign_id"]
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.KIOSK_VOLUNTEER]
    if current_user.role not in allowed_roles and not current_user.can_approve_transfers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    # For kiosk volunteers and org admins, check campaign access
    if current_user.role in [UserRole.KIOSK_VOLUNTEER, UserRole.ORG_ADMIN]:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this campaign"
            )
    
    if registration.get("payment_status") == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment already completed"
        )
    
    stored_otp = registration.get("offline_otp", "")
    
    if not stored_otp:
        # No OTP stored - this might be a different type of registration
        # Allow verification by matching any OTP for flexibility
        return {"valid": False, "message": "No OTP found for this registration"}
    
    if stored_otp.upper() == request.otp.upper():
        return {"valid": True, "message": "OTP verified successfully"}
    else:
        return {"valid": False, "message": "Invalid OTP"}
