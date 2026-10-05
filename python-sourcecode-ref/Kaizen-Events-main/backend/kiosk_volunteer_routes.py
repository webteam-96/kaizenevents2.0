"""
Kiosk Volunteer Management Routes
Handles creation, assignment, and management of kiosk volunteers.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr
import uuid
import secrets
import string
import logging

from models import UserInDB, UserRole
from motor.motor_asyncio import AsyncIOMotorDatabase
from passlib.context import CryptContext

router = APIRouter(prefix="/api/kiosk-volunteers", tags=["kiosk-volunteers"])
security = HTTPBearer()
logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ==================== Models ====================

class CreateKioskVolunteerRequest(BaseModel):
    """Request to create a new kiosk volunteer"""
    name: str
    email: EmailStr
    phone: Optional[str] = None
    campaign_ids: List[str] = []  # Campaigns this volunteer can access


class UpdateKioskVolunteerRequest(BaseModel):
    """Request to update a kiosk volunteer"""
    name: Optional[str] = None
    phone: Optional[str] = None
    campaign_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


class KioskVolunteerResponse(BaseModel):
    """Response model for kiosk volunteer"""
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    campaign_ids: List[str] = []
    campaign_names: List[str] = []
    is_active: bool = True
    created_at: str
    last_login: Optional[str] = None


class AssignVolunteerRequest(BaseModel):
    """Request to assign volunteer to campaigns"""
    campaign_ids: List[str]


# ==================== Dependencies ====================

async def get_db():
    from server import db
    return db


async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db as get_user
    return await get_user(credentials)


def require_admin_access(current_user: UserInDB = Depends(get_current_user_with_db)) -> UserInDB:
    """Require Super Admin or Director access"""
    if current_user.role == UserRole.SUPER_ADMIN or current_user.can_approve_transfers:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin access required to manage kiosk volunteers"
    )


# ==================== Helper Functions ====================

def generate_temp_password(length: int = 8) -> str:
    """Generate a temporary password for new volunteers"""
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


# ==================== Routes ====================

@router.get("", response_model=List[KioskVolunteerResponse])
async def list_kiosk_volunteers(
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    List all kiosk volunteers.
    Only accessible by Super Admin and Directors.
    """
    volunteers = await db.users.find(
        {"role": UserRole.KIOSK_VOLUNTEER},
        {"_id": 0, "password": 0}
    ).to_list(1000)
    
    # Get campaign names for each volunteer
    all_campaign_ids = set()
    for v in volunteers:
        all_campaign_ids.update(v.get("campaign_access", []))
    
    campaigns = {}
    if all_campaign_ids:
        campaign_docs = await db.campaigns.find(
            {"id": {"$in": list(all_campaign_ids)}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(1000)
        campaigns = {c["id"]: c["name"] for c in campaign_docs}
    
    result = []
    for v in volunteers:
        campaign_ids = v.get("campaign_access", [])
        campaign_names = [campaigns.get(cid, "Unknown") for cid in campaign_ids]
        
        result.append(KioskVolunteerResponse(
            id=v["id"],
            name=v["name"],
            email=v["email"],
            phone=v.get("phone"),
            campaign_ids=campaign_ids,
            campaign_names=campaign_names,
            is_active=v.get("is_active", True),
            created_at=v.get("created_at", ""),
            last_login=v.get("last_login")
        ))
    
    return result


@router.post("", response_model=Dict[str, Any])
async def create_kiosk_volunteer(
    request: CreateKioskVolunteerRequest,
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Create a new kiosk volunteer account.
    Returns the temporary password that should be shared with the volunteer.
    """
    # Check if email already exists
    existing = await db.users.find_one({"email": request.email.lower()})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    
    # Generate temporary password
    temp_password = generate_temp_password()
    hashed_password = pwd_context.hash(temp_password)
    
    # Create volunteer
    volunteer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    volunteer_doc = {
        "id": volunteer_id,
        "name": request.name,
        "email": request.email.lower(),
        "phone": request.phone,
        "hashed_password": hashed_password,
        "role": UserRole.KIOSK_VOLUNTEER,
        "campaign_access": request.campaign_ids,
        "is_active": True,
        "must_change_password": True,
        "created_at": now.isoformat(),
        "created_by": current_user.id,
        "updated_at": now.isoformat()
    }
    
    await db.users.insert_one(volunteer_doc)
    
    # Get campaign names
    campaign_names = []
    if request.campaign_ids:
        campaigns = await db.campaigns.find(
            {"id": {"$in": request.campaign_ids}},
            {"_id": 0, "name": 1}
        ).to_list(100)
        campaign_names = [c["name"] for c in campaigns]
    
    logger.info(f"Kiosk volunteer created: {request.email} by {current_user.email}")
    
    return {
        "id": volunteer_id,
        "name": request.name,
        "email": request.email.lower(),
        "temporary_password": temp_password,
        "campaign_ids": request.campaign_ids,
        "campaign_names": campaign_names,
        "message": "Volunteer created successfully. Please share the temporary password securely."
    }


@router.get("/{volunteer_id}", response_model=KioskVolunteerResponse)
async def get_kiosk_volunteer(
    volunteer_id: str,
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get details of a specific kiosk volunteer."""
    volunteer = await db.users.find_one(
        {"id": volunteer_id, "role": UserRole.KIOSK_VOLUNTEER},
        {"_id": 0, "password": 0}
    )
    
    if not volunteer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Volunteer not found"
        )
    
    # Get campaign names
    campaign_ids = volunteer.get("campaign_access", [])
    campaign_names = []
    if campaign_ids:
        campaigns = await db.campaigns.find(
            {"id": {"$in": campaign_ids}},
            {"_id": 0, "name": 1}
        ).to_list(100)
        campaign_names = [c["name"] for c in campaigns]
    
    return KioskVolunteerResponse(
        id=volunteer["id"],
        name=volunteer["name"],
        email=volunteer["email"],
        phone=volunteer.get("phone"),
        campaign_ids=campaign_ids,
        campaign_names=campaign_names,
        is_active=volunteer.get("is_active", True),
        created_at=volunteer.get("created_at", ""),
        last_login=volunteer.get("last_login")
    )


@router.put("/{volunteer_id}", response_model=KioskVolunteerResponse)
async def update_kiosk_volunteer(
    volunteer_id: str,
    request: UpdateKioskVolunteerRequest,
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update a kiosk volunteer's details."""
    volunteer = await db.users.find_one(
        {"id": volunteer_id, "role": UserRole.KIOSK_VOLUNTEER}
    )
    
    if not volunteer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Volunteer not found"
        )
    
    # Build update
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if request.name is not None:
        update_data["name"] = request.name
    if request.phone is not None:
        update_data["phone"] = request.phone
    if request.campaign_ids is not None:
        update_data["campaign_access"] = request.campaign_ids
    if request.is_active is not None:
        update_data["is_active"] = request.is_active
    
    await db.users.update_one(
        {"id": volunteer_id},
        {"$set": update_data}
    )
    
    # Get updated volunteer
    updated = await db.users.find_one(
        {"id": volunteer_id},
        {"_id": 0, "password": 0}
    )
    
    # Get campaign names
    campaign_ids = updated.get("campaign_access", [])
    campaign_names = []
    if campaign_ids:
        campaigns = await db.campaigns.find(
            {"id": {"$in": campaign_ids}},
            {"_id": 0, "name": 1}
        ).to_list(100)
        campaign_names = [c["name"] for c in campaigns]
    
    logger.info(f"Kiosk volunteer updated: {updated['email']} by {current_user.email}")
    
    return KioskVolunteerResponse(
        id=updated["id"],
        name=updated["name"],
        email=updated["email"],
        phone=updated.get("phone"),
        campaign_ids=campaign_ids,
        campaign_names=campaign_names,
        is_active=updated.get("is_active", True),
        created_at=updated.get("created_at", ""),
        last_login=updated.get("last_login")
    )


@router.delete("/{volunteer_id}")
async def delete_kiosk_volunteer(
    volunteer_id: str,
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete a kiosk volunteer account."""
    volunteer = await db.users.find_one(
        {"id": volunteer_id, "role": UserRole.KIOSK_VOLUNTEER}
    )
    
    if not volunteer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Volunteer not found"
        )
    
    await db.users.delete_one({"id": volunteer_id})
    
    logger.info(f"Kiosk volunteer deleted: {volunteer['email']} by {current_user.email}")
    
    return {"message": "Volunteer deleted successfully"}


@router.post("/{volunteer_id}/assign-campaigns")
async def assign_campaigns_to_volunteer(
    volunteer_id: str,
    request: AssignVolunteerRequest,
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Assign campaigns to a kiosk volunteer."""
    volunteer = await db.users.find_one(
        {"id": volunteer_id, "role": UserRole.KIOSK_VOLUNTEER}
    )
    
    if not volunteer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Volunteer not found"
        )
    
    # Verify all campaigns exist
    campaigns = await db.campaigns.find(
        {"id": {"$in": request.campaign_ids}},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    found_ids = {c["id"] for c in campaigns}
    invalid_ids = set(request.campaign_ids) - found_ids
    
    if invalid_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid campaign IDs: {list(invalid_ids)}"
        )
    
    await db.users.update_one(
        {"id": volunteer_id},
        {"$set": {
            "campaign_access": request.campaign_ids,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    campaign_names = [c["name"] for c in campaigns]
    
    return {
        "message": "Campaigns assigned successfully",
        "volunteer_id": volunteer_id,
        "campaign_ids": request.campaign_ids,
        "campaign_names": campaign_names
    }


@router.post("/{volunteer_id}/reset-password")
async def reset_volunteer_password(
    volunteer_id: str,
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Reset a volunteer's password to a new temporary password."""
    volunteer = await db.users.find_one(
        {"id": volunteer_id, "role": UserRole.KIOSK_VOLUNTEER}
    )
    
    if not volunteer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Volunteer not found"
        )
    
    # Generate new temporary password
    temp_password = generate_temp_password()
    hashed_password = pwd_context.hash(temp_password)
    
    await db.users.update_one(
        {"id": volunteer_id},
        {"$set": {
            "hashed_password": hashed_password,
            "must_change_password": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Password reset for volunteer: {volunteer['email']} by {current_user.email}")
    
    return {
        "message": "Password reset successfully",
        "volunteer_email": volunteer["email"],
        "temporary_password": temp_password
    }


@router.get("/campaigns/{campaign_id}/volunteers", response_model=List[KioskVolunteerResponse])
async def get_campaign_volunteers(
    campaign_id: str,
    current_user: UserInDB = Depends(require_admin_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get all volunteers assigned to a specific campaign."""
    # Verify campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Find volunteers with this campaign in their access list
    volunteers = await db.users.find(
        {
            "role": UserRole.KIOSK_VOLUNTEER,
            "campaign_access": campaign_id
        },
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    result = []
    for v in volunteers:
        campaign_ids = v.get("campaign_access", [])
        
        # Get all campaign names for this volunteer
        campaign_names = []
        if campaign_ids:
            campaigns = await db.campaigns.find(
                {"id": {"$in": campaign_ids}},
                {"_id": 0, "name": 1}
            ).to_list(100)
            campaign_names = [c["name"] for c in campaigns]
        
        result.append(KioskVolunteerResponse(
            id=v["id"],
            name=v["name"],
            email=v["email"],
            phone=v.get("phone"),
            campaign_ids=campaign_ids,
            campaign_names=campaign_names,
            is_active=v.get("is_active", True),
            created_at=v.get("created_at", ""),
            last_login=v.get("last_login")
        ))
    
    return result
