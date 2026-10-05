from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class PaymentGatewayType(str, Enum):
    INSTAMOJO = "instamojo"
    RAZORPAY = "razorpay"

class PaymentAccountBase(BaseModel):
    name: str  # Friendly name like "Rotary Main Account"
    gateway_type: PaymentGatewayType
    description: Optional[str] = None
    is_active: bool = True

class PaymentAccountCreate(PaymentAccountBase):
    # Instamojo credentials
    instamojo_api_key: Optional[str] = None
    instamojo_auth_token: Optional[str] = None
    instamojo_salt: Optional[str] = None
    instamojo_mode: Optional[str] = "sandbox"  # sandbox or production
    
    # Razorpay credentials
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None
    razorpay_mode: Optional[str] = "test"  # test or live

class PaymentAccountUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    
    # Instamojo credentials (optional update)
    instamojo_api_key: Optional[str] = None
    instamojo_auth_token: Optional[str] = None
    instamojo_salt: Optional[str] = None
    instamojo_mode: Optional[str] = None
    
    # Razorpay credentials (optional update)
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None
    razorpay_mode: Optional[str] = None

class PaymentAccountInDB(BaseModel):
    id: str
    name: str
    gateway_type: PaymentGatewayType
    description: Optional[str] = None
    is_active: bool = True
    
    # Instamojo credentials (stored encrypted in production)
    instamojo_api_key: Optional[str] = None
    instamojo_auth_token: Optional[str] = None
    instamojo_salt: Optional[str] = None
    instamojo_mode: Optional[str] = "sandbox"
    
    # Razorpay credentials (stored encrypted in production)
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None
    razorpay_mode: Optional[str] = "test"
    
    # Metadata
    created_at: datetime
    updated_at: datetime
    created_by: str
    
    # Stats (updated periodically)
    total_transactions: int = 0
    total_amount_collected: float = 0.0
    last_transaction_at: Optional[datetime] = None

class PaymentAccountResponse(BaseModel):
    """Response model - excludes sensitive credentials"""
    id: str
    name: str
    gateway_type: PaymentGatewayType
    description: Optional[str] = None
    is_active: bool = True
    
    # Only show mode, not actual credentials
    instamojo_mode: Optional[str] = None
    razorpay_mode: Optional[str] = None
    
    # Show if credentials are configured (boolean flags)
    has_instamojo_credentials: bool = False
    has_razorpay_credentials: bool = False
    
    # Stats
    total_transactions: int = 0
    total_amount_collected: float = 0.0
    last_transaction_at: Optional[datetime] = None
    
    created_at: datetime
    updated_at: datetime

class PaymentAccountListResponse(BaseModel):
    """For dropdown lists - minimal info"""
    id: str
    name: str
    gateway_type: PaymentGatewayType
    is_active: bool

class PaymentAccountStats(BaseModel):
    """Balance and transaction stats from payment gateway"""
    account_id: str
    account_name: str
    gateway_type: PaymentGatewayType
    
    # Balance info (if available from API)
    available_balance: Optional[float] = None
    pending_balance: Optional[float] = None
    
    # Transaction summary
    total_transactions: int = 0
    successful_transactions: int = 0
    failed_transactions: int = 0
    total_amount: float = 0.0
    
    # Recent transactions
    recent_transactions: List[dict] = Field(default_factory=list)
    
    last_updated: datetime
