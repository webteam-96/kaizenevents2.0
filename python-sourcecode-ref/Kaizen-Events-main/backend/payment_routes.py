from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi import status as http_status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import RedirectResponse
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
import uuid
import hmac
import hashlib
import json
from datetime import datetime, timezone
import httpx
import razorpay
import logging
import os

from models import UserInDB
from settlement_service import SettlementService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payments", tags=["payments"])
security = HTTPBearer(auto_error=False)

# ==================== MODELS ====================

class PaymentCreateRequest(BaseModel):
    """Request to create a payment for registration"""
    campaign_id: str
    registration_id: str
    amount: float = Field(..., gt=0)
    buyer_name: str = Field(..., min_length=1)
    buyer_email: EmailStr
    buyer_phone: str = Field(..., min_length=10, max_length=15)
    purpose: str = "Event Registration"
    redirect_url: Optional[str] = None

class PaymentResponse(BaseModel):
    """Response after creating payment"""
    payment_id: str
    gateway: str  # 'razorpay' or 'instamojo'
    payment_url: Optional[str] = None  # For Instamojo redirect
    order_id: Optional[str] = None  # For Razorpay
    razorpay_key_id: Optional[str] = None  # For Razorpay frontend
    amount: float
    currency: str = "INR"
    status: str = "pending"

class RazorpayVerifyRequest(BaseModel):
    """Razorpay payment verification request"""
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    payment_id: str  # Our internal payment ID

class PaymentStatusResponse(BaseModel):
    """Payment status response"""
    payment_id: str
    status: str
    gateway: str
    amount: float
    gateway_payment_id: Optional[str] = None
    paid_at: Optional[datetime] = None

# ==================== HELPERS ====================

async def get_db():
    from server import db
    return db

async def get_payment_account(db, account_id: str):
    """Get payment account with credentials"""
    account = await db.payment_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Payment account not found")
    if not account.get("is_active"):
        raise HTTPException(status_code=400, detail="Payment account is not active")
    return account


async def fetch_and_store_gateway_fees(
    payment_id: str,
    gateway: str,
    gateway_payment_id: str,
    payment_account: dict
):
    """
    Background task to fetch actual gateway fees and store them.
    Called automatically after payment verification.
    """
    db = await get_db()
    
    try:
        settlement_data = None
        
        if gateway == "instamojo":
            settlement_data = await SettlementService.get_instamojo_payment_details(
                api_key=payment_account.get("instamojo_api_key"),
                auth_token=payment_account.get("instamojo_auth_token"),
                payment_id=gateway_payment_id,
                mode=payment_account.get("instamojo_mode", "sandbox")
            )
        elif gateway == "razorpay":
            settlement_data = SettlementService.get_razorpay_payment_details(
                key_id=payment_account.get("razorpay_key_id"),
                key_secret=payment_account.get("razorpay_key_secret"),
                payment_id=gateway_payment_id
            )
        
        if settlement_data:
            # Update payment record with gateway fee data
            update_data = {
                "gateway_fee": settlement_data.get("fees", 0),
                "gateway_tax": settlement_data.get("tax", 0),
                "settlement_amount": settlement_data.get("settlement_amount", 0),
                "settlement_status": "settled" if settlement_data.get("settled") else "pending",
                "settlement_synced_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.payments.update_one(
                {"id": payment_id},
                {"$set": update_data}
            )
            
            logger.info(f"Gateway fees stored for payment {payment_id}: fee={update_data['gateway_fee']}")
        else:
            logger.warning(f"Could not fetch gateway fees for payment {payment_id}")
            
    except Exception as e:
        logger.error(f"Error fetching gateway fees for payment {payment_id}: {str(e)}")


async def get_campaign_payment_config(db, campaign_id: str):
    """Get campaign and its associated payment account"""
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    payment_account_id = campaign.get("payment_account_id")
    if not payment_account_id:
        raise HTTPException(status_code=400, detail="No payment account configured for this campaign")
    
    payment_account = await get_payment_account(db, payment_account_id)
    return campaign, payment_account

def get_instamojo_api_url(mode: str) -> str:
    """Get Instamojo API URL based on mode"""
    if mode == "production":
        return "https://api.instamojo.com"
    return "https://test.instamojo.com"

def get_redirect_base_url():
    """Get the base URL for redirects (frontend URL without /api)"""
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "https://kioskflow.preview.emergentagent.com")
    # Remove /api if present to get the frontend base URL
    return backend_url.replace('/api', '')

# ==================== RAZORPAY INTEGRATION ====================

async def create_razorpay_order(payment_account: dict, amount: float, receipt: str, notes: dict) -> dict:
    """Create Razorpay order"""
    key_id = payment_account.get("razorpay_key_id")
    key_secret = payment_account.get("razorpay_key_secret")
    
    if not key_id or not key_secret:
        raise HTTPException(status_code=400, detail="Razorpay credentials not configured")
    
    client = razorpay.Client(auth=(key_id, key_secret))
    
    # Amount in paise
    amount_paise = int(amount * 100)
    
    order_data = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "notes": notes
    }
    
    try:
        order = client.order.create(data=order_data)
        return order
    except Exception as e:
        logger.error(f"Razorpay order creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment order: {str(e)}")

def verify_razorpay_signature(payment_account: dict, order_id: str, payment_id: str, signature: str) -> bool:
    """Verify Razorpay payment signature"""
    key_secret = payment_account.get("razorpay_key_secret")
    
    message = f"{order_id}|{payment_id}"
    expected_signature = hmac.new(
        key_secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)

# ==================== INSTAMOJO INTEGRATION ====================

# Import OAuth service for new integration
from instamojo_oauth_service import instamojo_oauth_service

async def create_instamojo_payment_request(
    payment_account: dict,
    amount: float,
    purpose: str,
    buyer_name: str,
    buyer_email: str,
    buyer_phone: str,
    redirect_url: str,
    webhook_url: str
) -> dict:
    """
    Create Instamojo payment request
    Supports both OAuth 2.0 (preferred) and legacy API key authentication
    """
    # Check if OAuth is configured (preferred method)
    if instamojo_oauth_service.is_configured():
        logger.info("Using Instamojo OAuth 2.0 authentication")
        result = await instamojo_oauth_service.create_payment_request(
            amount=amount,
            purpose=purpose,
            buyer_name=buyer_name,
            email=buyer_email,
            phone=buyer_phone,
            redirect_url=redirect_url,
            webhook_url=webhook_url,
            send_email=True,
            send_sms=True,
            allow_repeated_payments=False
        )
        
        if result.get("success"):
            return {
                "success": True,
                "payment_request_id": result.get("payment_request_id"),
                "longurl": result.get("longurl"),
                "shorturl": result.get("shorturl")
            }
        else:
            error_msg = result.get("error", "Failed to create payment request")
            logger.error(f"Instamojo OAuth error: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
    
    # Fallback to legacy API key authentication
    api_key = payment_account.get("instamojo_api_key")
    auth_token = payment_account.get("instamojo_auth_token")
    mode = payment_account.get("instamojo_mode", "sandbox")
    
    if not api_key or not auth_token:
        raise HTTPException(status_code=400, detail="Instamojo credentials not configured")
    
    logger.info("Using Instamojo legacy API key authentication")
    api_url = get_instamojo_api_url(mode)
    
    headers = {
        "X-Api-Key": api_key,
        "X-Auth-Token": auth_token
    }
    
    payload = {
        "amount": str(amount),
        "purpose": purpose,
        "buyer_name": buyer_name,
        "email": buyer_email,
        "phone": buyer_phone,
        "redirect_url": redirect_url,
        "webhook": webhook_url,
        "allow_repeated_payments": "False"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{api_url}/api/1.1/payment-requests/",
                headers=headers,
                data=payload
            )
            
            data = response.json()
            
            if response.status_code == 201 and data.get("success"):
                return {
                    "success": True,
                    "payment_request_id": data["payment_request"]["id"],
                    "longurl": data["payment_request"]["longurl"],
                    "shorturl": data["payment_request"].get("shorturl")
                }
            else:
                error_msg = data.get("message", "Failed to create payment request")
                logger.error(f"Instamojo error: {error_msg}")
                raise HTTPException(status_code=400, detail=error_msg)
                
        except httpx.HTTPError as e:
            logger.error(f"Instamojo HTTP error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Payment gateway error: {str(e)}")

def verify_instamojo_webhook(payment_account: dict, payload: dict, received_mac: str) -> bool:
    """Verify Instamojo webhook signature"""
    salt = payment_account.get("instamojo_salt")
    
    if not salt:
        logger.warning("Instamojo salt not configured, skipping MAC verification")
        return True  # Allow if salt not configured (not recommended for production)
    
    # Remove mac from payload
    payload_copy = {k: v for k, v in payload.items() if k != 'mac'}
    
    # Sort keys and concatenate values
    sorted_keys = sorted(payload_copy.keys())
    values_string = "|".join(str(payload_copy[key]) for key in sorted_keys)
    
    # Compute HMAC-SHA1
    computed_mac = hmac.new(
        salt.encode('utf-8'),
        values_string.encode('utf-8'),
        hashlib.sha1
    ).hexdigest()
    
    return hmac.compare_digest(computed_mac, received_mac)

# ==================== ROUTES ====================

@router.post("/create", response_model=PaymentResponse)
async def create_payment(
    payment_request: PaymentCreateRequest,
    request: Request
):
    """Create a payment order/request for registration"""
    db = await get_db()
    
    # Get campaign and payment account
    campaign, payment_account = await get_campaign_payment_config(db, payment_request.campaign_id)
    
    gateway_type = payment_account.get("gateway_type")
    payment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    base_url = get_redirect_base_url()
    
    # Create payment record
    payment_doc = {
        "id": payment_id,
        "campaign_id": payment_request.campaign_id,
        "registration_id": payment_request.registration_id,
        "amount": payment_request.amount,
        "currency": "INR",
        "gateway": gateway_type,
        "payment_account_id": payment_account["id"],
        "buyer_name": payment_request.buyer_name,
        "buyer_email": payment_request.buyer_email,
        "buyer_phone": payment_request.buyer_phone,
        "purpose": payment_request.purpose,
        "status": "pending",
        "gateway_order_id": None,
        "gateway_payment_id": None,
        "gateway_payment_request_id": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "paid_at": None
    }
    
    if gateway_type == "razorpay":
        # Create Razorpay order
        order = await create_razorpay_order(
            payment_account,
            payment_request.amount,
            receipt=payment_id[:40],
            notes={
                "payment_id": payment_id,
                "campaign_id": payment_request.campaign_id,
                "registration_id": payment_request.registration_id
            }
        )
        
        payment_doc["gateway_order_id"] = order["id"]
        await db.payments.insert_one(payment_doc)
        
        return PaymentResponse(
            payment_id=payment_id,
            gateway="razorpay",
            order_id=order["id"],
            razorpay_key_id=payment_account.get("razorpay_key_id"),
            amount=payment_request.amount,
            status="pending"
        )
    
    elif gateway_type == "instamojo":
        # Create Instamojo payment request
        redirect_url = payment_request.redirect_url or f"{base_url}/payment-callback"
        webhook_url = f"{base_url}/api/payments/webhook/instamojo"
        
        instamojo_response = await create_instamojo_payment_request(
            payment_account,
            payment_request.amount,
            payment_request.purpose,
            payment_request.buyer_name,
            payment_request.buyer_email,
            payment_request.buyer_phone,
            redirect_url,
            webhook_url
        )
        
        payment_doc["gateway_payment_request_id"] = instamojo_response["payment_request_id"]
        await db.payments.insert_one(payment_doc)
        
        return PaymentResponse(
            payment_id=payment_id,
            gateway="instamojo",
            payment_url=instamojo_response["longurl"],
            amount=payment_request.amount,
            status="pending"
        )
    
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported payment gateway: {gateway_type}")

@router.post("/verify/razorpay")
async def verify_razorpay_payment(
    verify_request: RazorpayVerifyRequest,
    background_tasks: BackgroundTasks
):
    """Verify Razorpay payment after completion"""
    db = await get_db()
    
    # Get payment record
    payment = await db.payments.find_one({"id": verify_request.payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    if payment.get("status") == "completed":
        return {"success": True, "message": "Payment already verified", "status": "completed"}
    
    # Get payment account for signature verification
    payment_account = await get_payment_account(db, payment["payment_account_id"])
    
    # Verify signature
    is_valid = verify_razorpay_signature(
        payment_account,
        verify_request.razorpay_order_id,
        verify_request.razorpay_payment_id,
        verify_request.razorpay_signature
    )
    
    if not is_valid:
        # Update payment status to failed
        await db.payments.update_one(
            {"id": verify_request.payment_id},
            {"$set": {"status": "failed", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    
    now = datetime.now(timezone.utc)
    
    # Update payment status
    await db.payments.update_one(
        {"id": verify_request.payment_id},
        {"$set": {
            "status": "completed",
            "gateway_payment_id": verify_request.razorpay_payment_id,
            "updated_at": now.isoformat(),
            "paid_at": now.isoformat()
        }}
    )
    
    # Update registration status
    await db.registrations.update_one(
        {"id": payment["registration_id"]},
        {"$set": {
            "payment_status": "completed",
            "payment_id": verify_request.payment_id,
            "gateway_payment_id": verify_request.razorpay_payment_id,
            "updated_at": now.isoformat()
        }}
    )
    
    # Update campaign stats
    await db.campaigns.update_one(
        {"id": payment["campaign_id"]},
        {
            "$inc": {
                "current_registrations": 1,
                "total_revenue": payment["amount"]
            }
        }
    )
    
    # Update payment account stats
    await db.payment_accounts.update_one(
        {"id": payment["payment_account_id"]},
        {
            "$inc": {
                "total_transactions": 1,
                "total_amount_collected": payment["amount"]
            },
            "$set": {"last_transaction_at": now.isoformat()}
        }
    )
    
    # Fetch and store gateway fees in background (automatic sync)
    background_tasks.add_task(
        fetch_and_store_gateway_fees,
        payment_id=verify_request.payment_id,
        gateway="razorpay",
        gateway_payment_id=verify_request.razorpay_payment_id,
        payment_account=payment_account
    )
    
    logger.info(f"Razorpay payment verified: {verify_request.payment_id}")
    
    return {
        "success": True,
        "message": "Payment verified successfully",
        "status": "completed",
        "payment_id": verify_request.payment_id
    }

@router.post("/webhook/instamojo")
async def instamojo_webhook(request: Request, background_tasks: BackgroundTasks):
    """Handle Instamojo webhook notifications"""
    db = await get_db()
    
    try:
        form_data = await request.form()
        payload = dict(form_data)
        
        logger.info(f"Instamojo webhook received: {payload}")
        
        payment_request_id = payload.get("payment_request_id")
        payment_id = payload.get("payment_id")
        status = payload.get("status", "").lower()
        mac = payload.get("mac")
        
        if not payment_request_id:
            logger.warning("Instamojo webhook missing payment_request_id")
            return {"status": "error", "message": "Missing payment_request_id"}
        
        # Find payment by Instamojo request ID
        payment = await db.payments.find_one(
            {"gateway_payment_request_id": payment_request_id},
            {"_id": 0}
        )
        
        if not payment:
            logger.warning(f"Payment not found for Instamojo request: {payment_request_id}")
            return {"status": "error", "message": "Payment not found"}
        
        # Get payment account for MAC verification
        payment_account = await db.payment_accounts.find_one(
            {"id": payment["payment_account_id"]},
            {"_id": 0}
        )
        
        # Verify MAC if salt is configured
        if payment_account.get("instamojo_salt") and mac:
            if not verify_instamojo_webhook(payment_account, payload, mac):
                logger.warning("Instamojo webhook MAC verification failed")
                return {"status": "error", "message": "Invalid signature"}
        
        now = datetime.now(timezone.utc)
        new_status = "completed" if status == "credit" else "failed"
        
        # Update payment status
        await db.payments.update_one(
            {"id": payment["id"]},
            {"$set": {
                "status": new_status,
                "gateway_payment_id": payment_id,
                "updated_at": now.isoformat(),
                "paid_at": now.isoformat() if new_status == "completed" else None
            }}
        )
        
        if new_status == "completed":
            # Update registration status
            await db.registrations.update_one(
                {"id": payment["registration_id"]},
                {"$set": {
                    "payment_status": "completed",
                    "payment_id": payment["id"],
                    "gateway_payment_id": payment_id,
                    "updated_at": now.isoformat()
                }}
            )
            
            # Update campaign stats
            await db.campaigns.update_one(
                {"id": payment["campaign_id"]},
                {
                    "$inc": {
                        "current_registrations": 1,
                        "total_revenue": payment["amount"]
                    }
                }
            )
            
            # Update payment account stats
            await db.payment_accounts.update_one(
                {"id": payment["payment_account_id"]},
                {
                    "$inc": {
                        "total_transactions": 1,
                        "total_amount_collected": payment["amount"]
                    },
                    "$set": {"last_transaction_at": now.isoformat()}
                }
            )
            
            # Fetch and store gateway fees in background (automatic sync)
            background_tasks.add_task(
                fetch_and_store_gateway_fees,
                payment_id=payment["id"],
                gateway="instamojo",
                gateway_payment_id=payment_id,
                payment_account=payment_account
            )
        
        logger.info(f"Instamojo webhook processed: {payment['id']} - {new_status}")
        
        return {"status": "success", "message": "Webhook processed"}
        
    except Exception as e:
        logger.error(f"Instamojo webhook error: {str(e)}")
        return {"status": "error", "message": str(e)}

@router.get("/callback/instamojo")
async def instamojo_callback(
    payment_id: Optional[str] = None,
    payment_request_id: Optional[str] = None,
    payment_status: Optional[str] = None
):
    """Handle Instamojo redirect callback"""
    db = await get_db()
    base_url = get_redirect_base_url().replace('/api', '')
    
    if not payment_request_id:
        return RedirectResponse(url=f"{base_url}/payment-failed?error=missing_id")
    
    # Find payment
    payment = await db.payments.find_one(
        {"gateway_payment_request_id": payment_request_id},
        {"_id": 0}
    )
    
    if not payment:
        return RedirectResponse(url=f"{base_url}/payment-failed?error=not_found")
    
    # Redirect based on status
    if payment.get("status") == "completed":
        return RedirectResponse(
            url=f"{base_url}/payment-success?payment_id={payment['id']}&registration_id={payment['registration_id']}"
        )
    else:
        return RedirectResponse(
            url=f"{base_url}/payment-status?payment_id={payment['id']}&registration_id={payment['registration_id']}"
        )

@router.get("/status/{payment_id}", response_model=PaymentStatusResponse)
async def get_payment_status(payment_id: str):
    """Get payment status"""
    db = await get_db()
    
    payment = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return PaymentStatusResponse(
        payment_id=payment["id"],
        status=payment["status"],
        gateway=payment["gateway"],
        amount=payment["amount"],
        gateway_payment_id=payment.get("gateway_payment_id"),
        paid_at=datetime.fromisoformat(payment["paid_at"]) if payment.get("paid_at") else None
    )

@router.get("/registration/{registration_id}")
async def get_payment_by_registration(registration_id: str):
    """Get payment details by registration ID"""
    db = await get_db()
    
    payment = await db.payments.find_one(
        {"registration_id": registration_id},
        {"_id": 0}
    )
    
    if not payment:
        return {"payment": None}
    
    return {
        "payment": {
            "id": payment["id"],
            "status": payment["status"],
            "gateway": payment["gateway"],
            "amount": payment["amount"],
            "gateway_payment_id": payment.get("gateway_payment_id"),
            "paid_at": payment.get("paid_at")
        }
    }

# ==================== EXTERNAL FORM WEBHOOK ====================
# This webhook captures payments from external forms (Google Forms, Typeform, etc.)
# that use the same Instamojo account

class ExternalRegistrationData(BaseModel):
    """Data model for external registration webhook"""
    campaign_slug: str  # Campaign to associate with
    buyer_name: str
    buyer_email: EmailStr
    buyer_phone: str
    amount: float
    payment_id: str  # Instamojo payment ID
    payment_request_id: str
    status: str
    extra_data: Optional[dict] = None  # Any additional form data

@router.post("/webhook/instamojo/external/{campaign_slug}")
async def instamojo_external_webhook_for_campaign(
    campaign_slug: str,
    request: Request, 
    background_tasks: BackgroundTasks
):
    """
    Handle Instamojo webhook for EXTERNAL FORM payments for a SPECIFIC campaign.
    
    Each campaign has its own unique webhook URL:
    https://your-domain.com/api/payments/webhook/instamojo/external/{campaign-slug}
    
    Example: /api/payments/webhook/instamojo/external/annual-conference-2025
    
    Set this campaign-specific URL in your Instamojo payment link settings.
    This ensures payments are captured ONLY for this specific event.
    """
    db = await get_db()
    
    try:
        form_data = await request.form()
        payload = dict(form_data)
        
        logger.info(f"External Instamojo webhook for campaign '{campaign_slug}': {payload}")
        
        payment_request_id = payload.get("payment_request_id")
        payment_id = payload.get("payment_id")
        status = payload.get("status", "").lower()
        amount = float(payload.get("amount", 0))
        buyer_name = payload.get("buyer_name", "External User")
        buyer_email = payload.get("buyer", "")  # Instamojo uses 'buyer' for email
        buyer_phone = payload.get("buyer_phone", "")
        purpose = payload.get("purpose", "")
        
        if not payment_request_id or not payment_id:
            logger.warning("External webhook missing payment IDs")
            return {"status": "error", "message": "Missing payment IDs"}
        
        # Check if this payment already exists
        existing_payment = await db.payments.find_one(
            {"$or": [
                {"gateway_payment_request_id": payment_request_id},
                {"gateway_payment_id": payment_id}
            ]},
            {"_id": 0}
        )
        
        if existing_payment:
            logger.info(f"Payment already tracked: {payment_id}")
            return {"status": "success", "message": "Payment already tracked"}
        
        # Only process successful payments
        if status != "credit":
            logger.info(f"Ignoring non-credit payment: {payment_id} - {status}")
            return {"status": "success", "message": "Non-credit payment ignored"}
        
        # Find the specific campaign by slug
        campaign = await db.campaigns.find_one(
            {"slug": campaign_slug},
            {"_id": 0}
        )
        
        if not campaign:
            logger.error(f"Campaign not found: {campaign_slug}")
            return {"status": "error", "message": f"Campaign '{campaign_slug}' not found"}
        
        # Check if campaign is active
        if campaign.get("status") != "active":
            logger.warning(f"Payment received for inactive campaign: {campaign_slug}")
            # Still record it but flag it
        
        now = datetime.now(timezone.utc)
        
        # Create registration
        registration_id = str(uuid.uuid4())
        registration_doc = {
            "id": registration_id,
            "campaign_id": campaign["id"],
            "form_data": {
                "name": buyer_name,
                "email": buyer_email,
                "phone": buyer_phone,
                "source": "external_form",
                "external_purpose": purpose
            },
            "total_amount": amount,
            "payment_status": "completed",
            "registration_status": "confirmed",
            "payment_gateway": "instamojo",
            "gateway_payment_id": payment_id,
            "source": "external",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await db.registrations.insert_one(registration_doc)
        
        # Create payment record
        payment_doc = {
            "id": str(uuid.uuid4()),
            "campaign_id": campaign["id"],
            "registration_id": registration_id,
            "amount": amount,
            "currency": "INR",
            "gateway": "instamojo",
            "payment_account_id": campaign.get("payment_account_id"),
            "buyer_name": buyer_name,
            "buyer_email": buyer_email,
            "buyer_phone": buyer_phone,
            "purpose": purpose,
            "status": "completed",
            "gateway_payment_id": payment_id,
            "gateway_payment_request_id": payment_request_id,
            "source": "external",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "paid_at": now.isoformat()
        }
        
        await db.payments.insert_one(payment_doc)
        
        # Update campaign stats
        await db.campaigns.update_one(
            {"id": campaign["id"]},
            {
                "$inc": {
                    "current_registrations": 1,
                    "total_revenue": amount
                }
            }
        )
        
        # Update payment account stats if configured
        if campaign.get("payment_account_id"):
            await db.payment_accounts.update_one(
                {"id": campaign["payment_account_id"]},
                {
                    "$inc": {
                        "total_transactions": 1,
                        "total_amount_collected": amount
                    },
                    "$set": {"last_transaction_at": now.isoformat()}
                }
            )
        
        logger.info(f"External registration created for {campaign_slug}: {registration_id}")
        
        return {
            "status": "success", 
            "message": "Registration created",
            "registration_id": registration_id,
            "campaign": campaign_slug
        }
        
    except Exception as e:
        logger.error(f"External webhook error for {campaign_slug}: {str(e)}")
        return {"status": "error", "message": str(e)}

@router.get("/webhook-url/{campaign_slug}")
async def get_campaign_webhook_url(
    campaign_slug: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get the external webhook URL for a specific campaign"""
    db = await get_db()
    
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Verify campaign exists
    campaign = await db.campaigns.find_one({"slug": campaign_slug}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    base_url = get_redirect_base_url()
    webhook_url = f"{base_url}/api/payments/webhook/instamojo/external/{campaign_slug}"
    
    return {
        "campaign_slug": campaign_slug,
        "campaign_name": campaign.get("name"),
        "webhook_url": webhook_url,
        "instructions": [
            "1. Copy this webhook URL",
            "2. Go to Instamojo Dashboard → Create Payment Link (for this event)",
            "3. In payment link settings, set Webhook URL to this URL",
            "4. Any payment made through that link will be captured for this campaign only"
        ]
    }


@router.post("/webhook/instamojo/external")
async def instamojo_external_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Handle Instamojo webhook for EXTERNAL FORM payments.
    
    This webhook captures payments made through external forms (Google Forms, etc.)
    that use the same Instamojo account. It automatically creates a registration.
    
    Set this URL in your Instamojo dashboard:
    https://your-domain.com/api/payments/webhook/instamojo/external
    
    The webhook expects standard Instamojo webhook payload.
    Campaign is identified by the 'purpose' field - format: "CampaignSlug - Registration"
    """
    db = await get_db()
    
    try:
        form_data = await request.form()
        payload = dict(form_data)
        
        logger.info(f"External Instamojo webhook received: {payload}")
        
        payment_request_id = payload.get("payment_request_id")
        payment_id = payload.get("payment_id")
        status = payload.get("status", "").lower()
        amount = float(payload.get("amount", 0))
        buyer_name = payload.get("buyer_name", "External User")
        buyer_email = payload.get("buyer", "")  # Instamojo uses 'buyer' for email
        buyer_phone = payload.get("buyer_phone", "")
        purpose = payload.get("purpose", "")
        mac = payload.get("mac")
        
        if not payment_request_id or not payment_id:
            logger.warning("External webhook missing payment IDs")
            return {"status": "error", "message": "Missing payment IDs"}
        
        # Check if this payment already exists (might be from built-in form)
        existing_payment = await db.payments.find_one(
            {"gateway_payment_request_id": payment_request_id},
            {"_id": 0}
        )
        
        if existing_payment:
            logger.info(f"Payment already tracked via built-in form: {payment_request_id}")
            return {"status": "success", "message": "Payment already tracked"}
        
        # Also check by Instamojo payment ID
        existing_by_payment_id = await db.payments.find_one(
            {"gateway_payment_id": payment_id},
            {"_id": 0}
        )
        
        if existing_by_payment_id:
            logger.info(f"Payment already recorded: {payment_id}")
            return {"status": "success", "message": "Payment already recorded"}
        
        # Only process successful payments
        if status != "credit":
            logger.info(f"Ignoring non-credit payment: {payment_id} - {status}")
            return {"status": "success", "message": "Non-credit payment ignored"}
        
        # Try to find campaign by purpose field or use default
        # Format expected: "CampaignSlug - Registration" or just campaign slug
        campaign = None
        campaign_slug = None
        
        if purpose:
            # Extract campaign slug from purpose
            parts = purpose.split(" - ")
            campaign_slug = parts[0].strip().lower().replace(" ", "-")
            
            campaign = await db.campaigns.find_one(
                {"slug": {"$regex": f"^{campaign_slug}", "$options": "i"}},
                {"_id": 0}
            )
        
        if not campaign:
            # Try to find any active campaign with the same Instamojo account
            # Get all payment accounts with Instamojo
            payment_accounts = await db.payment_accounts.find(
                {"gateway_type": "instamojo", "is_active": True},
                {"_id": 0}
            ).to_list(100)
            
            if payment_accounts:
                # Find campaign using any of these accounts
                account_ids = [acc["id"] for acc in payment_accounts]
                campaign = await db.campaigns.find_one(
                    {
                        "payment_account_id": {"$in": account_ids},
                        "status": "active"
                    },
                    {"_id": 0}
                )
        
        if not campaign:
            logger.warning(f"No campaign found for external payment: {purpose}")
            # Store as orphan payment for manual review
            orphan_payment = {
                "id": str(uuid.uuid4()),
                "type": "orphan_external",
                "gateway_payment_id": payment_id,
                "gateway_payment_request_id": payment_request_id,
                "amount": amount,
                "buyer_name": buyer_name,
                "buyer_email": buyer_email,
                "buyer_phone": buyer_phone,
                "purpose": purpose,
                "status": "needs_review",
                "raw_payload": payload,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.orphan_payments.insert_one(orphan_payment)
            return {"status": "success", "message": "Payment stored for review - no campaign found"}
        
        now = datetime.now(timezone.utc)
        
        # Create registration
        registration_id = str(uuid.uuid4())
        registration_doc = {
            "id": registration_id,
            "campaign_id": campaign["id"],
            "form_data": {
                "name": buyer_name,
                "email": buyer_email,
                "phone": buyer_phone,
                "source": "external_form",
                "purpose": purpose
            },
            "total_amount": amount,
            "payment_status": "completed",
            "registration_status": "confirmed",
            "payment_gateway": "instamojo",
            "gateway_payment_id": payment_id,
            "source": "external",  # Mark as external registration
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await db.registrations.insert_one(registration_doc)
        
        # Create payment record
        payment_doc = {
            "id": str(uuid.uuid4()),
            "campaign_id": campaign["id"],
            "registration_id": registration_id,
            "amount": amount,
            "currency": "INR",
            "gateway": "instamojo",
            "payment_account_id": campaign.get("payment_account_id"),
            "buyer_name": buyer_name,
            "buyer_email": buyer_email,
            "buyer_phone": buyer_phone,
            "purpose": purpose,
            "status": "completed",
            "gateway_payment_id": payment_id,
            "gateway_payment_request_id": payment_request_id,
            "source": "external",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "paid_at": now.isoformat()
        }
        
        await db.payments.insert_one(payment_doc)
        
        # Update campaign stats
        await db.campaigns.update_one(
            {"id": campaign["id"]},
            {
                "$inc": {
                    "current_registrations": 1,
                    "total_revenue": amount
                }
            }
        )
        
        # Update payment account stats
        if campaign.get("payment_account_id"):
            await db.payment_accounts.update_one(
                {"id": campaign["payment_account_id"]},
                {
                    "$inc": {
                        "total_transactions": 1,
                        "total_amount_collected": amount
                    },
                    "$set": {"last_transaction_at": now.isoformat()}
                }
            )
        
        logger.info(f"External registration created: {registration_id} for campaign {campaign['slug']}")
        
        return {
            "status": "success", 
            "message": "External registration created",
            "registration_id": registration_id
        }
        
    except Exception as e:
        logger.error(f"External webhook error: {str(e)}")
        return {"status": "error", "message": str(e)}

@router.get("/orphan-payments")
async def get_orphan_payments(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get list of external payments that couldn't be matched to a campaign"""
    db = await get_db()
    
    # Simple auth check
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    orphans = await db.orphan_payments.find({}, {"_id": 0}).to_list(100)
    return {"orphan_payments": orphans}

@router.post("/orphan-payments/{payment_id}/assign")
async def assign_orphan_payment(
    payment_id: str,
    campaign_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Manually assign an orphan payment to a campaign"""
    db = await get_db()
    
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Find orphan payment
    orphan = await db.orphan_payments.find_one({"id": payment_id}, {"_id": 0})
    if not orphan:
        raise HTTPException(status_code=404, detail="Orphan payment not found")
    
    # Find campaign
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    now = datetime.now(timezone.utc)
    
    # Create registration
    registration_id = str(uuid.uuid4())
    registration_doc = {
        "id": registration_id,
        "campaign_id": campaign_id,
        "form_data": {
            "name": orphan.get("buyer_name", "Unknown"),
            "email": orphan.get("buyer_email", ""),
            "phone": orphan.get("buyer_phone", ""),
            "source": "external_form_manual",
            "purpose": orphan.get("purpose", "")
        },
        "total_amount": orphan.get("amount", 0),
        "payment_status": "completed",
        "registration_status": "confirmed",
        "payment_gateway": "instamojo",
        "gateway_payment_id": orphan.get("gateway_payment_id"),
        "source": "external_manual",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.registrations.insert_one(registration_doc)
    
    # Create payment record
    payment_doc = {
        "id": str(uuid.uuid4()),
        "campaign_id": campaign_id,
        "registration_id": registration_id,
        "amount": orphan.get("amount", 0),
        "currency": "INR",
        "gateway": "instamojo",
        "payment_account_id": campaign.get("payment_account_id"),
        "buyer_name": orphan.get("buyer_name", "Unknown"),
        "buyer_email": orphan.get("buyer_email", ""),
        "buyer_phone": orphan.get("buyer_phone", ""),
        "purpose": orphan.get("purpose", ""),
        "status": "completed",
        "gateway_payment_id": orphan.get("gateway_payment_id"),
        "gateway_payment_request_id": orphan.get("gateway_payment_request_id"),
        "source": "external_manual",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "paid_at": now.isoformat()
    }
    
    await db.payments.insert_one(payment_doc)
    
    # Update campaign stats
    await db.campaigns.update_one(
        {"id": campaign_id},
        {
            "$inc": {
                "current_registrations": 1,
                "total_revenue": orphan.get("amount", 0)
            }
        }
    )
    
    # Remove from orphans
    await db.orphan_payments.delete_one({"id": payment_id})
    
    return {
        "success": True,
        "message": "Payment assigned to campaign",
        "registration_id": registration_id
    }

