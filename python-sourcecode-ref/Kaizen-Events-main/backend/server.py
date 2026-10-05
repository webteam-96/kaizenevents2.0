from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import re

from models import (
    UserCreate, UserLogin, UserResponse, TokenResponse, UserInDB,
    CampaignCreate, CampaignResponse, CampaignUpdate, CampaignInDB,
    PasswordResetRequest, PasswordResetConfirm, UserAccessUpdate,
    UserRole, CampaignStatus, CampaignStats
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_super_admin, security
)
from security import (
    SecurityHeadersMiddleware, RateLimitMiddleware, SuspiciousActivityMiddleware,
    sanitize_html, sanitize_dict, login_rate_limiter,
    validate_password_strength, is_valid_uuid, validate_email,
    token_blacklist, security_audit, suspicious_activity,
    data_encryption, request_validator, ip_access, get_safe_error_message
)
from audit_log import audit, AuditEventType

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize audit logger with database
audit.set_db(db)

# Create the main app with security settings
app = FastAPI(
    title="Kaizen Events API",
    docs_url=None if os.environ.get("DISABLE_DOCS") else "/docs",  # Disable in production
    redoc_url=None if os.environ.get("DISABLE_DOCS") else "/redoc",
    openapi_url=None if os.environ.get("DISABLE_DOCS") else "/openapi.json"
)

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ==================== GLOBAL EXCEPTION HANDLERS ====================

from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler - prevents stack trace leaks in production.
    Logs full error internally, returns safe message to client.
    """
    # Log full error details internally
    logger.error(f"Unhandled exception: {type(exc).__name__}: {str(exc)}", exc_info=True)
    
    # Log to security audit for potential attack detection
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    security_audit.log_suspicious_activity(
        client_ip.split(",")[0].strip(),
        "unhandled_exception",
        f"{type(exc).__name__}: {str(exc)[:100]}"
    )
    
    # Return safe error message (no stack trace)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again later."}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle validation errors with safe messages.
    Don't reveal internal field names or structure.
    """
    # Log full validation error internally
    logger.warning(f"Validation error: {exc.errors()}")
    
    # Return sanitized error messages
    safe_errors = []
    for error in exc.errors():
        field = error.get("loc", ["unknown"])[-1]
        msg = error.get("msg", "Invalid value")
        # Don't expose internal field names that start with underscore
        if not str(field).startswith("_"):
            safe_errors.append({"field": field, "message": msg})
    
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation error", "errors": safe_errors}
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Handle HTTP exceptions - ensure no sensitive info leaks.
    """
    # For 500 errors, hide details
    if exc.status_code >= 500:
        logger.error(f"HTTP {exc.status_code}: {exc.detail}")
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": "An error occurred. Please try again later."}
        )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

# ==================== HELPER FUNCTIONS ====================

def create_slug(name: str) -> str:
    """Create URL-friendly slug from campaign name"""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug

async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user with database access and token validation"""
    from auth import decode_access_token
    token = credentials.credentials
    payload = decode_access_token(token)
    user_id: str = payload.get("sub")
    token_issued_at = payload.get("iat")
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    # Check if token is blacklisted
    if token_blacklist.is_blacklisted(token, user_id, token_issued_at):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked"
        )
    
    user_data = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Check if user is active
    if not user_data.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled"
        )
    
    return UserInDB(**user_data)

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """Register a new user (only super admin can create users)"""
    # Validate password strength
    is_valid, error_msg = validate_password_strength(user_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Org admins must have at least one campaign assigned
    if user_data.role == UserRole.ORG_ADMIN and len(user_data.campaign_access) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organisation admins must have at least one campaign assigned"
        )
    
    # Create user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "role": user_data.role,
        "hashed_password": hash_password(user_data.password),
        "campaign_access": user_data.campaign_access,
        "can_approve_transfers": user_data.can_approve_transfers,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "is_active": True
    }
    
    await db.users.insert_one(user_doc)
    
    return UserResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        role=user_data.role,
        campaign_access=user_data.campaign_access,
        can_approve_transfers=user_data.can_approve_transfers,
        created_at=now,
        is_active=True
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin, request: Request):
    """Login user and return JWT token with enhanced security"""
    # Get client IP for rate limiting (handle proxies)
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    user_agent = request.headers.get("user-agent", "unknown")[:200]  # Limit UA length
    
    # Validate email format
    if not validate_email(credentials.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format"
        )
    
    # Check IP blocklist
    if ip_access.is_blocked(client_ip):
        security_audit.log_auth_failure(credentials.email, client_ip, "IP blocked")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Check if login attempts are blocked (with remaining time)
    is_blocked, remaining_seconds = login_rate_limiter.is_blocked(credentials.email, client_ip)
    if is_blocked:
        security_audit.log_auth_failure(credentials.email, client_ip, "Rate limit exceeded")
        await audit.log_login_failed(
            credentials.email, client_ip, user_agent,
            "Rate limit exceeded"
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {remaining_seconds // 60 + 1} minutes.",
            headers={"Retry-After": str(remaining_seconds)}
        )
    
    # Sanitize email before database query
    from security import sanitize_mongo_query
    safe_email = sanitize_mongo_query(credentials.email.lower().strip())
    
    user_data = await db.users.find_one({"email": safe_email}, {"_id": 0})
    
    if not user_data or not verify_password(credentials.password, user_data["hashed_password"]):
        # Record failed attempt
        login_rate_limiter.record_failed_attempt(credentials.email, client_ip)
        suspicious_activity.record_failed_auth(client_ip)
        security_audit.log_auth_failure(credentials.email, client_ip, "Invalid credentials")
        await audit.log_login_failed(
            credentials.email, client_ip, user_agent,
            "Invalid credentials"
        )
        
        # Get remaining attempts for user-friendly message
        remaining = login_rate_limiter.get_remaining_attempts(credentials.email, client_ip)
        if remaining > 0:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Incorrect email or password. {remaining} attempts remaining."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
    
    if not user_data.get("is_active", True):
        security_audit.log_auth_failure(credentials.email, client_ip, "Account deactivated")
        await audit.log_login_failed(
            credentials.email, client_ip, user_agent,
            "Account deactivated"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )
    
    # Clear failed attempts on successful login
    login_rate_limiter.clear_attempts(credentials.email, client_ip)
    
    # Create access token
    access_token = create_access_token(data={"sub": user_data["id"]})
    
    # Log successful login
    security_audit.log_auth_success(credentials.email, client_ip, user_agent)
    await audit.log_login_success(
        user_data["id"], credentials.email, client_ip, user_agent
    )
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_data["id"],
            email=user_data["email"],
            name=user_data["name"],
            role=user_data["role"],
            campaign_access=user_data.get("campaign_access", []),
            can_approve_transfers=user_data.get("can_approve_transfers", False),
            created_at=user_data["created_at"] if isinstance(user_data["created_at"], datetime) else datetime.fromisoformat(user_data["created_at"]),
            is_active=user_data.get("is_active", True)
        )
    )


@api_router.post("/auth/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Logout user and invalidate their token"""
    token = credentials.credentials
    
    # Add token to blacklist
    token_blacklist.blacklist_token(token, 86400)  # Blacklist for 24 hours
    
    # Log the logout
    security_audit.log_admin_action(current_user.id, "logout", current_user.email)
    
    return {"message": "Successfully logged out"}


@api_router.post("/auth/logout-all")
async def logout_all_sessions(
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Logout user from all devices by revoking all their tokens"""
    # Revoke all tokens for this user
    token_blacklist.revoke_all_user_tokens(current_user.id)
    
    # Log the action
    security_audit.log_admin_action(current_user.id, "logout_all_sessions", current_user.email)
    
    return {"message": "Successfully logged out from all devices"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserInDB = Depends(get_current_user_with_db)):
    """Get current user information"""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        campaign_access=current_user.campaign_access,
        can_approve_transfers=current_user.can_approve_transfers,
        created_at=current_user.created_at,
        is_active=current_user.is_active
    )

@api_router.post("/auth/password-reset-request")
async def request_password_reset(request: PasswordResetRequest):
    """Request password reset (sends reset code - mocked for now)"""
    user_data = await db.users.find_one({"email": request.email})
    
    if not user_data:
        # Don't reveal if email exists
        return {"message": "If the email exists, a reset code has been sent"}
    
    # In production, send email with reset code
    # For now, just store reset code in database
    from auth import generate_reset_code
    reset_code = generate_reset_code()
    
    await db.password_resets.insert_one({
        "email": request.email,
        "reset_code": reset_code,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "used": False
    })
    
    logger.info(f"Password reset code for {request.email}: {reset_code}")
    
    return {"message": "If the email exists, a reset code has been sent"}

@api_router.post("/auth/password-reset-confirm")
async def confirm_password_reset(request: PasswordResetConfirm):
    """Confirm password reset with code"""
    reset_data = await db.password_resets.find_one({
        "email": request.email,
        "reset_code": request.reset_code,
        "used": False
    })
    
    if not reset_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset code"
        )
    
    # Update user password
    await db.users.update_one(
        {"email": request.email},
        {"$set": {
            "hashed_password": hash_password(request.new_password),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Mark reset code as used
    await db.password_resets.update_one(
        {"email": request.email, "reset_code": request.reset_code},
        {"$set": {"used": True}}
    )
    
    return {"message": "Password reset successful"}

# ==================== CAMPAIGN ROUTES ====================

@api_router.post("/campaigns", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    campaign_data: CampaignCreate,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Create a new campaign (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can create campaigns"
        )
    
    # Sanitize user inputs to prevent XSS
    sanitized_name = sanitize_html(campaign_data.name)
    sanitized_org = sanitize_html(campaign_data.organization_name)
    sanitized_desc = sanitize_html(campaign_data.description) if campaign_data.description else None
    sanitized_purpose = sanitize_html(campaign_data.payment_purpose) if campaign_data.payment_purpose else None
    
    # Validate slug format (alphanumeric and hyphens only)
    if not re.match(r'^[a-z0-9-]+$', campaign_data.slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug can only contain lowercase letters, numbers, and hyphens"
        )
    
    # Check if slug already exists
    existing_campaign = await db.campaigns.find_one({"slug": campaign_data.slug})
    if existing_campaign:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign slug already exists"
        )
    
    campaign_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    campaign_doc = {
        "id": campaign_id,
        "name": sanitized_name,
        "slug": campaign_data.slug,
        "organization_name": sanitized_org,
        "campaign_type": campaign_data.campaign_type.value if campaign_data.campaign_type else "open",
        "fund_collection_mode": campaign_data.fund_collection_mode.value if campaign_data.fund_collection_mode else None,
        "payment_collection_method": campaign_data.payment_collection_method or "online",
        "kiosk_enabled": campaign_data.kiosk_enabled if campaign_data.kiosk_enabled is not None else False,
        "show_on_homepage": campaign_data.show_on_homepage if campaign_data.show_on_homepage is not None else True,
        "event_logo": campaign_data.logo_url or campaign_data.event_logo,  # Support both field names
        "logo_url": campaign_data.logo_url or campaign_data.event_logo,
        "has_landing_page": campaign_data.has_landing_page if campaign_data.has_landing_page is not None else True,
        "registration_enabled": True,
        "status": campaign_data.status,
        "start_date": campaign_data.start_date.isoformat() if campaign_data.start_date else None,
        "end_date": campaign_data.end_date.isoformat() if campaign_data.end_date else None,
        "registration_start_date": campaign_data.registration_start_date.isoformat() if campaign_data.registration_start_date else None,
        "registration_end_date": campaign_data.registration_end_date.isoformat() if campaign_data.registration_end_date else None,
        "payment_gateway": campaign_data.payment_gateway,
        "payment_account_id": campaign_data.payment_account_id,
        "payment_purpose": sanitized_purpose,
        "max_registrations": campaign_data.max_registrations,
        "current_registrations": 0,
        "total_revenue": 0.0,
        "total_transferred": 0.0,
        "description": sanitized_desc,
        "form_config": None,
        "landing_page_config": None,
        "payment_config": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": current_user.id,
        "archived_at": None
    }
    
    await db.campaigns.insert_one(campaign_doc)
    
    # Log campaign creation
    await audit.log(
        AuditEventType.CAMPAIGN_CREATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="campaign",
        resource_id=campaign_id,
        action_details={
            "campaign_name": sanitized_name,
            "organization": sanitized_org,
            "slug": campaign_data.slug
        }
    )
    
    return CampaignResponse(**campaign_doc)

@api_router.get("/campaigns", response_model=List[CampaignResponse])
async def list_campaigns(current_user: UserInDB = Depends(get_current_user_with_db)):
    """List campaigns based on user role and access"""
    if current_user.role == UserRole.SUPER_ADMIN:
        # Super admin sees all campaigns
        campaigns = await db.campaigns.find({}).to_list(1000)
    else:
        # Org admin sees only assigned campaigns
        campaigns = await db.campaigns.find({
            "id": {"$in": current_user.campaign_access}
        }).to_list(1000)
    
    return [CampaignResponse(**c) for c in campaigns]

@api_router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Get campaign details"""
    campaign_data = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return CampaignResponse(**campaign_data)

@api_router.put("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    update_data: CampaignUpdate,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Update campaign (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can update campaigns"
        )
    
    campaign_data = await db.campaigns.find_one({"id": campaign_id})
    if not campaign_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Prepare update
    update_dict = update_data.model_dump(exclude_unset=True)
    if update_dict:
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Sanitize text fields to prevent XSS
        text_fields = ["name", "organization_name", "description", "payment_purpose"]
        for field in text_fields:
            if field in update_dict and update_dict[field]:
                update_dict[field] = sanitize_html(update_dict[field])
        
        # Sync logo_url and event_logo fields
        if "logo_url" in update_dict and update_dict["logo_url"]:
            update_dict["event_logo"] = update_dict["logo_url"]
        elif "event_logo" in update_dict and update_dict["event_logo"]:
            update_dict["logo_url"] = update_dict["event_logo"]
        
        # Convert campaign_type enum to string
        if "campaign_type" in update_dict and update_dict["campaign_type"]:
            update_dict["campaign_type"] = update_dict["campaign_type"].value if hasattr(update_dict["campaign_type"], 'value') else update_dict["campaign_type"]
        
        # Convert fund_collection_mode enum to string
        if "fund_collection_mode" in update_dict and update_dict["fund_collection_mode"]:
            update_dict["fund_collection_mode"] = update_dict["fund_collection_mode"].value if hasattr(update_dict["fund_collection_mode"], 'value') else update_dict["fund_collection_mode"]
        
        # Convert datetime fields to ISO strings
        if "start_date" in update_dict and update_dict["start_date"]:
            update_dict["start_date"] = update_dict["start_date"].isoformat()
        if "end_date" in update_dict and update_dict["end_date"]:
            update_dict["end_date"] = update_dict["end_date"].isoformat()
        if "registration_start_date" in update_dict and update_dict["registration_start_date"]:
            update_dict["registration_start_date"] = update_dict["registration_start_date"].isoformat()
        if "registration_end_date" in update_dict and update_dict["registration_end_date"]:
            update_dict["registration_end_date"] = update_dict["registration_end_date"].isoformat()
        
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": update_dict}
        )
        
        # Log campaign update
        await audit.log(
            AuditEventType.CAMPAIGN_UPDATED,
            user_id=current_user.id,
            user_email=current_user.email,
            resource_type="campaign",
            resource_id=campaign_id,
            action_details={
                "updated_fields": list(update_dict.keys()),
                "campaign_name": campaign_data.get("name")
            }
        )
    
    # Get updated campaign
    updated_campaign = await db.campaigns.find_one({"id": campaign_id})
    return CampaignResponse(**updated_campaign)

@api_router.post("/campaigns/{campaign_id}/archive")
async def archive_campaign(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Archive a campaign (Super Admin only) - Only active campaigns can be archived"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can archive campaigns"
        )
    
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only allow archiving of active campaigns
    if campaign.get("status") != CampaignStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only active campaigns can be archived. Please activate the campaign first."
        )
    
    now = datetime.now(timezone.utc)
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "status": CampaignStatus.ARCHIVED,
            "archived_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    return {"message": "Campaign archived successfully"}

@api_router.post("/campaigns/{campaign_id}/unarchive")
async def unarchive_campaign(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Unarchive a campaign (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can unarchive campaigns"
        )
    
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    if campaign.get("status") != CampaignStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign is not archived"
        )
    
    now = datetime.now(timezone.utc)
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "status": CampaignStatus.ACTIVE,
            "archived_at": None,
            "updated_at": now.isoformat()
        }}
    )
    
    return {"message": "Campaign restored successfully"}

@api_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Delete campaign (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can delete campaigns"
        )
    
    # Get campaign name before deletion
    campaign = await db.campaigns.find_one({"id": campaign_id})
    campaign_name = campaign.get("name") if campaign else "Unknown"
    
    result = await db.campaigns.delete_one({"id": campaign_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Log campaign deletion
    await audit.log(
        AuditEventType.CAMPAIGN_DELETED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="campaign",
        resource_id=campaign_id,
        action_details={"campaign_name": campaign_name}
    )
    
    return {"message": "Campaign deleted successfully"}

@api_router.get("/campaigns/{campaign_id}/stats", response_model=CampaignStats)
async def get_campaign_stats(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Get campaign statistics"""
    campaign_data = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    total_registrations = campaign_data.get("current_registrations", 0) or 0
    total_revenue = campaign_data.get("total_revenue", 0.0) or 0.0
    max_registrations = campaign_data.get("max_registrations") or 0
    
    return CampaignStats(
        total_registrations=total_registrations,
        total_revenue=total_revenue,
        paid_registrations=total_registrations,  # For now, all are paid
        registration_rate=(total_registrations / max_registrations * 100) if max_registrations and max_registrations > 0 else 0
    )

# ==================== USER MANAGEMENT ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def list_users(current_user: UserInDB = Depends(get_current_user_with_db)):
    """List all users (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can list users"
        )
    
    users = await db.users.find({}).to_list(1000)
    
    return [
        UserResponse(
            id=u["id"],
            email=u["email"],
            name=u["name"],
            role=u["role"],
            campaign_access=u.get("campaign_access", []),
            created_at=u["created_at"] if isinstance(u["created_at"], datetime) else datetime.fromisoformat(u["created_at"]),
            is_active=u.get("is_active", True)
        )
        for u in users
    ]

@api_router.put("/users/{user_id}/access")
async def update_user_access(
    user_id: str,
    access_update: UserAccessUpdate,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Update user's campaign access (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can update user access"
        )
    
    user_data = await db.users.find_one({"id": user_id})
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "campaign_access": access_update.campaign_ids,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "User access updated successfully"}

# ==================== DASHBOARD ROUTES ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: UserInDB = Depends(get_current_user_with_db)):
    """Get dashboard statistics"""
    if current_user.role == UserRole.SUPER_ADMIN:
        # Global stats for super admin
        total_campaigns = await db.campaigns.count_documents({})
        active_campaigns = await db.campaigns.count_documents({"status": CampaignStatus.ACTIVE})
        
        # Sum total revenue and registrations
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_revenue": {"$sum": "$total_revenue"},
                    "total_registrations": {"$sum": "$current_registrations"}
                }
            }
        ]
        result = await db.campaigns.aggregate(pipeline).to_list(1)
        
        if result:
            total_revenue = result[0].get("total_revenue", 0)
            total_registrations = result[0].get("total_registrations", 0)
        else:
            total_revenue = 0
            total_registrations = 0
        
        return {
            "total_campaigns": total_campaigns,
            "active_campaigns": active_campaigns,
            "total_revenue": total_revenue,
            "total_registrations": total_registrations
        }
    else:
        # Stats for assigned campaigns only
        campaigns = await db.campaigns.find({
            "id": {"$in": current_user.campaign_access}
        }).to_list(1000)
        
        total_revenue = sum(c.get("total_revenue", 0) for c in campaigns)
        total_registrations = sum(c.get("current_registrations", 0) for c in campaigns)
        active_campaigns = sum(1 for c in campaigns if c.get("status") == CampaignStatus.ACTIVE)
        
        return {
            "total_campaigns": len(campaigns),
            "active_campaigns": active_campaigns,
            "total_revenue": total_revenue,
            "total_registrations": total_registrations
        }

# Include routers in app
app.include_router(api_router)

# Include form builder routes
from form_routes import router as form_router
app.include_router(form_router)

# Include landing page routes
from landing_page_routes import router as landing_router
app.include_router(landing_router)

# Include registration routes
from registration_routes import router as registration_router
app.include_router(registration_router)

# Include analytics routes
from analytics_routes import router as analytics_router
app.include_router(analytics_router)

# Include payment accounts routes
from payment_accounts_routes import router as payment_accounts_router
app.include_router(payment_accounts_router)

# Include upload routes
from upload_routes import router as upload_router
app.include_router(upload_router)

# Include payment checkout routes
from payment_routes import router as payment_router
app.include_router(payment_router)

# Include user management routes
from user_routes import router as user_router
app.include_router(user_router)

# Include notification routes (WhatsApp & Email)
from notification_routes import router as notification_router
app.include_router(notification_router)

# Include Google Sheets integration routes
from sheets_routes import router as sheets_router
app.include_router(sheets_router)

# Include DKIM registration routes
from dkim_routes import router as dkim_router
app.include_router(dkim_router)

from integration_routes import router as integration_router
app.include_router(integration_router)

from campaign_member_routes import router as campaign_member_router
app.include_router(campaign_member_router)

from fund_transfer_routes import router as fund_transfer_router
app.include_router(fund_transfer_router)

from activity_log_routes import router as activity_log_router
app.include_router(activity_log_router)

from offline_payment_routes import router as offline_payment_router
app.include_router(offline_payment_router)

from whatsapp_routes import router as whatsapp_router
app.include_router(whatsapp_router)

from kiosk_routes import router as kiosk_router
app.include_router(kiosk_router)

from kiosk_volunteer_routes import router as kiosk_volunteer_router
app.include_router(kiosk_volunteer_router)

from url_shortener_routes import router as url_shortener_router
app.include_router(url_shortener_router)

# Startup event to create indexes
@app.on_event("startup")
async def create_indexes():
    """Create database indexes on startup"""
    try:
        # TTL index for audit logs - auto-delete after 2 years (730 days)
        await db.audit_logs.create_index(
            "timestamp",
            expireAfterSeconds=730 * 24 * 60 * 60  # 2 years in seconds
        )
        logger.info("Created TTL index on audit_logs (2 year retention)")
        
        # Index for faster queries
        await db.audit_logs.create_index([("event_type", 1), ("timestamp", -1)])
        await db.audit_logs.create_index([("user_id", 1), ("timestamp", -1)])
        await db.audit_logs.create_index([("resource_type", 1), ("resource_id", 1)])
        logger.info("Created query indexes on audit_logs")
    except Exception as e:
        logger.warning(f"Index creation warning (may already exist): {e}")

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Add suspicious activity detection middleware
app.add_middleware(SuspiciousActivityMiddleware)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# CORS middleware - STRICT origin control (NO wildcards)
allowed_origins = os.environ.get('CORS_ORIGINS', '')
if allowed_origins == '*' or not allowed_origins:
    # Explicitly allowed origins only - NO wildcards in production
    allowed_origins = [
        "https://kioskflow.preview.emergentagent.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]
else:
    allowed_origins = [origin.strip() for origin in allowed_origins.split(',') if origin.strip() and origin.strip() != '*']

# Ensure no wildcards
allowed_origins = [o for o in allowed_origins if o != '*']

logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-CSRF-Token", "X-Request-Timestamp", "X-Request-Signature"],
    expose_headers=["X-Request-Id"],
    max_age=600,  # Cache preflight for 10 minutes
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Kaizen Events API"}
