from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"
    PARTIAL_REFUND = "partial_refund"
    NO_SHOW = "no_show"  # User did not show up (offline payments)

class RegistrationStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"  # User did not show up (offline payments)

class RegistrationSubmission(BaseModel):
    campaign_id: str
    form_data: Dict[str, Any]
    total_amount: float
    coupon_code: Optional[str] = None
    member_id: Optional[str] = None  # For closed group campaigns

class PaymentInitiation(BaseModel):
    registration_id: str
    payment_gateway: str
    return_url: str

class PaymentCallback(BaseModel):
    registration_id: str
    payment_id: str
    payment_gateway: str
    status: str
    amount: float
    metadata: Optional[Dict[str, Any]] = None

class RegistrationResponse(BaseModel):
    id: str
    campaign_id: str
    form_data: Dict[str, Any]
    total_amount: float
    payment_status: PaymentStatus
    registration_status: RegistrationStatus
    payment_id: Optional[str] = None
    invoice_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class RefundRequest(BaseModel):
    registration_id: str
    amount: float
    reason: str

class RefundResponse(BaseModel):
    id: str
    registration_id: str
    amount: float
    status: str
    refund_id: Optional[str] = None
    created_at: datetime
