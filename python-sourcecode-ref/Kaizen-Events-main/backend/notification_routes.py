"""Automated Notification Routes - WhatsApp & Email Integration"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import os
import httpx
import asyncio
import resend
import logging

from models import UserInDB, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
security = HTTPBearer()

# Dependency to get database
async def get_db():
    from server import db
    return db

# Dependency to get current user
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db
    return await get_current_user_with_db(credentials)

# ==================== MODELS ====================

class NotificationSettings(BaseModel):
    campaign_id: str
    email_enabled: bool = False
    whatsapp_enabled: bool = False
    email_sender_id: Optional[str] = None  # Reference to registered DKIM sender
    email_subject: Optional[str] = "Registration Confirmation - {event_name}"
    email_template: Optional[str] = None
    email_cc: Optional[List[str]] = []  # CC recipients
    email_bcc: Optional[List[str]] = []  # BCC recipients
    whatsapp_template_name: Optional[str] = None
    interakt_api_key: Optional[str] = None
    resend_api_key: Optional[str] = None  # Fallback if no DKIM sender
    sender_email: Optional[str] = None  # Fallback if no DKIM sender

class NotificationLog(BaseModel):
    id: str
    campaign_id: str
    registration_id: str
    channel: str  # 'email' or 'whatsapp'
    recipient: str
    status: str  # 'sent', 'failed', 'pending'
    sent_at: datetime
    error_message: Optional[str] = None

class SendNotificationRequest(BaseModel):
    registration_id: str
    channels: List[str] = ['email']  # 'email', 'whatsapp'

# ==================== HELPER FUNCTIONS ====================

def get_default_email_template():
    """Default HTML email template for registration confirmation"""
    return '''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
    <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
            <td style="padding:40px 0;">
                <table role="presentation" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#7c3aed,#14b8a6);padding:32px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:24px;">Registration Confirmed!</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 16px;font-size:16px;color:#333;">Dear <strong>{name}</strong>,</p>
                            
                            <p style="margin:0 0 24px;font-size:16px;color:#555;line-height:1.6;">
                                Thank you for registering for <strong>{event_name}</strong>! Your registration has been confirmed.
                            </p>
                            
                            <!-- Registration Details -->
                            <table style="width:100%;background-color:#f8f9fa;border-radius:8px;margin:24px 0;">
                                <tr>
                                    <td style="padding:20px;">
                                        <h3 style="margin:0 0 16px;color:#7c3aed;font-size:16px;">Registration Details</h3>
                                        <p style="margin:4px 0;color:#555;"><strong>Event:</strong> {event_name}</p>
                                        <p style="margin:4px 0;color:#555;"><strong>Registration ID:</strong> {registration_id}</p>
                                        <p style="margin:4px 0;color:#555;"><strong>Amount:</strong> ₹{amount}</p>
                                        <p style="margin:4px 0;color:#555;"><strong>Status:</strong> {payment_status}</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin:24px 0 0;font-size:14px;color:#888;">
                                If you have any questions, please contact our support team.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#f8f9fa;padding:24px;text-align:center;border-top:1px solid #eee;">
                            <p style="margin:0;font-size:12px;color:#888;">© 2026 {organization_name}. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>'''

async def send_email_notification(
    resend_api_key: str,
    sender_email: str,
    recipient_email: str,
    subject: str,
    html_content: str,
    cc: List[str] = None,
    bcc: List[str] = None
) -> Dict[str, Any]:
    """Send email using Resend API"""
    try:
        resend.api_key = resend_api_key
        
        params = {
            "from": sender_email,
            "to": [recipient_email],
            "subject": subject,
            "html": html_content
        }
        
        # Add CC if provided
        if cc and len(cc) > 0:
            params["cc"] = cc
        
        # Add BCC if provided
        if bcc and len(bcc) > 0:
            params["bcc"] = bcc
        
        # Run sync SDK in thread to keep FastAPI non-blocking
        email = await asyncio.to_thread(resend.Emails.send, params)
        
        return {
            "success": True,
            "email_id": email.get("id"),
            "message": f"Email sent to {recipient_email}"
        }
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

async def send_whatsapp_notification(
    interakt_api_key: str,
    phone_number: str,
    country_code: str,
    template_name: str,
    body_values: List[str]
) -> Dict[str, Any]:
    """Send WhatsApp message using Interakt API"""
    try:
        # Clean phone number
        clean_phone = phone_number.lstrip('0').replace(' ', '').replace('-', '')
        clean_country = country_code.replace('+', '')
        
        payload = {
            "countryCode": f"+{clean_country}",
            "phoneNumber": clean_phone,
            "type": "Template",
            "template": {
                "name": template_name,
                "languageCode": "en",
                "bodyValues": body_values
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.interakt.ai/v1/public/message/",
                json=payload,
                headers={
                    "Authorization": f"Basic {interakt_api_key}",
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                return {
                    "success": True,
                    "response": response.json(),
                    "message": f"WhatsApp sent to {clean_phone}"
                }
            else:
                return {
                    "success": False,
                    "error": response.text
                }
    except Exception as e:
        logger.error(f"Failed to send WhatsApp: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

async def send_registration_notifications(
    registration_data: Dict,
    campaign_data: Dict,
    settings: Dict
):
    """Background task to send notifications on registration"""
    import uuid
    from server import db  # Import database connection
    
    campaign_id = campaign_data.get('id')
    registration_id = registration_data.get('id')
    user_data = registration_data.get('user_data', {})
    
    # Get user info
    name = user_data.get('name', user_data.get('full_name', 'Guest'))
    email = user_data.get('email', '')
    phone = user_data.get('phone', user_data.get('mobile', ''))
    country_code = user_data.get('country_code', '+91')
    
    event_name = campaign_data.get('name', 'Event')
    organization = campaign_data.get('organization_name', 'Kaizen Events')
    amount = registration_data.get('payment_amount', 0)
    payment_status = registration_data.get('payment_status', 'pending')
    
    # Send Email if enabled
    if settings.get('email_enabled') and email:
        # Get sender info - check for DKIM sender first
        sender_email = None
        api_key = None
        
        email_sender_id = settings.get('email_sender_id')
        if email_sender_id:
            # Get DKIM sender details
            sender = await db.email_senders.find_one({"id": email_sender_id})
            if sender:
                domain = await db.dkim_domains.find_one({"id": sender["dkim_domain_id"]})
                if domain and domain.get("status") == "verified":
                    sender_email = f"{sender['name']} <{sender['email']}>"
                    api_key = domain.get("resend_api_key")
        
        # Fallback to direct API key
        if not api_key:
            api_key = settings.get('resend_api_key')
            sender_email = settings.get('sender_email', 'onboarding@resend.dev')
        
        if api_key:
            template = settings.get('email_template') or get_default_email_template()
            
            # Replace placeholders
            html_content = template.format(
                name=name,
                event_name=event_name,
                registration_id=registration_id[:8],
                amount=amount,
                payment_status=payment_status.title(),
                organization_name=organization
            )
            
            subject = settings.get('email_subject', 'Registration Confirmation').format(
                event_name=event_name
            )
            
            # Get CC and BCC
            cc = settings.get('email_cc', [])
            bcc = settings.get('email_bcc', [])
            
            result = await send_email_notification(
                resend_api_key=api_key,
                sender_email=sender_email,
                recipient_email=email,
                subject=subject,
                html_content=html_content,
                cc=cc if cc else None,
                bcc=bcc if bcc else None
            )
            
            # Log notification
            log_id = str(uuid.uuid4())
            await db.notification_logs.insert_one({
                "id": log_id,
                "campaign_id": campaign_id,
                "registration_id": registration_id,
                "channel": "email",
                "recipient": email,
                "cc": cc,
                "bcc": bcc,
                "status": "sent" if result['success'] else "failed",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "error_message": result.get('error')
            })
            
            logger.info(f"Email notification result: {result}")
    
    # Send WhatsApp if enabled
    if settings.get('whatsapp_enabled') and phone and settings.get('interakt_api_key'):
        template_name = settings.get('whatsapp_template_name', 'event_registration_confirmation')
        
        body_values = [
            name,
            event_name,
            f"₹{amount}",
            payment_status.title()
        ]
        
        result = await send_whatsapp_notification(
            interakt_api_key=settings['interakt_api_key'],
            phone_number=phone,
            country_code=country_code,
            template_name=template_name,
            body_values=body_values
        )
        
        # Log notification
        log_id = str(uuid.uuid4())
        await db.notification_logs.insert_one({
            "id": log_id,
            "campaign_id": campaign_id,
            "registration_id": registration_id,
            "channel": "whatsapp",
            "recipient": phone,
            "status": "sent" if result['success'] else "failed",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "error_message": result.get('error')
        })
        
        logger.info(f"WhatsApp notification result: {result}")

# ==================== ROUTES ====================

@router.get("/settings/{campaign_id}")
async def get_notification_settings(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get notification settings for a campaign"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    settings = await db.notification_settings.find_one(
        {"campaign_id": campaign_id},
        {"_id": 0}
    )
    
    if not settings:
        # Return default settings
        return {
            "campaign_id": campaign_id,
            "email_enabled": False,
            "whatsapp_enabled": False,
            "email_subject": "Registration Confirmation - {event_name}",
            "email_template": get_default_email_template(),
            "whatsapp_template_name": "event_registration_confirmation",
            "has_resend_key": False,
            "has_interakt_key": False,
            "sender_email": "onboarding@resend.dev"
        }
    
    # Don't expose API keys, just indicate if they exist
    return {
        **settings,
        "has_resend_key": bool(settings.get('resend_api_key')),
        "has_interakt_key": bool(settings.get('interakt_api_key')),
        "resend_api_key": None,
        "interakt_api_key": None
    }

@router.put("/settings/{campaign_id}")
async def update_notification_settings(
    campaign_id: str,
    settings: NotificationSettings,
    current_user: UserInDB = Depends(get_current_user)
):
    """Update notification settings for a campaign"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Verify campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    settings_dict = settings.model_dump()
    settings_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Update or insert
    await db.notification_settings.update_one(
        {"campaign_id": campaign_id},
        {"$set": settings_dict},
        upsert=True
    )
    
    return {"message": "Notification settings updated successfully"}

@router.get("/logs/{campaign_id}")
async def get_notification_logs(
    campaign_id: str,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get notification logs for a campaign"""
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = await get_db()
    
    logs = await db.notification_logs.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).sort("sent_at", -1).limit(limit).to_list(limit)
    
    return logs

@router.post("/send")
async def send_notification(
    request: SendNotificationRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user)
):
    """Manually send notification for a registration"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Get registration
    registration = await db.registrations.find_one(
        {"id": request.registration_id},
        {"_id": 0}
    )
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    
    campaign_id = registration.get('campaign_id')
    
    # Get campaign
    campaign = await db.campaigns.find_one(
        {"id": campaign_id},
        {"_id": 0}
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get settings
    settings = await db.notification_settings.find_one(
        {"campaign_id": campaign_id},
        {"_id": 0}
    )
    
    if not settings:
        raise HTTPException(status_code=400, detail="Notification settings not configured")
    
    # Send notifications in background
    background_tasks.add_task(
        send_registration_notifications,
        registration,
        campaign,
        settings
    )
    
    return {"message": "Notification queued for sending"}

@router.post("/test-email")
async def test_email_notification(
    campaign_id: str,
    test_email: EmailStr,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send a test email notification"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Get settings
    settings = await db.notification_settings.find_one(
        {"campaign_id": campaign_id},
        {"_id": 0}
    )
    
    if not settings or not settings.get('resend_api_key'):
        raise HTTPException(status_code=400, detail="Email not configured. Add Resend API key first.")
    
    # Get campaign
    campaign = await db.campaigns.find_one(
        {"id": campaign_id},
        {"_id": 0}
    )
    
    template = settings.get('email_template') or get_default_email_template()
    html_content = template.format(
        name="Test User",
        event_name=campaign.get('name', 'Test Event'),
        registration_id="TEST1234",
        amount="999",
        payment_status="Confirmed",
        organization_name=campaign.get('organization_name', 'Kaizen Events')
    )
    
    subject = settings.get('email_subject', 'Registration Confirmation').format(
        event_name=campaign.get('name', 'Test Event')
    )
    
    result = await send_email_notification(
        resend_api_key=settings['resend_api_key'],
        sender_email=settings.get('sender_email', 'onboarding@resend.dev'),
        recipient_email=test_email,
        subject=f"[TEST] {subject}",
        html_content=html_content
    )
    
    if result['success']:
        return {"message": f"Test email sent to {test_email}", "email_id": result.get('email_id')}
    else:
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {result.get('error')}")
