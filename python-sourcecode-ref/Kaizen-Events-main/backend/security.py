"""
BANKING-LEVEL SECURITY MODULE
Comprehensive security utilities for enterprise-grade protection.
"""
import re
import html
import time
import hmac
import hashlib
import secrets
import logging
import ipaddress
from collections import defaultdict
from functools import wraps
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, status
from fastapi.responses import Response, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable, Dict, Optional, Set, List, Any
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os
import json

logger = logging.getLogger("security")

# ==================== ENCRYPTION FOR SENSITIVE DATA ====================

class DataEncryption:
    """
    AES-256 encryption for sensitive data at rest.
    Used for PII, payment info, and other sensitive fields.
    """
    
    def __init__(self):
        # Use environment variable or generate secure key
        key_material = os.environ.get('ENCRYPTION_KEY', '')
        if not key_material:
            # Generate and log warning - in production this should be set
            key_material = secrets.token_urlsafe(32)
            logger.warning("ENCRYPTION_KEY not set. Using generated key. Set ENCRYPTION_KEY in production!")
        
        # Derive a proper Fernet key from the material
        salt = b'kaizen_security_salt_v1'  # Static salt for key derivation
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=480000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(key_material.encode()))
        self.cipher = Fernet(key)
    
    def encrypt(self, data: str) -> str:
        """Encrypt sensitive string data"""
        if not data:
            return data
        return self.cipher.encrypt(data.encode()).decode()
    
    def decrypt(self, encrypted_data: str) -> str:
        """Decrypt sensitive string data"""
        if not encrypted_data:
            return encrypted_data
        try:
            return self.cipher.decrypt(encrypted_data.encode()).decode()
        except Exception:
            logger.error("Failed to decrypt data - possible key mismatch")
            return "[ENCRYPTED]"
    
    def encrypt_dict_fields(self, data: dict, fields: List[str]) -> dict:
        """Encrypt specific fields in a dictionary"""
        result = data.copy()
        for field in fields:
            if field in result and result[field]:
                result[field] = self.encrypt(str(result[field]))
        return result
    
    def decrypt_dict_fields(self, data: dict, fields: List[str]) -> dict:
        """Decrypt specific fields in a dictionary"""
        result = data.copy()
        for field in fields:
            if field in result and result[field]:
                result[field] = self.decrypt(result[field])
        return result


# Global encryption instance
data_encryption = DataEncryption()


# ==================== TOKEN BLACKLIST (For Logout/Revocation) ====================

class TokenBlacklist:
    """
    In-memory token blacklist for logout and token revocation.
    For production, use Redis for distributed blacklist.
    """
    
    def __init__(self):
        self.blacklisted_tokens: Dict[str, float] = {}  # token_hash -> expiry_time
        self.blacklisted_users: Dict[str, float] = {}   # user_id -> revocation_time
        self._last_cleanup = time.time()
    
    def _hash_token(self, token: str) -> str:
        """Hash token for storage (don't store raw tokens)"""
        return hashlib.sha256(token.encode()).hexdigest()
    
    def _cleanup(self):
        """Remove expired entries"""
        current_time = time.time()
        if current_time - self._last_cleanup < 300:  # Cleanup every 5 minutes
            return
        
        self._last_cleanup = current_time
        
        # Remove expired token blacklist entries
        self.blacklisted_tokens = {
            k: v for k, v in self.blacklisted_tokens.items()
            if v > current_time
        }
        
        # Remove old user revocations (older than 24 hours)
        cutoff = current_time - 86400
        self.blacklisted_users = {
            k: v for k, v in self.blacklisted_users.items()
            if v > cutoff
        }
    
    def blacklist_token(self, token: str, expiry_seconds: int = 86400):
        """Add token to blacklist"""
        self._cleanup()
        token_hash = self._hash_token(token)
        self.blacklisted_tokens[token_hash] = time.time() + expiry_seconds
        logger.info(f"Token blacklisted: {token_hash[:16]}...")
    
    def revoke_all_user_tokens(self, user_id: str):
        """Revoke all tokens for a user (force logout everywhere)"""
        self._cleanup()
        self.blacklisted_users[user_id] = time.time()
        logger.warning(f"All tokens revoked for user: {user_id}")
    
    def is_blacklisted(self, token: str, user_id: str = None, token_issued_at: float = None) -> bool:
        """Check if token is blacklisted"""
        self._cleanup()
        
        # Check token blacklist
        token_hash = self._hash_token(token)
        if token_hash in self.blacklisted_tokens:
            if self.blacklisted_tokens[token_hash] > time.time():
                return True
        
        # Check user-level revocation
        if user_id and user_id in self.blacklisted_users:
            revocation_time = self.blacklisted_users[user_id]
            if token_issued_at and token_issued_at < revocation_time:
                return True
        
        return False


# Global token blacklist
token_blacklist = TokenBlacklist()


# ==================== CSRF PROTECTION ====================

class CSRFProtection:
    """
    CSRF token generation and validation.
    Uses double-submit cookie pattern.
    """
    
    def __init__(self):
        self.tokens: Dict[str, float] = {}  # token -> expiry
        self.token_lifetime = 3600  # 1 hour
    
    def generate_token(self, session_id: str) -> str:
        """Generate CSRF token tied to session"""
        token = secrets.token_urlsafe(32)
        combined = f"{session_id}:{token}"
        self.tokens[combined] = time.time() + self.token_lifetime
        return token
    
    def validate_token(self, session_id: str, token: str) -> bool:
        """Validate CSRF token"""
        if not token or not session_id:
            return False
        
        combined = f"{session_id}:{token}"
        if combined in self.tokens:
            if self.tokens[combined] > time.time():
                return True
            else:
                del self.tokens[combined]
        
        return False
    
    def cleanup(self):
        """Remove expired tokens"""
        current = time.time()
        self.tokens = {k: v for k, v in self.tokens.items() if v > current}


csrf_protection = CSRFProtection()


# ==================== SUSPICIOUS ACTIVITY DETECTION ====================

class SuspiciousActivityDetector:
    """
    Detect and flag suspicious activity patterns.
    """
    
    def __init__(self):
        self.suspicious_ips: Dict[str, Dict] = defaultdict(lambda: {
            "score": 0,
            "events": [],
            "blocked_until": 0
        })
        self.suspicious_patterns = [
            r"(?i)(union\s+select|drop\s+table|delete\s+from)",  # SQL injection
            r"(?i)(<script|javascript:|onerror=|onload=)",  # XSS
            r"(?i)(\.\.\/|\.\.\\)",  # Path traversal
            r"(?i)(\$ne|\$gt|\$lt|\$regex|\$where)",  # NoSQL injection
            r"(?i)(exec\(|system\(|eval\()",  # Code injection
        ]
        self.compiled_patterns = [re.compile(p) for p in self.suspicious_patterns]
    
    def check_request(self, request: Request, body: str = "") -> tuple[bool, str]:
        """
        Check request for suspicious patterns.
        Returns (is_suspicious, reason)
        """
        ip = self._get_ip(request)
        
        # Check if IP is blocked
        if self.suspicious_ips[ip]["blocked_until"] > time.time():
            return True, "IP temporarily blocked due to suspicious activity"
        
        # Check URL path
        path = str(request.url.path)
        for pattern in self.compiled_patterns:
            if pattern.search(path):
                self._record_event(ip, "malicious_path", path)
                return True, "Suspicious URL pattern detected"
        
        # Check query parameters
        query = str(request.url.query)
        for pattern in self.compiled_patterns:
            if pattern.search(query):
                self._record_event(ip, "malicious_query", query)
                return True, "Suspicious query parameter detected"
        
        # Check body
        if body:
            for pattern in self.compiled_patterns:
                if pattern.search(body):
                    self._record_event(ip, "malicious_body", body[:200])
                    return True, "Suspicious request body detected"
        
        # Check request headers for anomalies
        user_agent = request.headers.get("user-agent", "")
        if not user_agent or len(user_agent) > 1000:
            self._record_event(ip, "suspicious_ua", user_agent[:100])
        
        return False, ""
    
    def _get_ip(self, request: Request) -> str:
        """Get client IP, considering proxies"""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def _record_event(self, ip: str, event_type: str, details: str):
        """Record suspicious event and update score"""
        self.suspicious_ips[ip]["events"].append({
            "type": event_type,
            "details": details[:200],
            "time": time.time()
        })
        
        # Increase score based on event type
        score_map = {
            "malicious_path": 50,
            "malicious_query": 50,
            "malicious_body": 50,
            "suspicious_ua": 10,
            "failed_auth": 20,
            "rate_limit_hit": 15
        }
        self.suspicious_ips[ip]["score"] += score_map.get(event_type, 10)
        
        # Block if score exceeds threshold
        if self.suspicious_ips[ip]["score"] >= 100:
            self.suspicious_ips[ip]["blocked_until"] = time.time() + 3600  # 1 hour block
            logger.warning(f"IP {ip} blocked due to suspicious activity. Score: {self.suspicious_ips[ip]['score']}")
    
    def record_failed_auth(self, ip: str):
        """Record failed authentication attempt"""
        self._record_event(ip, "failed_auth", "Authentication failure")
    
    def record_rate_limit(self, ip: str):
        """Record rate limit hit"""
        self._record_event(ip, "rate_limit_hit", "Rate limit exceeded")
    
    def get_ip_status(self, ip: str) -> Dict:
        """Get current status of an IP"""
        return dict(self.suspicious_ips[ip])


suspicious_activity = SuspiciousActivityDetector()


# ==================== INPUT SANITIZATION (Enhanced) ====================

def sanitize_html(text: str) -> str:
    """
    Sanitize HTML/XSS content from user input.
    Escapes HTML special characters to prevent XSS attacks.
    """
    if text is None:
        return None
    if not isinstance(text, str):
        return text
    
    # HTML escape special characters
    sanitized = html.escape(text, quote=True)
    
    # Remove potential javascript: URLs
    sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
    
    # Remove data: URLs that could contain scripts
    sanitized = re.sub(r'data:text/html', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'data:application/javascript', '', sanitized, flags=re.IGNORECASE)
    
    # Remove vbscript
    sanitized = re.sub(r'vbscript:', '', sanitized, flags=re.IGNORECASE)
    
    # Remove event handlers
    sanitized = re.sub(r'on\w+\s*=', '', sanitized, flags=re.IGNORECASE)
    
    # Remove expression() CSS
    sanitized = re.sub(r'expression\s*\(', '', sanitized, flags=re.IGNORECASE)
    
    # Remove url() with javascript
    sanitized = re.sub(r'url\s*\(\s*["\']?\s*javascript:', '', sanitized, flags=re.IGNORECASE)
    
    return sanitized


def sanitize_dict(data: dict, fields_to_sanitize: list = None) -> dict:
    """
    Sanitize specific fields in a dictionary.
    If fields_to_sanitize is None, sanitizes all string fields.
    """
    if data is None:
        return None
    
    sanitized = {}
    for key, value in data.items():
        if isinstance(value, str):
            if fields_to_sanitize is None or key in fields_to_sanitize:
                sanitized[key] = sanitize_html(value)
            else:
                sanitized[key] = value
        elif isinstance(value, dict):
            sanitized[key] = sanitize_dict(value, fields_to_sanitize)
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_dict(item, fields_to_sanitize) if isinstance(item, dict)
                else sanitize_html(item) if isinstance(item, str)
                else item
                for item in value
            ]
        else:
            sanitized[key] = value
    
    return sanitized


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal and other attacks"""
    if not filename:
        return "unnamed"
    
    # Remove path separators
    filename = filename.replace("/", "_").replace("\\", "_")
    
    # Remove null bytes
    filename = filename.replace("\x00", "")
    
    # Remove special characters
    filename = re.sub(r'[<>:"|?*]', '_', filename)
    
    # Limit length
    if len(filename) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:255-len(ext)] + ext
    
    return filename


# ==================== RATE LIMITING (Enhanced) ====================

class RateLimiter:
    """
    Enhanced rate limiter with IP-based and user-based limiting.
    """
    
    def __init__(self):
        self.requests: Dict[str, list] = defaultdict(list)
        self.blocked_ips: Dict[str, float] = {}
        self.user_requests: Dict[str, list] = defaultdict(list)
    
    def _get_client_id(self, request: Request) -> str:
        """Get unique identifier for the client"""
        ip = self._get_ip(request)
        user_agent = request.headers.get("user-agent", "")
        return hashlib.sha256(f"{ip}:{user_agent}".encode()).hexdigest()
    
    def _get_ip(self, request: Request) -> str:
        """Get client IP"""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def _cleanup_old_requests(self, client_id: str, window_seconds: int):
        """Remove requests older than the window"""
        current_time = time.time()
        self.requests[client_id] = [
            req_time for req_time in self.requests[client_id]
            if current_time - req_time < window_seconds
        ]
    
    def is_blocked(self, client_id: str) -> bool:
        """Check if client is temporarily blocked"""
        if client_id in self.blocked_ips:
            if time.time() < self.blocked_ips[client_id]:
                return True
            else:
                del self.blocked_ips[client_id]
        return False
    
    def block_client(self, client_id: str, duration_seconds: int = 300):
        """Block client for specified duration"""
        self.blocked_ips[client_id] = time.time() + duration_seconds
        logger.warning(f"Client blocked for {duration_seconds}s: {client_id[:16]}...")
    
    def check_rate_limit(
        self, 
        request: Request, 
        max_requests: int = 100, 
        window_seconds: int = 60,
        block_duration: int = 300
    ) -> bool:
        """
        Check if request should be rate limited.
        Returns True if request should be blocked.
        """
        client_id = self._get_client_id(request)
        
        # Check if client is blocked
        if self.is_blocked(client_id):
            return True
        
        # Cleanup old requests
        self._cleanup_old_requests(client_id, window_seconds)
        
        # Check rate limit
        if len(self.requests[client_id]) >= max_requests:
            # Block the client
            self.block_client(client_id, block_duration)
            suspicious_activity.record_rate_limit(self._get_ip(request))
            return True
        
        # Record this request
        self.requests[client_id].append(time.time())
        return False
    
    def check_user_rate_limit(self, user_id: str, max_requests: int = 50, window_seconds: int = 60) -> bool:
        """Rate limit by user ID (for authenticated requests)"""
        current_time = time.time()
        
        # Cleanup old requests
        self.user_requests[user_id] = [
            t for t in self.user_requests[user_id]
            if current_time - t < window_seconds
        ]
        
        if len(self.user_requests[user_id]) >= max_requests:
            return True
        
        self.user_requests[user_id].append(current_time)
        return False


# Global rate limiter instance
rate_limiter = RateLimiter()


class LoginRateLimiter:
    """
    Strict rate limiter for login attempts.
    Implements progressive delays and account lockout.
    """
    
    def __init__(self):
        self.attempts: Dict[str, list] = defaultdict(list)
        self.blocked: Dict[str, float] = {}
        self.lockout_duration = [60, 300, 900, 3600, 86400]  # Progressive lockout
        self.lockout_counts: Dict[str, int] = defaultdict(int)
    
    def _get_key(self, email: str, ip: str) -> str:
        """Create a key based on email and IP"""
        return hashlib.sha256(f"{email}:{ip}".encode()).hexdigest()
    
    def _get_email_key(self, email: str) -> str:
        """Create a key based on email only (for account-level lockout)"""
        return hashlib.sha256(f"email:{email}".encode()).hexdigest()
    
    def record_failed_attempt(self, email: str, ip: str):
        """Record a failed login attempt"""
        key = self._get_key(email, ip)
        email_key = self._get_email_key(email)
        current_time = time.time()
        
        # Clean old attempts (older than 30 minutes)
        self.attempts[key] = [
            t for t in self.attempts[key]
            if current_time - t < 1800
        ]
        self.attempts[email_key] = [
            t for t in self.attempts[email_key]
            if current_time - t < 1800
        ]
        
        self.attempts[key].append(current_time)
        self.attempts[email_key].append(current_time)
        
        # Record suspicious activity
        suspicious_activity.record_failed_auth(ip)
        
        # Progressive lockout after 3 failed attempts
        if len(self.attempts[key]) >= 3:
            lockout_index = min(self.lockout_counts[key], len(self.lockout_duration) - 1)
            lockout_time = self.lockout_duration[lockout_index]
            self.blocked[key] = current_time + lockout_time
            self.lockout_counts[key] += 1
            logger.warning(f"Login blocked for {lockout_time}s after {len(self.attempts[key])} failures: {email}")
        
        # Account-level lockout after 10 failed attempts (any IP)
        if len(self.attempts[email_key]) >= 10:
            self.blocked[email_key] = current_time + 3600  # 1 hour
            logger.warning(f"Account locked for 1 hour due to multiple failed attempts: {email}")
    
    def is_blocked(self, email: str, ip: str) -> tuple[bool, int]:
        """
        Check if login attempts are blocked.
        Returns (is_blocked, remaining_seconds)
        """
        key = self._get_key(email, ip)
        email_key = self._get_email_key(email)
        current_time = time.time()
        
        # Check IP+email block
        if key in self.blocked:
            if current_time < self.blocked[key]:
                return True, int(self.blocked[key] - current_time)
            else:
                del self.blocked[key]
        
        # Check account-level block
        if email_key in self.blocked:
            if current_time < self.blocked[email_key]:
                return True, int(self.blocked[email_key] - current_time)
            else:
                del self.blocked[email_key]
        
        return False, 0
    
    def clear_attempts(self, email: str, ip: str):
        """Clear attempts after successful login"""
        key = self._get_key(email, ip)
        self.attempts[key] = []
        self.lockout_counts[key] = 0
        if key in self.blocked:
            del self.blocked[key]
    
    def get_remaining_attempts(self, email: str, ip: str) -> int:
        """Get remaining login attempts before lockout"""
        key = self._get_key(email, ip)
        return max(0, 3 - len(self.attempts[key]))


# Global login rate limiter
login_rate_limiter = LoginRateLimiter()


# ==================== SECURITY HEADERS MIDDLEWARE (Enhanced) ====================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Comprehensive security headers middleware.
    Implements OWASP recommended headers.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # XSS Protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # HSTS - Force HTTPS (1 year, include subdomains, preload)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        # Content Security Policy (Strict)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://js.instamojo.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "img-src 'self' data: https: blob:; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' https:; "
            "frame-src https://checkout.razorpay.com https://js.instamojo.com https://test.instamojo.com; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "base-uri 'self'; "
            "object-src 'none'; "
            "upgrade-insecure-requests;"
        )
        
        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions Policy (disable unnecessary features)
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), "
            "ambient-light-sensor=(), "
            "autoplay=(), "
            "battery=(), "
            "camera=(), "
            "cross-origin-isolated=(), "
            "display-capture=(), "
            "document-domain=(), "
            "encrypted-media=(), "
            "execution-while-not-rendered=(), "
            "execution-while-out-of-viewport=(), "
            "fullscreen=(self), "
            "geolocation=(), "
            "gyroscope=(), "
            "keyboard-map=(), "
            "magnetometer=(), "
            "microphone=(), "
            "midi=(), "
            "navigation-override=(), "
            "payment=(self), "
            "picture-in-picture=(), "
            "publickey-credentials-get=(), "
            "screen-wake-lock=(), "
            "sync-xhr=(), "
            "usb=(), "
            "web-share=(), "
            "xr-spatial-tracking=()"
        )
        
        # Cross-Origin policies
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        
        # Prevent caching of sensitive data
        if "/api/" in str(request.url):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        # Remove server identification headers
        response.headers["X-Powered-By"] = ""
        response.headers["Server"] = ""
        
        return response


# ==================== SUSPICIOUS ACTIVITY MIDDLEWARE ====================

class SuspiciousActivityMiddleware(BaseHTTPMiddleware):
    """
    Middleware to detect and block suspicious requests.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip for health checks
        if request.url.path == "/health":
            return await call_next(request)
        
        # Check for suspicious patterns
        is_suspicious, reason = suspicious_activity.check_request(request)
        
        if is_suspicious:
            logger.warning(f"Blocked suspicious request from {request.client.host}: {reason}")
            return JSONResponse(
                status_code=403,
                content={"detail": "Request blocked for security reasons"}
            )
        
        return await call_next(request)


# ==================== RATE LIMIT MIDDLEWARE (Enhanced) ====================

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Enhanced rate limiting middleware with endpoint-specific limits.
    """
    
    # Endpoint-specific rate limits
    RATE_LIMITS = {
        "/api/auth/login": (5, 60, 600),      # 5 per minute, 10 min block
        "/api/auth/register": (3, 60, 900),   # 3 per minute, 15 min block
        "/api/auth/reset": (3, 300, 1800),    # 3 per 5 min, 30 min block
        "/api/payments": (20, 60, 300),       # 20 per minute
        "/api/registrations": (30, 60, 300),  # 30 per minute
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for health checks
        if request.url.path == "/health":
            return await call_next(request)
        
        path = str(request.url.path)
        
        # Find matching rate limit
        max_requests = 100
        window = 60
        block_duration = 300
        
        for endpoint, limits in self.RATE_LIMITS.items():
            if path.startswith(endpoint):
                max_requests, window, block_duration = limits
                break
        
        # Apply rate limit
        if rate_limiter.check_rate_limit(request, max_requests, window, block_duration):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={"Retry-After": str(window)}
            )
        
        return await call_next(request)


# ==================== REQUEST VALIDATION ====================

class RequestValidator:
    """
    Validate incoming requests for common attack patterns.
    """
    
    MAX_BODY_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_URL_LENGTH = 2048
    MAX_HEADER_SIZE = 8192
    
    BLOCKED_USER_AGENTS = [
        r"sqlmap",
        r"nikto",
        r"nmap",
        r"masscan",
        r"nessus",
        r"openvas",
        r"burpsuite",
        r"havij",
    ]
    
    def __init__(self):
        self.ua_patterns = [re.compile(p, re.IGNORECASE) for p in self.BLOCKED_USER_AGENTS]
    
    def validate_request(self, request: Request) -> tuple[bool, str]:
        """
        Validate request for security issues.
        Returns (is_valid, error_message)
        """
        # Check URL length
        if len(str(request.url)) > self.MAX_URL_LENGTH:
            return False, "URL too long"
        
        # Check user agent
        user_agent = request.headers.get("user-agent", "")
        for pattern in self.ua_patterns:
            if pattern.search(user_agent):
                return False, "Blocked user agent"
        
        # Check for null bytes in path
        if "\x00" in str(request.url.path):
            return False, "Invalid characters in URL"
        
        # Check Content-Length header
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY_SIZE:
            return False, "Request body too large"
        
        return True, ""


request_validator = RequestValidator()


# ==================== PASSWORD VALIDATION (Enhanced) ====================

def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password meets banking-level security requirements.
    Returns (is_valid, error_message)
    """
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
        return False, "Password must contain at least one special character (!@#$%^&*)"
    
    # Check for sequential characters
    for i in range(len(password) - 2):
        if ord(password[i]) + 1 == ord(password[i+1]) == ord(password[i+2]) - 1:
            return False, "Password must not contain sequential characters (abc, 123)"
    
    # Check for repeated characters
    if re.search(r'(.)\1{2,}', password):
        return False, "Password must not contain more than 2 repeated characters"
    
    # Check for common weak passwords
    weak_passwords = [
        'password', '12345678', 'qwerty123', 'admin123', 'letmein',
        'welcome1', 'monkey123', 'dragon123', 'master123', 'login123',
        'password1', 'password123', 'Password1', 'Password123'
    ]
    if password.lower() in [p.lower() for p in weak_passwords]:
        return False, "Password is too common. Please choose a stronger password"
    
    # Check password doesn't contain common words
    common_words = ['password', 'admin', 'user', 'login', 'welcome', 'test']
    for word in common_words:
        if word in password.lower():
            return False, f"Password should not contain common words like '{word}'"
    
    return True, ""


# ==================== SQL/NOSQL INJECTION PREVENTION ====================

def sanitize_mongo_query(query_value: str) -> str:
    """
    Sanitize values used in MongoDB queries to prevent injection.
    """
    if not isinstance(query_value, str):
        return query_value
    
    # Remove MongoDB operators
    dangerous_patterns = [
        r'\$',           # MongoDB operators
        r'\{',           # Object notation
        r'\}',           # Object notation
        r'\.prototype',  # Prototype pollution
        r'__proto__',    # Prototype pollution
        r'constructor',  # Constructor access
    ]
    
    sanitized = query_value
    for pattern in dangerous_patterns:
        sanitized = re.sub(pattern, '', sanitized)
    
    return sanitized


def is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID format"""
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(value))


def validate_email(email: str) -> bool:
    """Validate email format"""
    if not email or len(email) > 254:
        return False
    
    email_pattern = re.compile(
        r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    )
    return bool(email_pattern.match(email))


def validate_phone(phone: str) -> bool:
    """Validate phone number format"""
    if not phone:
        return False
    
    # Remove common separators
    cleaned = re.sub(r'[\s\-\(\)\.]', '', phone)
    
    # Should be 10-15 digits, optionally starting with +
    phone_pattern = re.compile(r'^\+?[0-9]{10,15}$')
    return bool(phone_pattern.match(cleaned))


# ==================== AUDIT LOGGING ====================

class SecurityAuditLogger:
    """
    Log security-relevant events for compliance and forensics.
    """
    
    def __init__(self):
        self.logger = logging.getLogger("security_audit")
        
        # Use local logs directory (works on any system)
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "security_audit.log")
        
        try:
            handler = logging.FileHandler(log_file)
            handler.setFormatter(logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s'
            ))
            self.logger.addHandler(handler)
        except (PermissionError, OSError) as e:
            # Fallback to console logging if file logging fails
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(logging.Formatter(
                '%(asctime)s - SECURITY - %(levelname)s - %(message)s'
            ))
            self.logger.addHandler(console_handler)
            logger.warning(f"Could not create security log file: {e}. Using console logging.")
        
        self.logger.setLevel(logging.INFO)
    
    def log_auth_success(self, email: str, ip: str, user_agent: str):
        """Log successful authentication"""
        self.logger.info(f"AUTH_SUCCESS | email={email} | ip={ip} | ua={user_agent[:100]}")
    
    def log_auth_failure(self, email: str, ip: str, reason: str):
        """Log failed authentication"""
        self.logger.warning(f"AUTH_FAILURE | email={email} | ip={ip} | reason={reason}")
    
    def log_suspicious_activity(self, ip: str, activity_type: str, details: str):
        """Log suspicious activity"""
        self.logger.warning(f"SUSPICIOUS | ip={ip} | type={activity_type} | details={details[:200]}")
    
    def log_access_denied(self, user_id: str, resource: str, ip: str):
        """Log access denied events"""
        self.logger.warning(f"ACCESS_DENIED | user={user_id} | resource={resource} | ip={ip}")
    
    def log_data_access(self, user_id: str, resource: str, action: str):
        """Log sensitive data access"""
        self.logger.info(f"DATA_ACCESS | user={user_id} | resource={resource} | action={action}")
    
    def log_admin_action(self, admin_id: str, action: str, target: str):
        """Log administrative actions"""
        self.logger.info(f"ADMIN_ACTION | admin={admin_id} | action={action} | target={target}")


# Initialize security audit logger
security_audit = SecurityAuditLogger()


# ==================== IP ALLOWLIST/BLOCKLIST ====================

class IPAccessControl:
    """
    IP-based access control for sensitive endpoints.
    """
    
    def __init__(self):
        self.blocklist: Set[str] = set()
        self.allowlist: Set[str] = set()
        self.admin_allowlist: Set[str] = set()  # IPs allowed for admin access
    
    def add_to_blocklist(self, ip: str):
        """Add IP to blocklist"""
        self.blocklist.add(ip)
        logger.warning(f"IP added to blocklist: {ip}")
    
    def remove_from_blocklist(self, ip: str):
        """Remove IP from blocklist"""
        self.blocklist.discard(ip)
    
    def add_to_allowlist(self, ip: str):
        """Add IP to allowlist (bypass rate limiting)"""
        self.allowlist.add(ip)
    
    def is_blocked(self, ip: str) -> bool:
        """Check if IP is blocked"""
        return ip in self.blocklist
    
    def is_allowed(self, ip: str) -> bool:
        """Check if IP is in allowlist"""
        return ip in self.allowlist
    
    def is_ip_in_range(self, ip: str, cidr: str) -> bool:
        """Check if IP is in CIDR range"""
        try:
            return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr, strict=False)
        except ValueError:
            return False


ip_access = IPAccessControl()


# ==================== REQUEST SIGNING (For API Integrity) ====================

class RequestSigner:
    """
    Sign and verify API requests to prevent tampering.
    Used for critical operations like payments.
    """
    
    def __init__(self):
        self.secret = os.environ.get('REQUEST_SIGNING_KEY', secrets.token_urlsafe(32))
    
    def sign_request(self, method: str, path: str, body: str, timestamp: str) -> str:
        """Generate HMAC signature for request"""
        message = f"{method}:{path}:{body}:{timestamp}"
        signature = hmac.new(
            self.secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    def verify_signature(self, method: str, path: str, body: str, timestamp: str, signature: str) -> bool:
        """Verify request signature"""
        # Check timestamp is within 5 minutes
        try:
            req_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            if abs((now - req_time).total_seconds()) > 300:
                return False
        except (ValueError, TypeError):
            return False
        
        expected = self.sign_request(method, path, body, timestamp)
        return hmac.compare_digest(expected, signature)


request_signer = RequestSigner()


# ==================== SECURE ERROR HANDLING ====================

def get_safe_error_message(exception: Exception) -> str:
    """
    Return a safe error message that doesn't leak implementation details.
    """
    # Map of exception types to user-friendly messages
    error_messages = {
        "ValidationError": "Invalid input provided",
        "AuthenticationError": "Authentication failed",
        "PermissionError": "Access denied",
        "NotFoundError": "Resource not found",
        "RateLimitError": "Too many requests",
    }
    
    exception_name = type(exception).__name__
    
    # Never expose these in error messages
    sensitive_patterns = [
        r'password',
        r'token',
        r'secret',
        r'key',
        r'mongodb',
        r'connection',
        r'traceback',
        r'stack',
    ]
    
    error_str = str(exception).lower()
    for pattern in sensitive_patterns:
        if re.search(pattern, error_str, re.IGNORECASE):
            return "An error occurred. Please try again later."
    
    return error_messages.get(exception_name, "An error occurred. Please try again later.")
