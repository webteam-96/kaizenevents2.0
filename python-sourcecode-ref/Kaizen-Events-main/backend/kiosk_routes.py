"""
Kiosk Mode Routes
Provides simplified API endpoints for on-site registration desk operations.
Supports both verification of existing registrations and new walk-in registrations.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr
import uuid
import secrets
import random
import string
import logging

from models import UserInDB, UserRole
from registration_models import PaymentStatus, RegistrationStatus
from motor.motor_asyncio import AsyncIOMotorDatabase
from security import sanitize_dict, sanitize_html, is_valid_uuid

router = APIRouter(prefix="/api/kiosk", tags=["kiosk"])
security = HTTPBearer()
logger = logging.getLogger(__name__)


# ==================== Models ====================

class KioskLoginRequest(BaseModel):
    """Request for kiosk volunteer login"""
    email: str
    password: str
    campaign_id: str  # Kiosk volunteers must specify campaign


class KioskSearchRequest(BaseModel):
    """Request to search for a registrant"""
    query: str  # Name, email, phone, or registration ID
    campaign_id: str


class KioskSearchResult(BaseModel):
    """Single search result"""
    registration_id: Optional[str] = None
    member_id: Optional[str] = None
    name: str
    email: str
    phone: str
    status: str  # "registered", "pending_offline", "pending", "not_registered"
    amount_due: float
    otp: Optional[str] = None
    form_data: Optional[Dict[str, Any]] = None
    is_new: bool = False  # True if this is a potential new registration


class KioskRegistrationRequest(BaseModel):
    """Request to create a new registration at kiosk"""
    campaign_id: str
    form_data: Dict[str, Any]
    total_amount: float
    member_id: Optional[str] = None  # For closed group campaigns


class KioskPaymentConfirmRequest(BaseModel):
    """Request to confirm payment at kiosk"""
    registration_id: str
    amount_received: float
    payment_method: str = "cash"  # "cash" or "card" or "upi"
    notes: Optional[str] = None


class KioskCheckInRequest(BaseModel):
    """Request to check in a registrant (mark attendance)"""
    registration_id: str


# ==================== Dependencies ====================

async def get_db():
    from server import db
    return db


async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db as get_user
    return await get_user(credentials)


def require_kiosk_access(current_user: UserInDB = Depends(get_current_user_with_db)) -> UserInDB:
    """
    Require kiosk access - Super Admin, Director, Org Admin, or Kiosk Volunteer
    """
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.KIOSK_VOLUNTEER]
    if current_user.role in allowed_roles or current_user.can_approve_transfers:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Kiosk access required"
    )


# ==================== Helper Functions ====================

def generate_receipt_number() -> str:
    """Generate a unique receipt number"""
    now = datetime.now(timezone.utc)
    return f"RCPT-{now.strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"


def extract_registrant_details(form_data: Dict[str, Any]) -> Dict[str, str]:
    """Extract registrant name, email, phone from form data"""
    name = "Guest"
    email = ""
    phone = ""
    
    if not form_data:
        return {"name": name, "email": email, "phone": phone}
    
    # Check for direct name fields first
    name_fields = ['name', 'full_name', 'first_name', 'registrant_name']
    for field in name_fields:
        if form_data.get(field):
            name = form_data[field]
            break
    
    # If still "Guest", look for name type fields (have _first, _last suffixes)
    if name == "Guest":
        keys = list(form_data.keys())
        first_name_key = next((k for k in keys if k.endswith('_first')), None)
        last_name_key = next((k for k in keys if k.endswith('_last')), None)
        
        if first_name_key or last_name_key:
            first_name = form_data.get(first_name_key, '') if first_name_key else ''
            last_name = form_data.get(last_name_key, '') if last_name_key else ''
            full_name = f"{first_name} {last_name}".strip()
            if full_name:
                name = full_name
    
    # If still "Guest", look for field values that are objects with first_name/full_name
    if name == "Guest":
        for key, value in form_data.items():
            if isinstance(value, dict):
                if value.get('full_name'):
                    name = value['full_name']
                    break
                elif value.get('first_name'):
                    fn = value.get('first_name', '')
                    ln = value.get('last_name', '')
                    full_name = f"{fn} {ln}".strip()
                    if full_name:
                        name = full_name
                        break
    
    # Extract email - check common fields and look for @ pattern
    email_fields = ['email', 'email_address', 'registrant_email']
    for field in email_fields:
        if form_data.get(field):
            email = form_data[field]
            break
    
    if not email:
        # Look for any value containing @
        for value in form_data.values():
            if isinstance(value, str) and '@' in value and '.' in value:
                email = value
                break
    
    # Extract phone - check common fields and look for numeric patterns
    phone_fields = ['phone', 'mobile', 'phone_number', 'contact', 'registrant_phone']
    for field in phone_fields:
        if form_data.get(field):
            phone = str(form_data[field])
            break
    
    if not phone:
        # Look for any value that looks like a phone number (10+ digits)
        import re
        for value in form_data.values():
            if isinstance(value, str) and re.match(r'^[\d\s+\-()]{10,}$', value):
                phone = value
                break
    
    return {"name": name, "email": email, "phone": phone}


# ==================== Routes ====================

@router.get("/campaigns/{campaign_id}/info")
async def get_kiosk_campaign_info(
    campaign_id: str,
    current_user: UserInDB = Depends(require_kiosk_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get campaign information for kiosk display.
    Returns simplified campaign data needed for kiosk operations.
    """
    # Check kiosk volunteer access
    if current_user.role == UserRole.KIOSK_VOLUNTEER:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
    
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    form_config = campaign.get("form_config", {})
    
    return {
        "id": campaign["id"],
        "name": campaign["name"],
        "organization_name": campaign["organization_name"],
        "logo_url": campaign.get("logo_url"),
        "event_logo": campaign.get("event_logo"),
        "campaign_type": campaign.get("campaign_type", "open"),
        "payment_collection_method": campaign.get("payment_collection_method", "offline"),
        "base_price": form_config.get("base_price", 0),
        "form_fields": form_config.get("fields", []),
        "current_registrations": campaign.get("current_registrations", 0),
        "max_registrations": campaign.get("max_registrations"),
        "status": campaign.get("status")
    }


@router.post("/search", response_model=List[KioskSearchResult])
async def search_registrants(
    request: KioskSearchRequest,
    current_user: UserInDB = Depends(require_kiosk_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Search for registrants by name, email, phone, or registration ID.
    Also searches unregistered members for closed group campaigns.
    """
    # Check kiosk volunteer access
    if current_user.role == UserRole.KIOSK_VOLUNTEER:
        if request.campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
    
    campaign = await db.campaigns.find_one({"id": request.campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    results = []
    query = request.query.strip().lower()
    
    # Search existing registrations
    registrations = await db.registrations.find({
        "campaign_id": request.campaign_id
    }, {"_id": 0}).to_list(1000)
    
    for reg in registrations:
        details = extract_registrant_details(reg.get("form_data", {}))
        
        # Check if matches search query
        if (query in details["name"].lower() or 
            query in details["email"].lower() or 
            query in details["phone"].lower() or
            query in reg.get("id", "").lower()[:8]):
            
            results.append(KioskSearchResult(
                registration_id=reg["id"],
                member_id=reg.get("member_id"),
                name=details["name"],
                email=details["email"],
                phone=details["phone"],
                status="completed" if reg.get("payment_status") == "completed" else reg.get("payment_status", "pending"),
                amount_due=reg.get("total_amount", 0) if reg.get("payment_status") != "completed" else 0,
                otp=reg.get("offline_otp"),  # Return OTP if available
                form_data=reg.get("form_data"),
                is_new=False
            ))
    
    # For closed group campaigns, also search unregistered members
    if campaign.get("campaign_type") == "closed_group":
        members = await db.campaign_members.find({
            "campaign_id": request.campaign_id,
            "status": {"$ne": "registered"}
        }, {"_id": 0}).to_list(1000)
        
        for member in members:
            member_name = member.get("name", "").lower()
            member_email = member.get("email", "").lower()
            member_phone = (member.get("mobile") or member.get("phone", "")).lower()
            
            if (query in member_name or 
                query in member_email or 
                query in member_phone):
                
                # Check if already in results
                existing = [r for r in results if r.member_id == member["id"]]
                if not existing:
                    form_config = campaign.get("form_config", {})
                    results.append(KioskSearchResult(
                        registration_id=None,
                        member_id=member["id"],
                        name=member.get("name", ""),
                        email=member.get("email", ""),
                        phone=member.get("mobile") or member.get("phone", ""),
                        status="not_registered",
                        amount_due=form_config.get("base_price", 0),
                        otp=None,
                        form_data=member.get("custom_data"),
                        is_new=True
                    ))
    
    return results[:20]  # Limit results


@router.post("/register")
async def create_kiosk_registration(
    request: KioskRegistrationRequest,
    current_user: UserInDB = Depends(require_kiosk_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Create a new registration at the kiosk for walk-in attendees.
    Registration is created with 'pending' payment status for immediate cash collection.
    """
    # Validate campaign_id format
    if not is_valid_uuid(request.campaign_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format"
        )
    
    # Sanitize form data to prevent XSS/injection
    if request.form_data:
        request.form_data = sanitize_dict(request.form_data)
    
    # Check kiosk volunteer access
    if current_user.role == UserRole.KIOSK_VOLUNTEER:
        if request.campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
    
    campaign = await db.campaigns.find_one({"id": request.campaign_id}, {"_id": 0})
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
    
    # Check registration limit
    max_reg = campaign.get("max_registrations")
    current_reg = campaign.get("current_registrations", 0)
    if max_reg and current_reg >= max_reg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration limit reached"
        )
    
    # For closed group, verify member
    member_doc = None
    if campaign.get("campaign_type") == "closed_group":
        if not request.member_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member ID required for closed group campaign"
            )
        
        member_doc = await db.campaign_members.find_one({
            "id": request.member_id,
            "campaign_id": request.campaign_id
        })
        
        if not member_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found"
            )
        
        if member_doc.get("status") == "registered":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member already registered"
            )
    
    # Create registration
    registration_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    invoice_number = f"INV-{now.strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"
    
    registration_doc = {
        "id": registration_id,
        "campaign_id": request.campaign_id,
        "form_data": request.form_data,
        "total_amount": request.total_amount,
        "payment_status": PaymentStatus.PENDING,
        "registration_status": RegistrationStatus.SUBMITTED,
        "payment_id": None,
        "invoice_number": invoice_number,
        "member_id": request.member_id,
        "payment_method": "offline",
        "created_via": "kiosk",
        "created_by_user_id": current_user.id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.registrations.insert_one(registration_doc)
    
    # Update member status for closed group
    if member_doc:
        await db.campaign_members.update_one(
            {"id": request.member_id},
            {"$set": {
                "status": "pending_offline",
                "registration_id": registration_id,
                "registered_at": now.isoformat(),
                "updated_at": now.isoformat()
            }}
        )
    
    details = extract_registrant_details(request.form_data)
    
    logger.info(f"Kiosk registration created: {registration_id} by {current_user.email}")
    
    return {
        "registration_id": registration_id,
        "invoice_number": invoice_number,
        "registrant_name": details["name"],
        "amount_due": request.total_amount,
        "message": "Registration created. Please collect payment."
    }


@router.post("/confirm-payment")
async def confirm_kiosk_payment(
    request: KioskPaymentConfirmRequest,
    current_user: UserInDB = Depends(require_kiosk_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Confirm payment received at the kiosk.
    Updates registration status to completed and generates receipt.
    """
    registration = await db.registrations.find_one({"id": request.registration_id})
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Check kiosk volunteer access
    campaign_id = registration["campaign_id"]
    if current_user.role == UserRole.KIOSK_VOLUNTEER:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
    
    if registration.get("payment_status") == PaymentStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment already confirmed"
        )
    
    now = datetime.now(timezone.utc)
    receipt_number = generate_receipt_number()
    
    # Update registration
    await db.registrations.update_one(
        {"id": request.registration_id},
        {"$set": {
            "payment_status": PaymentStatus.COMPLETED,
            "registration_status": RegistrationStatus.CONFIRMED,
            "payment_method": "offline",
            "offline_payment_confirmed": True,
            "offline_payment_confirmed_by": current_user.id,
            "offline_payment_confirmed_at": now.isoformat(),
            "offline_amount_received": request.amount_received,
            "offline_payment_type": request.payment_method,
            "offline_receipt_number": receipt_number,
            "offline_payment_notes": request.notes,
            "payment_id": f"KIOSK_{receipt_number}",
            "checked_in": True,
            "checked_in_at": now.isoformat(),
            "checked_in_by": current_user.id,
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
    
    # Update member status for closed group
    if registration.get("member_id"):
        await db.campaign_members.update_one(
            {"id": registration["member_id"]},
            {"$set": {
                "status": "registered",
                "updated_at": now.isoformat()
            }}
        )
    
    details = extract_registrant_details(registration.get("form_data", {}))
    
    logger.info(f"Kiosk payment confirmed: {receipt_number} by {current_user.email}")
    
    return {
        "registration_id": request.registration_id,
        "receipt_number": receipt_number,
        "registrant_name": details["name"],
        "amount_received": request.amount_received,
        "payment_method": request.payment_method,
        "confirmed_at": now.isoformat(),
        "message": "Payment confirmed successfully!"
    }


@router.post("/check-in")
async def kiosk_check_in(
    request: KioskCheckInRequest,
    current_user: UserInDB = Depends(require_kiosk_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Check in a registrant who has already paid.
    Marks attendance for the event.
    """
    registration = await db.registrations.find_one({"id": request.registration_id})
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Check kiosk volunteer access
    campaign_id = registration["campaign_id"]
    if current_user.role == UserRole.KIOSK_VOLUNTEER:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
    
    if registration.get("checked_in"):
        return {
            "registration_id": request.registration_id,
            "message": "Already checked in",
            "checked_in_at": registration.get("checked_in_at")
        }
    
    now = datetime.now(timezone.utc)
    
    await db.registrations.update_one(
        {"id": request.registration_id},
        {"$set": {
            "checked_in": True,
            "checked_in_at": now.isoformat(),
            "checked_in_by": current_user.id,
            "updated_at": now.isoformat()
        }}
    )
    
    details = extract_registrant_details(registration.get("form_data", {}))
    
    return {
        "registration_id": request.registration_id,
        "registrant_name": details["name"],
        "message": "Check-in successful!",
        "checked_in_at": now.isoformat()
    }


@router.get("/campaigns/{campaign_id}/stats")
async def get_kiosk_stats(
    campaign_id: str,
    current_user: UserInDB = Depends(require_kiosk_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get real-time statistics for the kiosk dashboard.
    Shows check-ins, pending payments, and revenue.
    """
    # Check kiosk volunteer access
    if current_user.role == UserRole.KIOSK_VOLUNTEER:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
    
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Get registration stats
    all_registrations = await db.registrations.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).to_list(10000)
    
    total_registrations = len(all_registrations)
    checked_in = sum(1 for r in all_registrations if r.get("checked_in"))
    pending_payment = sum(1 for r in all_registrations if r.get("payment_status") == "pending")
    completed_payments = sum(1 for r in all_registrations if r.get("payment_status") == "completed")
    
    # Calculate revenue from kiosk
    kiosk_revenue = sum(
        r.get("offline_amount_received", 0) 
        for r in all_registrations 
        if r.get("created_via") == "kiosk" and r.get("payment_status") == "completed"
    )
    
    total_revenue = campaign.get("total_revenue", 0)
    
    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name"),
        "stats": {
            "total_registrations": total_registrations,
            "checked_in": checked_in,
            "pending_check_in": completed_payments - checked_in,
            "pending_payment": pending_payment,
            "completed_payments": completed_payments,
            "total_revenue": total_revenue,
            "kiosk_revenue": kiosk_revenue
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }


@router.post("/verify-otp")
async def verify_otp_at_kiosk(
    otp: str,
    campaign_id: str,
    current_user: UserInDB = Depends(require_kiosk_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Verify OTP for offline registrations at the kiosk.
    Returns registration details for payment confirmation.
    """
    # Check kiosk volunteer access
    if current_user.role == UserRole.KIOSK_VOLUNTEER:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
    
    registration = await db.registrations.find_one({
        "offline_otp": otp,
        "campaign_id": campaign_id,
        "payment_method": "offline",
        "offline_payment_confirmed": {"$ne": True}
    })
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid OTP or registration not found"
        )
    
    details = extract_registrant_details(registration.get("form_data", {}))
    
    return {
        "registration_id": registration["id"],
        "registrant_name": details["name"],
        "registrant_email": details["email"],
        "registrant_phone": details["phone"],
        "amount_due": registration.get("total_amount", 0),
        "form_data": registration.get("form_data", {}),
        "otp_verified": True
    }
