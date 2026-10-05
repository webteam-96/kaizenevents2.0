"""Integration Routes - API endpoints for third-party integrations"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import os
import uuid
import logging

from models import UserInDB, UserRole
from integration_service import interakt_service, brevo_service, google_sheets_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])
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

class IntegrationStatus(BaseModel):
    name: str
    configured: bool
    status: str  # 'active', 'inactive', 'error'
    details: Optional[str] = None

class WhatsAppTestRequest(BaseModel):
    phone_number: str
    country_code: str = "91"
    template_name: str = "event_registration_confirmation"
    test_values: List[str] = ["Test User", "Test Event", "₹999", "TEST1234"]

class EmailTestRequest(BaseModel):
    to_email: EmailStr
    to_name: str = "Test User"
    event_name: str = "Test Event"

class GoogleSheetsSetupRequest(BaseModel):
    credentials_json: str  # Service account JSON as string

class SyncToSheetRequest(BaseModel):
    campaign_id: str
    spreadsheet_id: str
    sheet_name: str = "Registrations"

class CreateCampaignSheetRequest(BaseModel):
    campaign_id: str
    sheet_name: str  # Custom name for the spreadsheet
    auto_sync: bool = True  # Enable auto-sync for new registrations


# ==================== STATUS ENDPOINTS ====================

@router.get("/status")
async def get_integrations_status(
    current_user: UserInDB = Depends(get_current_user)
):
    """Get status of all integrations"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    return {
        "whatsapp": {
            "name": "WhatsApp (Interakt)",
            "configured": False,  # WhatsApp integration disabled
            "status": "disabled",
            "details": "WhatsApp integration is currently disabled"
        },
        "email": {
            "name": "Email (Brevo/Sendinblue)",
            "configured": brevo_service.is_configured(),
            "status": "active" if brevo_service.is_configured() else "inactive",
            "details": "Ready to send emails" if brevo_service.is_configured() else "API key not configured"
        },
        "google_sheets": {
            "name": "Google Sheets",
            "configured": google_sheets_service.is_configured(),
            "status": "active" if google_sheets_service.is_configured() else "inactive",
            "details": "Ready to sync data" if google_sheets_service.is_configured() else "Service account not configured"
        }
    }


# ==================== WHATSAPP (INTERAKT) ENDPOINTS - DISABLED ====================
# WhatsApp integration has been disabled but endpoints are preserved for future use

@router.post("/whatsapp/test")
async def test_whatsapp(
    request: WhatsAppTestRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send a test WhatsApp message - DISABLED"""
    raise HTTPException(
        status_code=400,
        detail="WhatsApp integration is currently disabled. Contact support to enable."
    )

@router.post("/whatsapp/send-registration-confirmation")
async def send_whatsapp_registration_confirmation(
    registration_id: str,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send WhatsApp registration confirmation - DISABLED"""
    raise HTTPException(
        status_code=400,
        detail="WhatsApp integration is currently disabled. Contact support to enable."
    )


# ==================== EMAIL (BREVO) ENDPOINTS ====================

@router.post("/email/configure")
async def configure_brevo(
    api_key: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Configure Brevo API key (stores in database for persistence)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Store in database
    await db.integration_settings.update_one(
        {"type": "brevo"},
        {"$set": {
            "type": "brevo",
            "api_key": api_key,
            "configured_by": current_user.id,
            "configured_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Update environment for current session
    os.environ['BREVO_API_KEY'] = api_key
    brevo_service.api_key = api_key
    
    return {"success": True, "message": "Brevo API key configured successfully"}

@router.post("/email/test")
async def test_email(
    request: EmailTestRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send a test email"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    # Check database for API key if not in environment
    if not brevo_service.is_configured():
        db = await get_db()
        settings = await db.integration_settings.find_one({"type": "brevo"})
        if settings and settings.get("api_key"):
            brevo_service.api_key = settings["api_key"]
    
    if not brevo_service.is_configured():
        raise HTTPException(status_code=400, detail="Brevo API key not configured. Please configure it first.")
    
    result = await brevo_service.send_registration_confirmation(
        to_email=request.to_email,
        to_name=request.to_name,
        event_name=request.event_name,
        registration_id="TEST-" + str(uuid.uuid4())[:8],
        amount=999,
        payment_status="confirmed",
        organization_name="Kaizen Events"
    )
    
    if result["success"]:
        return {
            "success": True,
            "message": f"Test email sent to {request.to_email}",
            "message_id": result.get("message_id")
        }
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send email: {result.get('error', 'Unknown error')}"
        )

@router.post("/email/send-registration-confirmation")
async def send_email_registration_confirmation(
    registration_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send email registration confirmation for a specific registration"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    # Check database for API key if not in environment
    if not brevo_service.is_configured():
        db = await get_db()
        settings = await db.integration_settings.find_one({"type": "brevo"})
        if settings and settings.get("api_key"):
            brevo_service.api_key = settings["api_key"]
    
    if not brevo_service.is_configured():
        raise HTTPException(status_code=400, detail="Brevo not configured")
    
    db = await get_db()
    
    # Get registration
    registration = await db.registrations.find_one({"id": registration_id}, {"_id": 0})
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    
    # Get campaign
    campaign = await db.campaigns.find_one({"id": registration["campaign_id"]}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    form_data = registration.get("form_data", {})
    email = form_data.get("email", "")
    
    if not email:
        raise HTTPException(status_code=400, detail="No email found in registration")
    
    # Get notification settings for CC/BCC
    notification_settings = await db.notification_settings.find_one(
        {"campaign_id": registration["campaign_id"]},
        {"_id": 0}
    )
    
    cc = notification_settings.get("email_cc", []) if notification_settings else []
    bcc = notification_settings.get("email_bcc", []) if notification_settings else []
    
    result = await brevo_service.send_registration_confirmation(
        to_email=email,
        to_name=form_data.get("name", form_data.get("full_name", "Guest")),
        event_name=campaign.get("name", "Event"),
        registration_id=registration["id"],
        amount=registration.get("total_amount", 0),
        payment_status=registration.get("payment_status", "pending"),
        organization_name=campaign.get("organization_name", "Kaizen Events"),
        cc=cc if cc else None,
        bcc=bcc if bcc else None
    )
    
    # Log the notification
    log_id = str(uuid.uuid4())
    await db.notification_logs.insert_one({
        "id": log_id,
        "type": "email",
        "registration_id": registration_id,
        "campaign_id": registration["campaign_id"],
        "recipient": email,
        "cc": cc,
        "bcc": bcc,
        "status": "sent" if result["success"] else "failed",
        "error": result.get("error"),
        "sent_at": datetime.now(timezone.utc).isoformat()
    })
    
    if result["success"]:
        return {"success": True, "message": result.get("message"), "message_id": result.get("message_id")}
    else:
        raise HTTPException(status_code=500, detail=result.get("error"))


# ==================== GOOGLE SHEETS ENDPOINTS ====================

@router.post("/sheets/configure")
async def configure_google_sheets(
    request: GoogleSheetsSetupRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Configure Google Sheets with service account credentials"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    # Validate JSON
    import json
    try:
        creds = json.loads(request.credentials_json)
        if "type" not in creds or creds["type"] != "service_account":
            raise ValueError("Invalid service account JSON")
        
        service_email = creds.get("client_email", "")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    db = await get_db()
    
    # Store in database
    await db.integration_settings.update_one(
        {"type": "google_sheets"},
        {"$set": {
            "type": "google_sheets",
            "credentials_json": request.credentials_json,
            "service_email": service_email,
            "configured_by": current_user.id,
            "configured_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Update environment for current session
    os.environ['GOOGLE_SHEETS_CREDENTIALS'] = request.credentials_json
    google_sheets_service.credentials_json = request.credentials_json
    google_sheets_service.sheets_service = None  # Reset service to force re-init
    google_sheets_service.drive_service = None
    
    return {
        "success": True,
        "message": "Google Sheets configured successfully",
        "service_email": service_email,
        "instructions": f"Share your Google Sheets with this email: {service_email}"
    }

@router.post("/sheets/create-campaign-sheet")
async def create_campaign_sheet(
    request: CreateCampaignSheetRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Create a new Google Sheet for a campaign and share it with the admin.
    This is the automated Zoho-like approach.
    """
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    # Load credentials from database if not in environment
    if not google_sheets_service.is_configured():
        db = await get_db()
        settings = await db.integration_settings.find_one({"type": "google_sheets"})
        if settings and settings.get("credentials_json"):
            google_sheets_service.credentials_json = settings["credentials_json"]
    
    if not google_sheets_service.is_configured():
        raise HTTPException(status_code=400, detail="Google Sheets not configured. Please configure it in Integrations settings first.")
    
    db = await get_db()
    
    # Get campaign
    campaign = await db.campaigns.find_one({"id": request.campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Check if sheet already exists for this campaign
    existing_config = await db.sheets_config.find_one({"campaign_id": request.campaign_id})
    if existing_config and existing_config.get("spreadsheet_id"):
        raise HTTPException(
            status_code=400, 
            detail="A Google Sheet already exists for this campaign. Disable it first to create a new one."
        )
    
    # Create the sheet with custom name
    result = await google_sheets_service.setup_campaign_sheet(
        sheet_name=request.sheet_name,
        owner_email=current_user.email,
        campaign_name=campaign.get("name", "Campaign")
    )
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to create sheet"))
    
    # Save config
    await db.sheets_config.update_one(
        {"campaign_id": request.campaign_id},
        {"$set": {
            "campaign_id": request.campaign_id,
            "spreadsheet_id": result["spreadsheet_id"],
            "spreadsheet_url": result["spreadsheet_url"],
            "sheet_name": "Registrations",
            "spreadsheet_title": request.sheet_name,
            "auto_sync": request.auto_sync,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.id,
            "shared_with": current_user.email
        }},
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Sheet '{request.sheet_name}' created and shared with {current_user.email}",
        "spreadsheet_id": result["spreadsheet_id"],
        "spreadsheet_url": result["spreadsheet_url"],
        "auto_sync": request.auto_sync
    }

@router.delete("/sheets/campaign/{campaign_id}")
async def disable_campaign_sheet(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Disable Google Sheets sync for a campaign (doesn't delete the sheet)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    result = await db.sheets_config.delete_one({"campaign_id": campaign_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No sheet configuration found for this campaign")
    
    return {"success": True, "message": "Google Sheets sync disabled for this campaign"}

@router.get("/sheets/service-email")
async def get_sheets_service_email(
    current_user: UserInDB = Depends(get_current_user)
):
    """Get the service account email to share sheets with"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    settings = await db.integration_settings.find_one({"type": "google_sheets"})
    
    if not settings:
        raise HTTPException(status_code=400, detail="Google Sheets not configured")
    
    return {
        "service_email": settings.get("service_email", ""),
        "instructions": "Share your Google Sheet with this email address with 'Editor' permission"
    }

@router.post("/sheets/sync")
async def sync_campaign_to_sheets(
    request: SyncToSheetRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Sync all registrations from a campaign to Google Sheet"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    # Load credentials from database if not in environment
    if not google_sheets_service.is_configured():
        db = await get_db()
        settings = await db.integration_settings.find_one({"type": "google_sheets"})
        if settings and settings.get("credentials_json"):
            google_sheets_service.credentials_json = settings["credentials_json"]
    
    if not google_sheets_service.is_configured():
        raise HTTPException(status_code=400, detail="Google Sheets not configured")
    
    db = await get_db()
    
    # Get campaign
    campaign = await db.campaigns.find_one({"id": request.campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get sheet config to find the owner email for delegation
    sheet_config = await db.sheets_config.find_one({"campaign_id": request.campaign_id})
    delegate_email = sheet_config.get("shared_with", current_user.email) if sheet_config else current_user.email
    
    # Get all registrations
    registrations = await db.registrations.find(
        {"campaign_id": request.campaign_id},
        {"_id": 0}
    ).to_list(10000)
    
    if not registrations:
        return {"success": True, "message": "No registrations to sync", "count": 0}
    
    # Skip headers - they're already added during sheet creation
    # Just sync the registrations directly
    
    # Sync each registration (using delegation)
    success_count = 0
    errors = []
    
    for reg in registrations:
        result = await google_sheets_service.sync_registration(
            spreadsheet_id=request.spreadsheet_id,
            sheet_name=request.sheet_name,
            registration=reg,
            campaign=campaign,
            delegate_email=delegate_email
        )
        
        if result["success"]:
            success_count += 1
        else:
            errors.append({"registration_id": reg["id"], "error": result.get("error")})
    
    # Save sync config for auto-sync
    await db.sheets_config.update_one(
        {"campaign_id": request.campaign_id},
        {"$set": {
            "campaign_id": request.campaign_id,
            "spreadsheet_id": request.spreadsheet_id,
            "sheet_name": request.sheet_name,
            "auto_sync": True,
            "last_sync": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.id,
            "shared_with": delegate_email
        }},
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Synced {success_count}/{len(registrations)} registrations",
        "synced": success_count,
        "total": len(registrations),
        "errors": errors if errors else None
    }

@router.get("/sheets/config/{campaign_id}")
async def get_sheets_config(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get Google Sheets configuration for a campaign"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    config = await db.sheets_config.find_one({"campaign_id": campaign_id}, {"_id": 0})
    
    if not config:
        return {
            "campaign_id": campaign_id,
            "configured": False,
            "spreadsheet_id": None,
            "sheet_name": "Registrations",
            "auto_sync": False
        }
    
    return {
        **config,
        "configured": bool(config.get("spreadsheet_id"))
    }


# ==================== NOTIFICATION LOGS ====================

@router.get("/logs/{campaign_id}")
async def get_notification_logs(
    campaign_id: str,
    limit: int = 100,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get notification logs for a campaign"""
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = await get_db()
    
    logs = await db.notification_logs.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).sort("sent_at", -1).limit(limit).to_list(limit)
    
    return logs
