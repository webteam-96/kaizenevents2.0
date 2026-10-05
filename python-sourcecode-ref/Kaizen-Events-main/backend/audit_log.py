"""
Audit Logging Module for Kaizen Events
Provides immutable logging for security-sensitive operations
"""
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
import json
import hashlib

# Configure audit logger
audit_logger = logging.getLogger("audit")
_audit_log_path = os.environ.get("AUDIT_LOG_PATH", "/var/log/supervisor/audit.log")
try:
    audit_handler = logging.FileHandler(_audit_log_path)
except (FileNotFoundError, PermissionError):
    # Fallback to local logs directory for local development
    _local_log_dir = Path(__file__).parent / "logs"
    _local_log_dir.mkdir(exist_ok=True)
    audit_handler = logging.FileHandler(_local_log_dir / "audit.log")
audit_handler.setFormatter(logging.Formatter(
    '%(asctime)s - AUDIT - %(message)s'
))
audit_logger.addHandler(audit_handler)
audit_logger.setLevel(logging.INFO)


class AuditEventType:
    """Audit event types"""
    # Authentication events
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUEST"
    PASSWORD_RESET_COMPLETE = "PASSWORD_RESET_COMPLETE"
    
    # User management
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DELETED = "USER_DELETED"
    USER_ROLE_CHANGED = "USER_ROLE_CHANGED"
    
    # Campaign operations
    CAMPAIGN_CREATED = "CAMPAIGN_CREATED"
    CAMPAIGN_UPDATED = "CAMPAIGN_UPDATED"
    CAMPAIGN_DELETED = "CAMPAIGN_DELETED"
    CAMPAIGN_ARCHIVED = "CAMPAIGN_ARCHIVED"
    
    # Landing Page operations
    LANDING_PAGE_CREATED = "LANDING_PAGE_CREATED"
    LANDING_PAGE_UPDATED = "LANDING_PAGE_UPDATED"
    LANDING_PAGE_PUBLISHED = "LANDING_PAGE_PUBLISHED"
    LANDING_PAGE_DELETED = "LANDING_PAGE_DELETED"
    
    # Registration operations
    REGISTRATION_CREATED = "REGISTRATION_CREATED"
    REGISTRATION_UPDATED = "REGISTRATION_UPDATED"
    REGISTRATION_DELETED = "REGISTRATION_DELETED"
    
    # Financial operations
    PAYMENT_INITIATED = "PAYMENT_INITIATED"
    PAYMENT_VERIFIED = "PAYMENT_VERIFIED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    PAYMENT_REFUNDED = "PAYMENT_REFUNDED"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"  # For offline cash payments
    REFUND_INITIATED = "REFUND_INITIATED"
    REFUND_COMPLETED = "REFUND_COMPLETED"
    
    # Fund transfer operations
    TRANSFER_CREATED = "TRANSFER_CREATED"
    TRANSFER_APPROVED = "TRANSFER_APPROVED"
    TRANSFER_REJECTED = "TRANSFER_REJECTED"
    TRANSFER_COMPLETED = "TRANSFER_COMPLETED"
    
    # Bank account operations
    BANK_ACCOUNT_CREATED = "BANK_ACCOUNT_CREATED"
    BANK_ACCOUNT_UPDATED = "BANK_ACCOUNT_UPDATED"
    BANK_ACCOUNT_DELETED = "BANK_ACCOUNT_DELETED"
    
    # Form operations
    FORM_UPDATED = "FORM_UPDATED"
    
    # Settings operations
    SETTINGS_UPDATED = "SETTINGS_UPDATED"
    
    # Data access
    DATA_EXPORT = "DATA_EXPORT"
    DATA_IMPORT = "DATA_IMPORT"
    SENSITIVE_DATA_ACCESS = "SENSITIVE_DATA_ACCESS"
    
    # Security events
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS"
    SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY"


class AuditLogger:
    """
    Audit logger for tracking security-sensitive operations.
    Logs are immutable and include integrity hashes.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase = None):
        self.db = db
        self._previous_hash = None
    
    def set_db(self, db: AsyncIOMotorDatabase):
        """Set database connection"""
        self.db = db
    
    def _generate_hash(self, data: Dict[str, Any]) -> str:
        """Generate SHA-256 hash for log integrity"""
        # Include previous hash for chain integrity
        data_with_chain = {
            **data,
            "previous_hash": self._previous_hash
        }
        data_str = json.dumps(data_with_chain, sort_keys=True, default=str)
        return hashlib.sha256(data_str.encode()).hexdigest()
    
    async def log(
        self,
        event_type: str,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        action_details: Optional[Dict[str, Any]] = None,
        status: str = "success",
        error_message: Optional[str] = None
    ):
        """
        Log an audit event with full context.
        
        Args:
            event_type: Type of event from AuditEventType
            user_id: ID of user performing action
            user_email: Email of user (for login events)
            ip_address: Client IP address
            user_agent: Client user agent
            resource_type: Type of resource affected (campaign, user, payment, etc.)
            resource_id: ID of affected resource
            action_details: Additional details about the action
            status: success, failure, or warning
            error_message: Error details if status is failure
        """
        timestamp = datetime.now(timezone.utc)
        
        log_entry = {
            "timestamp": timestamp.isoformat(),
            "event_type": event_type,
            "user_id": user_id,
            "user_email": self._mask_email(user_email) if user_email else None,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action_details": self._sanitize_details(action_details),
            "status": status,
            "error_message": error_message
        }
        
        # Generate integrity hash
        log_entry["integrity_hash"] = self._generate_hash(log_entry)
        self._previous_hash = log_entry["integrity_hash"]
        
        # Log to file (always)
        audit_logger.info(json.dumps(log_entry, default=str))
        
        # Log to database if available
        if self.db is not None:
            try:
                await self.db.audit_logs.insert_one(log_entry)
            except Exception as e:
                audit_logger.error(f"Failed to write audit log to DB: {e}")
    
    def _mask_email(self, email: str) -> str:
        """Mask email for privacy while keeping it identifiable"""
        if not email or "@" not in email:
            return email
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked_local = "*" * len(local)
        else:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked_local}@{domain}"
    
    def _sanitize_details(self, details: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Remove sensitive data from action details"""
        if not details:
            return None
        
        sensitive_keys = [
            "password", "token", "secret", "key", "credential",
            "card_number", "cvv", "pin", "account_number"
        ]
        
        sanitized = {}
        for key, value in details.items():
            if any(sensitive in key.lower() for sensitive in sensitive_keys):
                sanitized[key] = "[REDACTED]"
            elif isinstance(value, dict):
                sanitized[key] = self._sanitize_details(value)
            else:
                sanitized[key] = value
        
        return sanitized
    
    # Convenience methods for common events
    async def log_login_success(self, user_id: str, user_email: str, ip: str, user_agent: str):
        await self.log(
            AuditEventType.LOGIN_SUCCESS,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip,
            user_agent=user_agent,
            status="success"
        )
    
    async def log_login_failed(self, user_email: str, ip: str, user_agent: str, reason: str):
        await self.log(
            AuditEventType.LOGIN_FAILED,
            user_email=user_email,
            ip_address=ip,
            user_agent=user_agent,
            status="failure",
            error_message=reason
        )
    
    async def log_payment(
        self,
        event_type: str,
        user_id: str,
        payment_id: str,
        amount: float,
        ip: str,
        status: str = "success",
        error: str = None
    ):
        await self.log(
            event_type,
            user_id=user_id,
            ip_address=ip,
            resource_type="payment",
            resource_id=payment_id,
            action_details={"amount": amount},
            status=status,
            error_message=error
        )
    
    async def log_fund_transfer(
        self,
        event_type: str,
        user_id: str,
        transfer_id: str,
        campaign_id: str,
        amount: float,
        ip: str
    ):
        await self.log(
            event_type,
            user_id=user_id,
            ip_address=ip,
            resource_type="fund_transfer",
            resource_id=transfer_id,
            action_details={
                "campaign_id": campaign_id,
                "amount": amount
            },
            status="success"
        )
    
    async def log_security_event(
        self,
        event_type: str,
        ip: str,
        user_agent: str,
        details: Dict[str, Any]
    ):
        await self.log(
            event_type,
            ip_address=ip,
            user_agent=user_agent,
            action_details=details,
            status="warning"
        )


# Global audit logger instance
audit = AuditLogger()
