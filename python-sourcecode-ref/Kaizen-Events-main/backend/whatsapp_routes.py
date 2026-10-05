"""
WhatsApp Integration Routes for Closed Group Campaigns
Handles sending WhatsApp invites to unregistered members
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel
import logging

from models import UserInDB, UserRole
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])
security = HTTPBearer()
logger = logging.getLogger(__name__)


# ==================== Models ====================

class SendWhatsAppInviteRequest(BaseModel):
    """Request to send WhatsApp invite to a member"""
    member_ids: List[str]  # List of member IDs to send invites to
    template_name: str = "event_registration_invite"  # WhatsApp template name


class SendWhatsAppInviteResponse(BaseModel):
    """Response after sending WhatsApp invites"""
    total_sent: int
    total_failed: int
    errors: List[Dict[str, Any]] = []


class WhatsAppTemplateVariable(BaseModel):
    """Model for template variable mapping"""
    variable_name: str  # e.g., {{1}}, {{2}}
    field_name: str  # e.g., "name", "email", "registration_link"
    description: str


class WhatsAppTemplateInfo(BaseModel):
    """Information about how to set up WhatsApp template"""
    template_name: str
    variables: List[WhatsAppTemplateVariable]
    sample_message: str
    setup_instructions: str


# ==================== Dependencies ====================

async def get_db():
    from server import db
    return db


async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db as get_user
    return await get_user(credentials)


def require_organizer_access(current_user: UserInDB = Depends(get_current_user_with_db)) -> UserInDB:
    """Require Super Admin, Director, or Org Admin access"""
    if current_user.role == UserRole.SUPER_ADMIN or current_user.can_approve_transfers:
        return current_user
    if current_user.role == UserRole.ORG_ADMIN:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Organizer access required"
    )


# ==================== Routes ====================

@router.get("/template-guide")
async def get_template_setup_guide():
    """
    Get guide for setting up WhatsApp template in Interakt.
    This helps admins understand how to configure their WhatsApp template
    with the correct variables that match the form fields.
    """
    return {
        "title": "WhatsApp Template Setup Guide",
        "provider": "Interakt",
        "instructions": [
            "1. Log in to your Interakt dashboard at https://app.interakt.ai",
            "2. Go to 'Templates' section",
            "3. Create a new template with name: 'event_registration_invite'",
            "4. Use the following variables in your template:",
        ],
        "variables": [
            {
                "placeholder": "{{1}}",
                "maps_to": "member_name",
                "description": "The member's name from your uploaded list"
            },
            {
                "placeholder": "{{2}}",
                "maps_to": "event_name",
                "description": "The name of your campaign/event"
            },
            {
                "placeholder": "{{3}}",
                "maps_to": "registration_link",
                "description": "The unique registration link for the member"
            },
            {
                "placeholder": "{{4}}",
                "maps_to": "organization_name",
                "description": "Your organization's name"
            },
            {
                "placeholder": "{{5}}",
                "maps_to": "registration_fee",
                "description": "The registration fee amount (if applicable)"
            }
        ],
        "sample_template": """Hello {{1}}! 👋

You are invited to register for *{{2}}* organized by {{4}}.

📅 Complete your registration using this link:
{{3}}

💰 Registration Fee: ₹{{5}}

Register now to secure your spot!

If you have any questions, please contact us.""",
        "notes": [
            "Template must be approved by WhatsApp before it can be used",
            "Approval typically takes 24-48 hours",
            "You can customize the message but must keep the variable placeholders",
            "The template language should be set to 'en' (English)"
        ]
    }


@router.post("/campaigns/{campaign_id}/send-invites", response_model=SendWhatsAppInviteResponse)
async def send_whatsapp_invites(
    campaign_id: str,
    request: SendWhatsAppInviteRequest,
    current_user: UserInDB = Depends(require_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Send WhatsApp invites to selected unregistered members of a closed group campaign.
    Only available for closed group campaigns.
    """
    from integration_service import interakt_service
    
    # Verify campaign exists and is closed group
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    if campaign.get("campaign_type") != "closed_group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp invites are only available for closed group campaigns"
        )
    
    # Check user access
    if current_user.role != UserRole.SUPER_ADMIN:
        if not current_user.can_approve_transfers and campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this campaign"
            )
    
    # Check if Interakt is configured
    if not interakt_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp integration is not configured. Please add INTERAKT_SECRET_KEY to environment."
        )
    
    # Get form config for registration fee
    form_config = campaign.get("form_config", {})
    base_price = form_config.get("base_price", 0)
    
    # Build registration base URL
    # Use the frontend URL from environment or default
    import os
    frontend_url = os.environ.get("FRONTEND_URL", "https://kaizenevents.live")
    
    total_sent = 0
    total_failed = 0
    errors = []
    
    # Process each member
    for member_id in request.member_ids:
        member = await db.campaign_members.find_one({
            "id": member_id,
            "campaign_id": campaign_id
        })
        
        if not member:
            errors.append({
                "member_id": member_id,
                "error": "Member not found"
            })
            total_failed += 1
            continue
        
        # Only send to unregistered members
        if member.get("status") == "registered":
            errors.append({
                "member_id": member_id,
                "error": "Member already registered"
            })
            total_failed += 1
            continue
        
        # Check if member has mobile number
        mobile = member.get("mobile") or member.get("phone")
        if not mobile:
            errors.append({
                "member_id": member_id,
                "error": "Member has no mobile number"
            })
            total_failed += 1
            continue
        
        # Build registration link with member ID
        registration_link = f"{frontend_url}/register/{campaign.get('slug')}?member={member_id}"
        
        # Prepare template variables
        body_values = [
            member.get("name", "Guest"),
            campaign.get("name", "Event"),
            registration_link,
            campaign.get("organization_name", ""),
            f"₹{base_price}" if base_price > 0 else "Free"
        ]
        
        try:
            result = await interakt_service.send_template_message(
                phone_number=mobile,
                country_code="91",
                template_name=request.template_name,
                body_values=body_values
            )
            
            if result.get("success"):
                total_sent += 1
                
                # Update member record with invite sent timestamp
                await db.campaign_members.update_one(
                    {"id": member_id},
                    {"$set": {
                        "whatsapp_invite_sent_at": datetime.now(timezone.utc).isoformat(),
                        "whatsapp_invite_sent_by": current_user.id,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                logger.info(f"WhatsApp invite sent to {member.get('name')} ({mobile})")
            else:
                total_failed += 1
                errors.append({
                    "member_id": member_id,
                    "member_name": member.get("name"),
                    "error": result.get("error", "Unknown error")
                })
                
        except Exception as e:
            total_failed += 1
            errors.append({
                "member_id": member_id,
                "member_name": member.get("name"),
                "error": str(e)
            })
            logger.error(f"Failed to send WhatsApp to {mobile}: {e}")
    
    return SendWhatsAppInviteResponse(
        total_sent=total_sent,
        total_failed=total_failed,
        errors=errors
    )


@router.get("/campaigns/{campaign_id}/invite-status")
async def get_invite_status(
    campaign_id: str,
    current_user: UserInDB = Depends(require_organizer_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get WhatsApp invite status for all members of a closed group campaign.
    Shows which members have been sent invites and when.
    """
    # Verify campaign exists and is closed group
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    if campaign.get("campaign_type") != "closed_group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only available for closed group campaigns"
        )
    
    # Check user access
    if current_user.role != UserRole.SUPER_ADMIN:
        if not current_user.can_approve_transfers and campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    # Get all members with their invite status
    members = await db.campaign_members.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).to_list(1000)
    
    invite_sent = 0
    not_sent = 0
    registered = 0
    no_mobile = 0
    
    member_status = []
    for member in members:
        status_info = {
            "id": member.get("id"),
            "name": member.get("name"),
            "mobile": member.get("mobile") or member.get("phone"),
            "registration_status": member.get("status", "pending"),
            "whatsapp_invite_sent": bool(member.get("whatsapp_invite_sent_at")),
            "whatsapp_invite_sent_at": member.get("whatsapp_invite_sent_at")
        }
        member_status.append(status_info)
        
        if member.get("status") == "registered":
            registered += 1
        elif member.get("whatsapp_invite_sent_at"):
            invite_sent += 1
        elif not (member.get("mobile") or member.get("phone")):
            no_mobile += 1
        else:
            not_sent += 1
    
    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name"),
        "summary": {
            "total_members": len(members),
            "registered": registered,
            "invite_sent": invite_sent,
            "pending_invite": not_sent,
            "no_mobile": no_mobile
        },
        "members": member_status
    }
