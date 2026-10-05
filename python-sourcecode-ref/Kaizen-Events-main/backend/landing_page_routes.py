from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import re

from models import UserInDB, UserRole
from landing_page_models import LandingPageConfig, LandingPageUpdate, LandingPageSection, LandingPageTheme
from motor.motor_asyncio import AsyncIOMotorDatabase
from audit_log import audit, AuditEventType
from security import sanitize_mongo_query

router = APIRouter(prefix="/api", tags=["landing-pages"])
security = HTTPBearer()


def validate_slug(slug: str) -> str:
    """Validate and sanitize campaign slug to prevent injection attacks"""
    if not slug or len(slug) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid slug"
        )
    # Only allow alphanumeric, hyphens, and underscores
    if not re.match(r'^[a-zA-Z0-9_-]+$', slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid slug format"
        )
    return sanitize_mongo_query(slug)

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

@router.get("/campaigns/{campaign_id}/landing-page", response_model=Optional[LandingPageConfig])
async def get_landing_page(
    campaign_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get landing page configuration (public endpoint)"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    landing_config = campaign.get("landing_page_config")
    if not landing_config:
        return None
    
    return LandingPageConfig(**landing_config)

@router.put("/campaigns/{campaign_id}/landing-page", response_model=LandingPageConfig)
async def update_landing_page(
    campaign_id: str,
    landing_config: LandingPageUpdate,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update landing page configuration (Super Admin only)"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    landing_data = landing_config.model_dump(exclude_unset=True)
    
    # Merge with existing config if present
    existing_config = campaign.get("landing_page_config") or {}
    merged_config = {**existing_config, **landing_data}
    
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "landing_page_config": merged_config,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log landing page update
    is_create = not existing_config or not existing_config.get("sections")
    await audit.log(
        AuditEventType.LANDING_PAGE_CREATED if is_create else AuditEventType.LANDING_PAGE_UPDATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="landing_page",
        resource_id=campaign_id,
        action_details={
            "campaign_name": campaign.get("name"),
            "sections_count": len(merged_config.get("sections", [])),
            "is_published": merged_config.get("is_published", False)
        }
    )
    
    return LandingPageConfig(**merged_config)

@router.delete("/campaigns/{campaign_id}/landing-page")
async def delete_landing_page(
    campaign_id: str,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete landing page configuration (Super Admin only)"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$unset": {"landing_page_config": ""}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Log landing page deletion
    await audit.log(
        AuditEventType.LANDING_PAGE_DELETED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="landing_page",
        resource_id=campaign_id,
        action_details={"campaign_name": campaign.get("name")}
    )
    
    return {"message": "Landing page configuration deleted successfully"}

@router.get("/public/campaigns/{slug}/landing-page", response_model=Optional[LandingPageConfig])
async def get_public_landing_page(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get public landing page configuration by campaign slug"""
    # Validate and sanitize slug
    safe_slug = validate_slug(slug)
    
    # First, check if campaign exists at all
    campaign = await db.campaigns.find_one({"slug": safe_slug}, {"_id": 0})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check if campaign is archived - return 410 Gone
    if campaign.get("status") == "archived":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This event has ended"
        )
    
    # Check if campaign is not active
    if campaign.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found or not active"
        )
    
    landing_config = campaign.get("landing_page_config")
    if not landing_config:
        return None
    
    return LandingPageConfig(**landing_config)

@router.get("/public/campaigns/{slug}")
async def get_public_campaign(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get public campaign data by slug"""
    # Validate and sanitize slug
    safe_slug = validate_slug(slug)
    
    # First, check if campaign exists at all (regardless of status)
    campaign = await db.campaigns.find_one({"slug": safe_slug}, {"_id": 0})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check if campaign is archived - return 410 Gone
    if campaign.get("status") == "archived":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This event has ended"
        )
    
    # Check if campaign is not active
    if campaign.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found or not active"
        )
    
    return {
        "id": campaign["id"],
        "name": campaign["name"],
        "slug": campaign["slug"],
        "organization_name": campaign["organization_name"],
        "description": campaign.get("description"),
        "event_logo": campaign.get("event_logo"),
        "logo_url": campaign.get("logo_url"),
        "has_landing_page": campaign.get("has_landing_page", True),
        "registration_enabled": campaign.get("registration_enabled", True),
        "use_external_form": campaign.get("use_external_form", False),
        "external_form_url": campaign.get("external_form_url"),
        "landing_page_config": campaign.get("landing_page_config"),
        "form_config": campaign.get("form_config"),
        "payment_config": campaign.get("payment_config"),  # Legacy offline payments config
        "payment_collection_method": campaign.get("payment_collection_method", "online"),  # "online" or "offline"
        "payment_gateway": campaign.get("payment_gateway"),
        "payment_account_id": campaign.get("payment_account_id"),
        "status": campaign.get("status"),
        "campaign_type": campaign.get("campaign_type", "open"),  # open or closed_group
        "registration_start_date": campaign.get("registration_start_date"),
        "registration_end_date": campaign.get("registration_end_date"),
        "start_date": campaign.get("start_date"),
        "end_date": campaign.get("end_date")
    }

@router.get("/public/events")
async def get_public_events(
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get all active public events for the homepage"""
    # Get all active campaigns that are set to show on homepage, sorted by created_at descending (newest first)
    campaigns = await db.campaigns.find(
        {
            "status": "active",
            "$or": [
                {"show_on_homepage": True},
                {"show_on_homepage": {"$exists": False}}  # Default to showing if field doesn't exist
            ]
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Return simplified event data for the public listing
    events = []
    for campaign in campaigns:
        events.append({
            "id": campaign["id"],
            "name": campaign["name"],
            "slug": campaign["slug"],
            "organization_name": campaign["organization_name"],
            "description": campaign.get("description"),
            "logo_url": campaign.get("logo_url"),
            "has_landing_page": campaign.get("has_landing_page", True),
            "start_date": campaign.get("start_date"),
            "end_date": campaign.get("end_date"),
            "registration_start_date": campaign.get("registration_start_date"),
            "registration_end_date": campaign.get("registration_end_date"),
            "created_at": campaign.get("created_at")
        })
    
    return events


from pydantic import BaseModel, EmailStr

class ContactSalesRequest(BaseModel):
    contact_name: str
    mobile_number: str
    email: str
    club_name: str
    district: str
    designation: str
    purpose: str
    estimated_registrants: str
    event_date: str


@router.post("/contact-sales")
async def submit_contact_sales(
    contact_data: ContactSalesRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Submit a contact sales inquiry (public endpoint)"""
    inquiry = {
        "id": str(uuid.uuid4()),
        "contact_name": contact_data.contact_name,
        "mobile_number": contact_data.mobile_number,
        "email": contact_data.email,
        "club_name": contact_data.club_name,
        "district": contact_data.district,
        "designation": contact_data.designation,
        "purpose": contact_data.purpose,
        "estimated_registrants": contact_data.estimated_registrants,
        "event_date": contact_data.event_date,
        "status": "new",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.contact_inquiries.insert_one(inquiry)
    
    return {"message": "Thank you for your inquiry. Our team will contact you shortly.", "id": inquiry["id"]}
