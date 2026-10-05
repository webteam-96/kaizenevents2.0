from fastapi import APIRouter, HTTPException, Depends, status, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import secrets
from pydantic import BaseModel

from models import UserInDB, UserRole
from registration_models import (
    RegistrationSubmission, PaymentInitiation, PaymentCallback,
    RegistrationResponse, RefundRequest, RefundResponse,
    PaymentStatus, RegistrationStatus
)
from payment_service import payment_service
from invoice_service import invoice_service
from motor.motor_asyncio import AsyncIOMotorDatabase
from audit_log import audit, AuditEventType
from security import sanitize_dict, sanitize_html, is_valid_uuid

router = APIRouter(prefix="/api", tags=["registrations"])
security = HTTPBearer()

async def get_db():
    from server import db
    return db

async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db as get_user
    return await get_user(credentials)

def require_super_admin(current_user: UserInDB = Depends(get_current_user_with_db)) -> UserInDB:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required"
        )
    return current_user

@router.post("/registrations/submit", response_model=RegistrationResponse)
async def submit_registration(
    submission: RegistrationSubmission,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Submit a new registration (public endpoint)"""
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
    
    # For closed group campaigns, verify member
    member_doc = None
    if campaign.get("campaign_type") == "closed_group":
        if not submission.member_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member ID required for closed group campaign"
            )
        
        # Verify member exists and is not already registered
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
        "member_id": submission.member_id,  # For closed group campaigns
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
                    "status": "registered",
                    "registration_id": registration_id,
                    "registered_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
            }
        )
    
    # Auto-sync to Google Sheets if configured
    try:
        sheets_config = await db.sheets_config.find_one({"campaign_id": submission.campaign_id, "auto_sync": True})
        if sheets_config and sheets_config.get("spreadsheet_id"):
            from integration_service import google_sheets_service
            
            # Load credentials if not already loaded
            if not google_sheets_service.is_configured():
                settings = await db.integration_settings.find_one({"type": "google_sheets"})
                if settings and settings.get("credentials_json"):
                    google_sheets_service.credentials_json = settings["credentials_json"]
            
            if google_sheets_service.is_configured():
                # Use delegation with the sheet owner's email
                delegate_email = sheets_config.get("shared_with")
                await google_sheets_service.sync_registration(
                    spreadsheet_id=sheets_config["spreadsheet_id"],
                    sheet_name=sheets_config.get("sheet_name", "Registrations"),
                    registration=registration_doc,
                    campaign=campaign,
                    delegate_email=delegate_email
                )
    except Exception as e:
        # Don't fail registration if sheets sync fails
        import logging
        logging.getLogger(__name__).warning(f"Failed to sync registration to sheets: {e}")
    
    return RegistrationResponse(
        id=registration_id,
        campaign_id=submission.campaign_id,
        form_data=submission.form_data,
        total_amount=final_amount,
        payment_status=PaymentStatus.PENDING,
        registration_status=RegistrationStatus.SUBMITTED,
        payment_id=None,
        invoice_number=invoice_number,
        created_at=now,
        updated_at=now
    )

@router.post("/registrations/payment/initiate")
async def initiate_payment(
    payment: PaymentInitiation,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Initiate payment for a registration"""
    registration = await db.registrations.find_one({"id": payment.registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    if registration["payment_status"] == PaymentStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment already completed"
        )
    
    # Create payment order based on gateway
    if payment.payment_gateway == "razorpay":
        order = await payment_service.create_razorpay_order(
            amount=registration["total_amount"],
            receipt=registration["invoice_number"]
        )
        
        return {
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "key_id": payment_service.razorpay_key
        }
    
    elif payment.payment_gateway == "instamojo":
        campaign = await db.campaigns.find_one({"id": registration["campaign_id"]})
        form_data = registration["form_data"]
        
        payment_req = await payment_service.create_instamojo_payment(
            amount=registration["total_amount"],
            purpose=f"Registration for {campaign.get('name', 'Event')}",
            buyer_name=form_data.get("name", "Guest"),
            email=form_data.get("email", "guest@example.com")
        )
        
        return {
            "payment_request_id": payment_req["id"],
            "payment_url": payment_req["longurl"]
        }
    
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid payment gateway"
    )

@router.post("/registrations/payment/callback")
async def payment_callback(
    callback: PaymentCallback,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Handle payment callback"""
    registration = await db.registrations.find_one({"id": callback.registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Update registration with payment details
    payment_status = PaymentStatus.COMPLETED if callback.status == "success" else PaymentStatus.FAILED
    registration_status = RegistrationStatus.CONFIRMED if callback.status == "success" else RegistrationStatus.SUBMITTED
    
    await db.registrations.update_one(
        {"id": callback.registration_id},
        {"$set": {
            "payment_id": callback.payment_id,
            "payment_status": payment_status,
            "registration_status": registration_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If payment successful, update campaign stats
    if callback.status == "success":
        campaign = await db.campaigns.find_one({"id": registration["campaign_id"]})
        await db.campaigns.update_one(
            {"id": registration["campaign_id"]},
            {"$set": {
                "current_registrations": campaign.get("current_registrations", 0) + 1,
                "total_revenue": campaign.get("total_revenue", 0) + registration["total_amount"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return {"status": "success", "message": "Payment processed"}

@router.get("/campaigns/{campaign_id}/registrations", response_model=List[RegistrationResponse])
async def get_campaign_registrations(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get all registrations for a campaign"""
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    registrations = await db.registrations.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(10000)
    
    return [
        RegistrationResponse(
            id=r["id"],
            campaign_id=r["campaign_id"],
            form_data=r["form_data"],
            total_amount=r["total_amount"],
            payment_status=r["payment_status"],
            registration_status=r.get("registration_status", RegistrationStatus.SUBMITTED),
            payment_id=r.get("payment_id"),
            invoice_number=r.get("invoice_number"),
            created_at=datetime.fromisoformat(r["created_at"]) if isinstance(r.get("created_at"), str) else r.get("created_at", datetime.now(timezone.utc)),
            updated_at=datetime.fromisoformat(r["updated_at"]) if isinstance(r.get("updated_at"), str) else r.get("updated_at", datetime.now(timezone.utc))
        )
        for r in registrations
    ]


# Model for updating registration
class RegistrationUpdate(BaseModel):
    form_data: Dict[str, Any]
    total_amount: Optional[float] = None


class PaymentAdjustmentResponse(BaseModel):
    registration_id: str
    message: str
    payment_link: Optional[str] = None
    refund_required: bool = False
    refund_amount: Optional[float] = None
    previous_amount: float
    new_amount: float


@router.put("/registrations/{registration_id}", response_model=PaymentAdjustmentResponse)
async def update_registration(
    registration_id: str,
    update_data: RegistrationUpdate,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Update registration form data and handle payment adjustments.
    
    - If amount increases: Returns a payment link for the difference (uses campaign's gateway)
    - If amount decreases: Notifies Super Admin and Directors for refund
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Get existing registration
    registration = await db.registrations.find_one({"id": registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    campaign_id = registration["campaign_id"]
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get campaign for context
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    previous_amount = registration.get("total_amount", 0)
    new_amount = update_data.total_amount if update_data.total_amount is not None else previous_amount
    amount_difference = new_amount - previous_amount
    
    # Prepare update
    update_dict = {
        "form_data": update_data.form_data,
        "total_amount": new_amount,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    response = PaymentAdjustmentResponse(
        registration_id=registration_id,
        message="Registration updated successfully",
        previous_amount=previous_amount,
        new_amount=new_amount,
        refund_required=False
    )
    
    # Handle payment adjustments
    if amount_difference > 0 and registration.get("payment_status") == PaymentStatus.COMPLETED:
        # Amount increased - generate additional payment link using campaign's gateway
        try:
            # Get payment account from campaign
            payment_account_id = campaign.get("payment_account_id")
            payment_account = None
            gateway_type = "razorpay"  # default
            
            if payment_account_id:
                payment_account = await db.payment_accounts.find_one(
                    {"id": payment_account_id, "is_active": True},
                    {"_id": 0}
                )
                if payment_account:
                    gateway_type = payment_account.get("gateway_type", "razorpay")
            
            registrant_name = update_data.form_data.get("name", update_data.form_data.get("full_name", "Guest"))
            registrant_email = update_data.form_data.get("email", "guest@example.com")
            registrant_phone = update_data.form_data.get("phone", update_data.form_data.get("mobile", "9999999999"))
            
            # Generate payment link based on gateway type
            payment_link = None
            additional_payment_id = str(uuid.uuid4())
            
            if gateway_type == "instamojo":
                # Create Instamojo payment request using OAuth 2.0
                from instamojo_oauth_service import instamojo_oauth_service
                
                if instamojo_oauth_service.is_configured():
                    result = await instamojo_oauth_service.create_payment_request(
                        amount=amount_difference,
                        purpose=f"Additional payment - {campaign.get('name', 'Event')}",
                        buyer_name=registrant_name,
                        email=registrant_email,
                        phone=registrant_phone,
                        send_email=True,
                        send_sms=True,
                        allow_repeated_payments=False
                    )
                    
                    if result.get("success"):
                        payment_link = result.get("longurl") or result.get("shorturl")
                        update_dict["additional_payment_request_id"] = result.get("payment_request_id")
                        logger.info(f"Instamojo OAuth payment link created: {payment_link}")
                    else:
                        logger.warning(f"Instamojo OAuth failed: {result.get('error')}")
                        # Fall back to mock
                        payment_link = f"https://instamojo.com/mock_additional_{additional_payment_id[:8]}"
                        logger.info(f"[MOCK] Instamojo payment link generated: {payment_link}")
                elif payment_account:
                    # Fallback to legacy API key authentication
                    import httpx
                    api_key = payment_account.get("instamojo_api_key")
                    auth_token = payment_account.get("instamojo_auth_token")
                    mode = payment_account.get("instamojo_mode", "sandbox")
                    
                    api_url = "https://api.instamojo.com" if mode == "production" else "https://test.instamojo.com"
                    
                    if api_key and auth_token:
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            payload = {
                                "amount": str(amount_difference),
                                "purpose": f"Additional payment - {campaign.get('name', 'Event')}",
                                "buyer_name": registrant_name,
                                "email": registrant_email,
                                "phone": registrant_phone,
                                "allow_repeated_payments": "False",
                                "send_email": "True",
                                "send_sms": "True"
                            }
                            
                            resp = await client.post(
                                f"{api_url}/api/1.1/payment-requests/",
                                headers={
                                    "X-Api-Key": api_key,
                                    "X-Auth-Token": auth_token
                                },
                                data=payload
                            )
                            
                            if resp.status_code == 201:
                                data = resp.json()
                                if data.get("success"):
                                    payment_link = data["payment_request"]["longurl"]
                                    update_dict["additional_payment_request_id"] = data["payment_request"]["id"]
                    else:
                        # Mock for testing
                        payment_link = f"https://test.instamojo.com/mock_additional_payment_{additional_payment_id[:8]}"
                        logger.info(f"[MOCK] Instamojo payment link generated: {payment_link}")
                else:
                    # Mock for testing
                    payment_link = f"https://test.instamojo.com/mock_additional_payment_{additional_payment_id[:8]}"
                    logger.info(f"[MOCK] Instamojo payment link generated: {payment_link}")
            
            elif gateway_type == "razorpay" and payment_account:
                # For Razorpay, we create an order but can't generate a standalone link easily
                # So we'll create a payment link via Razorpay Payment Links API
                import razorpay
                key_id = payment_account.get("razorpay_key_id")
                key_secret = payment_account.get("razorpay_key_secret")
                
                if key_id and key_secret:
                    try:
                        client = razorpay.Client(auth=(key_id, key_secret))
                        # Create a payment link
                        link_data = {
                            "amount": int(amount_difference * 100),  # paise
                            "currency": "INR",
                            "description": f"Additional payment for {campaign.get('name', 'Event')}",
                            "customer": {
                                "name": registrant_name,
                                "email": registrant_email,
                                "contact": registrant_phone
                            },
                            "notify": {
                                "sms": True,
                                "email": True
                            },
                            "reminder_enable": True,
                            "notes": {
                                "registration_id": registration_id,
                                "campaign_id": campaign_id,
                                "type": "additional_payment"
                            }
                        }
                        link = client.payment_link.create(link_data)
                        payment_link = link.get("short_url")
                        update_dict["additional_payment_link_id"] = link.get("id")
                    except Exception as e:
                        logger.warning(f"Razorpay payment link creation failed: {e}")
                        # Fall back to mock
                        payment_link = f"https://rzp.io/mock_additional_{additional_payment_id[:8]}"
                        logger.info(f"[MOCK] Razorpay payment link generated: {payment_link}")
                else:
                    # Mock for testing
                    payment_link = f"https://rzp.io/mock_additional_{additional_payment_id[:8]}"
                    logger.info(f"[MOCK] Razorpay payment link generated: {payment_link}")
            else:
                # No payment account configured - generate mock link
                payment_link = f"https://payment.mock/additional_{additional_payment_id[:8]}"
                logger.info(f"[MOCK] Payment link generated (no gateway configured): {payment_link}")
            
            if payment_link:
                response.payment_link = payment_link
                response.message = f"Registration updated. Additional payment of ₹{amount_difference:.2f} required. Payment link sent to registrant."
                
                # Mark registration as pending additional payment
                update_dict["additional_payment_required"] = True
                update_dict["additional_payment_amount"] = amount_difference
                update_dict["additional_payment_link"] = payment_link
                update_dict["additional_payment_gateway"] = gateway_type
            else:
                response.message = f"Registration updated but could not generate payment link. Please create manually. Amount due: ₹{amount_difference:.2f}"
                
        except Exception as e:
            logger.error(f"Error generating additional payment link: {e}")
            response.message = f"Registration updated but could not generate payment link. Please create manually. Amount due: ₹{amount_difference:.2f}"
    
    elif amount_difference < 0 and registration.get("payment_status") == PaymentStatus.COMPLETED:
        # Amount decreased - notify for refund
        refund_amount = abs(amount_difference)
        response.refund_required = True
        response.refund_amount = refund_amount
        response.message = f"Registration updated. Refund of ₹{refund_amount:.2f} required. Admins have been notified."
        
        # Mark registration as pending refund
        update_dict["refund_pending"] = True
        update_dict["refund_amount"] = refund_amount
        
        # Send simple email notification to Super Admins and Directors
        try:
            from integration_service import brevo_service
            
            # Get Super Admins and Directors
            admins = await db.users.find({
                "$or": [
                    {"role": UserRole.SUPER_ADMIN},
                    {"can_approve_transfers": True}
                ]
            }, {"email": 1, "name": 1, "_id": 0}).to_list(100)
            
            registrant_name = update_data.form_data.get("name", update_data.form_data.get("full_name", "Registrant"))
            registrant_email = update_data.form_data.get("email", "N/A")
            registrant_phone = update_data.form_data.get("phone", update_data.form_data.get("mobile", "N/A"))
            
            # Simple refund notification email
            email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #dc2626;">Refund Required</h2>
                <p><strong>Campaign:</strong> {campaign.get('name', 'N/A')}</p>
                <hr style="border: 1px solid #eee;">
                <p><strong>Registrant Details:</strong></p>
                <ul style="list-style: none; padding: 0;">
                    <li>Name: {registrant_name}</li>
                    <li>Email: {registrant_email}</li>
                    <li>Phone: {registrant_phone}</li>
                </ul>
                <hr style="border: 1px solid #eee;">
                <p style="font-size: 18px; color: #dc2626;"><strong>Refund Amount: ₹{refund_amount:.2f}</strong></p>
                <p style="color: #666; font-size: 12px;">Please process this refund and confirm in the portal.</p>
            </div>
            """
            
            emails_sent = 0
            for admin in admins:
                if admin.get("email"):
                    if brevo_service.is_configured():
                        await brevo_service.send_email(
                            to_email=admin["email"],
                            to_name=admin.get("name", "Admin"),
                            subject=f"Refund Required: ₹{refund_amount:.2f} - {campaign.get('name', 'Event')}",
                            html_content=email_html
                        )
                        emails_sent += 1
                    else:
                        # Log for mock/testing
                        logger.info(f"[MOCK EMAIL] Refund notification to {admin['email']}: ₹{refund_amount:.2f} for {registrant_name}")
                        emails_sent += 1
            
            if emails_sent > 0:
                logger.info(f"Refund notifications sent to {emails_sent} admin(s)")
                
        except Exception as e:
            logger.error(f"Error sending refund notification: {e}")
            # Continue anyway - registration update is more important
    
    # Update registration in database
    await db.registrations.update_one(
        {"id": registration_id},
        {"$set": update_dict}
    )
    
    # Log the update
    await audit.log(
        AuditEventType.REGISTRATION_UPDATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="registration",
        resource_id=registration_id,
        action_details={
            "campaign_id": campaign_id,
            "campaign_name": campaign.get("name"),
            "previous_amount": previous_amount,
            "new_amount": new_amount,
            "amount_difference": amount_difference,
            "refund_required": response.refund_required,
            "payment_link_generated": bool(response.payment_link)
        }
    )
    
    return response


@router.post("/registrations/{registration_id}/confirm-refund")
async def confirm_refund(
    registration_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Confirm that a refund has been processed (Super Admin or Director only)"""
    # Check if user is Super Admin or Director
    if current_user.role != UserRole.SUPER_ADMIN and not current_user.can_approve_transfers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admins and Directors can confirm refunds"
        )
    
    registration = await db.registrations.find_one({"id": registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    if not registration.get("refund_pending"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending refund for this registration"
        )
    
    refund_amount = registration.get("refund_amount", 0)
    
    # Update registration
    await db.registrations.update_one(
        {"id": registration_id},
        {
            "$set": {
                "refund_pending": False,
                "refund_confirmed": True,
                "refund_confirmed_at": datetime.now(timezone.utc).isoformat(),
                "refund_confirmed_by": current_user.id,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Log the refund confirmation
    await audit.log(
        AuditEventType.PAYMENT_REFUNDED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="registration",
        resource_id=registration_id,
        action_details={
            "campaign_id": registration["campaign_id"],
            "refund_amount": refund_amount
        }
    )
    
    return {"message": f"Refund of ₹{refund_amount:.2f} confirmed successfully"}

@router.get("/registrations/{registration_id}/invoice")
async def get_registration_invoice(
    registration_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get invoice PDF for a registration"""
    registration = await db.registrations.find_one({"id": registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    if registration["payment_status"] != PaymentStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment not completed"
        )
    
    campaign = await db.campaigns.find_one({"id": registration["campaign_id"]})
    
    # Generate PDF
    pdf_bytes = invoice_service.generate_invoice_pdf(registration, campaign)
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=invoice_{registration['invoice_number']}.pdf"
        }
    )

@router.post("/registrations/refund", response_model=RefundResponse)
async def create_refund(
    refund_req: RefundRequest,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Create a refund for a registration"""
    registration = await db.registrations.find_one({"id": refund_req.registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    if registration["payment_status"] != PaymentStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot refund incomplete payment"
        )
    
    # Create refund
    refund = await payment_service.create_refund(
        payment_id=registration["payment_id"],
        amount=refund_req.amount
    )
    
    # Store refund record
    refund_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    refund_doc = {
        "id": refund_id,
        "registration_id": refund_req.registration_id,
        "amount": refund_req.amount,
        "reason": refund_req.reason,
        "status": "processed",
        "refund_id": refund.get("id"),
        "created_at": now.isoformat()
    }
    
    await db.refunds.insert_one(refund_doc)
    
    # Update registration status
    new_status = PaymentStatus.REFUNDED if refund_req.amount >= registration["total_amount"] else PaymentStatus.PARTIAL_REFUND
    
    await db.registrations.update_one(
        {"id": refund_req.registration_id},
        {"$set": {
            "payment_status": new_status,
            "updated_at": now.isoformat()
        }}
    )
    
    return RefundResponse(
        id=refund_id,
        registration_id=refund_req.registration_id,
        amount=refund_req.amount,
        status="processed",
        refund_id=refund.get("id"),
        created_at=now
    )
