from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone

from models import UserRole, UserInDB
from auth import decode_access_token, hash_password, validate_password_strength
from audit_log import audit, AuditEventType
from security import sanitize_html, token_blacklist

router = APIRouter(prefix="/api", tags=["users"])
security = HTTPBearer()

# Get database
async def get_db():
    from server import db
    return db

# Get current user with database access
async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    token = credentials.credentials
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    token_issued_at = payload.get("iat")
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check if token is blacklisted
    if token_blacklist.is_blacklisted(token, user_id, token_issued_at):
        raise HTTPException(status_code=401, detail="Token has been revoked")
    
    user_data = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_data:
        raise HTTPException(status_code=401, detail="User not found")
    
    if not user_data.get("is_active", True):
        raise HTTPException(status_code=401, detail="User account is disabled")
    
    return UserInDB(**user_data)

# Require super admin or director
async def require_super_admin(current_user: UserInDB = Depends(get_current_user_with_db)):
    # Allow super admins and directors (users with can_approve_transfers)
    if current_user.role != UserRole.SUPER_ADMIN and not current_user.can_approve_transfers:
        raise HTTPException(status_code=403, detail="Super admin or director access required")
    return current_user

class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str
    campaign_access: List[str] = []
    can_approve_transfers: bool = False
    created_at: datetime
    is_active: Optional[bool] = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    campaign_access: Optional[List[str]] = None
    can_approve_transfers: Optional[bool] = None

class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "org_admin"
    campaign_access: List[str] = []
    can_approve_transfers: bool = False

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """List all users (Super Admin only)"""
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return users

@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Create a new user (Super Admin only)"""
    import uuid
    
    # Validate password strength (banking-level)
    is_valid, error_msg = validate_password_strength(user_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=400, 
            detail=error_msg
        )
    
    # Sanitize name to prevent XSS
    safe_name = sanitize_html(user_data.name) if user_data.name else None
    
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate role
    if user_data.role not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'super_admin' or 'org_admin'")
    
    # Org admins must have at least one campaign assigned
    if user_data.role == "org_admin" and len(user_data.campaign_access) == 0:
        raise HTTPException(status_code=400, detail="Organisation admin must be assigned to at least one campaign")
    
    now = datetime.now(timezone.utc)
    new_user = {
        "id": str(uuid.uuid4()),
        "email": user_data.email.lower(),
        "name": safe_name,
        "hashed_password": hash_password(user_data.password),
        "role": user_data.role,
        "campaign_access": user_data.campaign_access,
        "can_approve_transfers": user_data.can_approve_transfers if user_data.role == "super_admin" else False,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    
    await db.users.insert_one(new_user)
    
    # Log user creation
    await audit.log(
        AuditEventType.USER_CREATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="user",
        resource_id=new_user["id"],
        action_details={
            "created_user_email": user_data.email,
            "created_user_role": user_data.role,
            "can_approve_transfers": new_user["can_approve_transfers"]
        }
    )
    
    # Return without password
    del new_user["hashed_password"]
    if "_id" in new_user:
        del new_user["_id"]
    
    return new_user

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get a specific user (Super Admin only)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update a user (Super Admin only)"""
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_dict = {}
    
    if user_data.name is not None:
        update_dict["name"] = user_data.name
    
    if user_data.role is not None:
        if user_data.role not in ["super_admin", "org_admin"]:
            raise HTTPException(status_code=400, detail="Invalid role")
        update_dict["role"] = user_data.role
    
    if user_data.password:
        update_dict["hashed_password"] = hash_password(user_data.password)
    
    if user_data.campaign_access is not None:
        update_dict["campaign_access"] = user_data.campaign_access
    
    if user_data.can_approve_transfers is not None:
        # Only super admins can have approval permission
        final_role = user_data.role if user_data.role else existing.get("role")
        if final_role == "super_admin":
            update_dict["can_approve_transfers"] = user_data.can_approve_transfers
        else:
            update_dict["can_approve_transfers"] = False
    
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": update_dict}
    )
    
    # Log user update
    await audit.log(
        AuditEventType.USER_UPDATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="user",
        resource_id=user_id,
        action_details={
            "updated_fields": list(update_dict.keys()),
            "target_user_email": existing.get("email")
        }
    )
    
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return updated

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete a user (Super Admin only, cannot delete super admins)"""
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    if existing.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot delete super admin users")
    
    await db.users.delete_one({"id": user_id})
    
    # Log user deletion
    await audit.log(
        AuditEventType.USER_DELETED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="user",
        resource_id=user_id,
        action_details={
            "deleted_user_email": existing.get("email"),
            "deleted_user_role": existing.get("role")
        }
    )
    
    return {"message": "User deleted successfully"}
