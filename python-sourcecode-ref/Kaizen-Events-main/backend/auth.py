"""
BANKING-LEVEL AUTHENTICATION MODULE
Enhanced JWT authentication with token blacklist, refresh tokens, and audit logging.
"""
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models import UserInDB, UserRole
from typing import Optional, Tuple
import os
import secrets
import logging
import hashlib

logger = logging.getLogger("auth")

# Security configuration - Use strong secrets
_jwt_secret = os.getenv("JWT_SECRET_KEY")
if not _jwt_secret or _jwt_secret == "your-secret-key-change-in-production":
    _jwt_secret = secrets.token_urlsafe(64)
    logger.warning("JWT_SECRET_KEY not set or using default. Generated random secret for this session.")

_refresh_secret = os.getenv("JWT_REFRESH_SECRET")
if not _refresh_secret:
    _refresh_secret = secrets.token_urlsafe(64)

SECRET_KEY = _jwt_secret
REFRESH_SECRET = _refresh_secret
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # Reduced from 24 hours to 30 minutes for security
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Use bcrypt with increased work factor for stronger hashing
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Increased from default 10
)
security = HTTPBearer()


# ==================== PASSWORD HASHING ====================

def hash_password(password: str) -> str:
    """Hash password using bcrypt with strong work factor"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Don't reveal details about hash failures
        return False


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password meets banking-level security requirements.
    """
    import re
    
    if len(password) < 12:
        return False, "Password must be at least 12 characters long"
    
    if len(password) > 128:
        return False, "Password must not exceed 128 characters"
    
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;\'`~]', password):
        return False, "Password must contain at least one special character"
    
    # Check for common weak patterns
    weak_patterns = [
        r'(.)\1{2,}',  # More than 2 repeated chars
        r'(012|123|234|345|456|567|678|789|890)',  # Sequential numbers
        r'(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)',  # Sequential letters
    ]
    
    for pattern in weak_patterns:
        if re.search(pattern, password.lower()):
            return False, "Password contains weak patterns (sequential or repeated characters)"
    
    return True, ""


# ==================== JWT TOKEN FUNCTIONS ====================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token with enhanced claims"""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Add security claims
    to_encode.update({
        "exp": expire,
        "iat": now,  # Issued at
        "nbf": now,  # Not before
        "jti": secrets.token_urlsafe(16),  # Unique token ID
        "type": "access"
    })
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(user_id: str) -> Tuple[str, datetime]:
    """Create refresh token for token renewal"""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode = {
        "sub": user_id,
        "exp": expire,
        "iat": now,
        "jti": secrets.token_urlsafe(16),
        "type": "refresh"
    }
    
    token = jwt.encode(to_encode, REFRESH_SECRET, algorithm=ALGORITHM)
    return token, expire


def decode_access_token(token: str) -> dict:
    """Decode and validate JWT access token"""
    try:
        payload = jwt.decode(
            token, 
            SECRET_KEY, 
            algorithms=[ALGORITHM],
            options={
                "verify_exp": True,
                "verify_iat": True,
                "verify_nbf": True,
                "require": ["exp", "sub", "iat"]
            }
        )
        
        # Verify token type
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError as e:
        logger.warning(f"JWT decode error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_refresh_token(token: str) -> dict:
    """Decode and validate refresh token"""
    try:
        payload = jwt.decode(
            token,
            REFRESH_SECRET,
            algorithms=[ALGORITHM],
            options={"verify_exp": True, "require": ["exp", "sub"]}
        )
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired. Please login again."
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )


# ==================== USER AUTHENTICATION ====================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db=None
) -> UserInDB:
    """Get current authenticated user with token validation"""
    token = credentials.credentials
    
    # Import here to avoid circular dependency
    from security import token_blacklist
    
    # Decode token first
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
    
    # Get user from database
    from motor.motor_asyncio import AsyncIOMotorDatabase
    if db is None:
        raise HTTPException(status_code=500, detail="Database not available")
    
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


async def get_current_user_with_request(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db=None
) -> Tuple[UserInDB, Request]:
    """Get current user and request for audit logging"""
    user = await get_current_user(credentials, db)
    return user, request


# ==================== ROLE-BASED ACCESS CONTROL ====================

def require_super_admin(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    """Require super admin role"""
    if current_user.role != UserRole.SUPER_ADMIN:
        # Import here to avoid circular dependency
        from security import security_audit
        security_audit.log_access_denied(current_user.id, "super_admin_endpoint", "unknown")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required"
        )
    return current_user


def require_authenticated(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    """Any authenticated user"""
    return current_user


def require_write_access(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    """Only super_admin can write (create/update/delete)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write access requires super admin role"
        )
    return current_user


def require_campaign_access(campaign_id: str):
    """Check if user has access to specific campaign"""
    async def check_access(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
        if current_user.role == UserRole.SUPER_ADMIN:
            return current_user
        
        if current_user.can_approve_transfers:  # Director access
            return current_user
        
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this campaign"
            )
        return current_user
    
    return check_access


def require_admin_role(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    """Require super_admin or org_admin role"""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ==================== UTILITY FUNCTIONS ====================

def generate_reset_code() -> str:
    """Generate secure password reset code"""
    return secrets.token_urlsafe(32)


def generate_verification_code(length: int = 6) -> str:
    """Generate numeric verification code"""
    return ''.join(secrets.choice('0123456789') for _ in range(length))


def hash_token(token: str) -> str:
    """Hash a token for secure storage"""
    return hashlib.sha256(token.encode()).hexdigest()


def constant_time_compare(val1: str, val2: str) -> bool:
    """Compare strings in constant time to prevent timing attacks"""
    import hmac
    return hmac.compare_digest(val1, val2)
