from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"
    KIOSK_VOLUNTEER = "kiosk_volunteer"  # New role for kiosk mode

class CampaignStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"

class CampaignType(str, Enum):
    OPEN = "open"  # Anyone can register
    CLOSED_GROUP = "closed_group"  # Only uploaded members can register

class PaymentGateway(str, Enum):
    RAZORPAY = "razorpay"
    INSTAMOJO = "instamojo"

class FundCollectionMode(str, Enum):
    KAIZEN_MANAGED = "kaizen_managed"  # Kaizen collects and transfers to organizer
    ORGANIZER_DIRECT = "organizer_direct"  # Organizer uses their own payment gateway

class PaymentCollectionMethod(str, Enum):
    ONLINE = "online"  # Online payment gateway (Razorpay/Instamojo)
    OFFLINE = "offline"  # Cash payment at venue (OTP-based)

# User Models
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: UserRole

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: UserRole = UserRole.ORG_ADMIN
    campaign_access: List[str] = []

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserInDB(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    email: EmailStr
    name: str
    role: UserRole
    hashed_password: str
    campaign_access: List[str] = Field(default_factory=list)
    can_approve_transfers: bool = False  # Director permission for fund transfer approvals
    created_at: datetime
    updated_at: datetime
    is_active: bool = True

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: UserRole
    campaign_access: List[str] = Field(default_factory=list)
    can_approve_transfers: bool = False
    created_at: datetime
    is_active: bool

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Campaign Models
class CampaignBase(BaseModel):
    name: str
    slug: str
    organization_name: str
    campaign_type: CampaignType = CampaignType.OPEN  # New field
    fund_collection_mode: Optional[FundCollectionMode] = None  # Required: kaizen_managed or organizer_direct
    payment_collection_method: Optional[str] = "online"  # "online" or "offline" - mutually exclusive
    kiosk_enabled: Optional[bool] = False  # Enable kiosk mode for online payment campaigns
    show_on_homepage: Optional[bool] = True  # Show campaign on public homepage/listing
    event_logo: Optional[str] = None
    logo_url: Optional[str] = None  # Campaign logo/placeholder image
    has_landing_page: bool = True  # Toggle for landing page
    status: CampaignStatus = CampaignStatus.DRAFT
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_start_date: Optional[datetime] = None  # When registration opens
    registration_end_date: Optional[datetime] = None    # When registration closes
    payment_gateway: PaymentGateway = PaymentGateway.RAZORPAY  # Legacy field for backward compatibility
    payment_account_id: Optional[str] = None  # Reference to payment account
    payment_purpose: Optional[str] = None  # Purpose shown on payment gateway (e.g., "Discon_2026")
    max_registrations: Optional[int] = None
    description: Optional[str] = None

class CampaignCreate(CampaignBase):
    pass

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    organization_name: Optional[str] = None
    campaign_type: Optional[CampaignType] = None
    fund_collection_mode: Optional[FundCollectionMode] = None
    payment_collection_method: Optional[str] = None  # "online" or "offline"
    kiosk_enabled: Optional[bool] = None  # Enable kiosk mode for online payment campaigns
    show_on_homepage: Optional[bool] = None  # Show campaign on public homepage/listing
    event_logo: Optional[str] = None
    logo_url: Optional[str] = None
    has_landing_page: Optional[bool] = None
    registration_enabled: Optional[bool] = None
    status: Optional[CampaignStatus] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_start_date: Optional[datetime] = None
    registration_end_date: Optional[datetime] = None
    payment_gateway: Optional[PaymentGateway] = None
    payment_account_id: Optional[str] = None
    payment_purpose: Optional[str] = None
    max_registrations: Optional[int] = None
    description: Optional[str] = None
    form_config: Optional[dict] = None
    use_external_form: Optional[bool] = None
    external_form_url: Optional[str] = None
    closed_group_config: Optional[dict] = None  # Config for closed group campaigns
    payment_config: Optional[dict] = None  # Legacy offline payments config

class CampaignInDB(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    slug: str
    organization_name: str
    campaign_type: CampaignType = CampaignType.OPEN
    fund_collection_mode: Optional[FundCollectionMode] = None
    payment_collection_method: Optional[str] = "online"  # "online" or "offline"
    kiosk_enabled: Optional[bool] = False  # Enable kiosk mode for online payment campaigns
    show_on_homepage: Optional[bool] = True  # Show campaign on public homepage/listing
    event_logo: Optional[str] = None
    logo_url: Optional[str] = None
    has_landing_page: bool = True
    registration_enabled: bool = True
    use_external_form: bool = False
    external_form_url: Optional[str] = None
    status: CampaignStatus
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_start_date: Optional[datetime] = None
    registration_end_date: Optional[datetime] = None
    payment_gateway: PaymentGateway
    payment_account_id: Optional[str] = None
    payment_purpose: Optional[str] = None
    max_registrations: Optional[int] = None
    current_registrations: int = 0
    total_revenue: float = 0.0
    total_transferred: float = 0.0  # Total amount transferred to organizer
    description: Optional[str] = None
    form_config: Optional[Dict[str, Any]] = None
    landing_page_config: Optional[Dict[str, Any]] = None
    payment_config: Optional[Dict[str, Any]] = None
    closed_group_config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    created_by: str
    archived_at: Optional[datetime] = None

class CampaignResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    slug: str
    organization_name: str
    campaign_type: Optional[CampaignType] = CampaignType.OPEN
    fund_collection_mode: Optional[FundCollectionMode] = None
    payment_collection_method: Optional[str] = "online"  # "online" or "offline"
    kiosk_enabled: Optional[bool] = False  # Enable kiosk mode for online payment campaigns
    show_on_homepage: Optional[bool] = True  # Show campaign on public homepage/listing
    event_logo: Optional[str] = None
    logo_url: Optional[str] = None
    has_landing_page: bool = True
    registration_enabled: bool = True
    use_external_form: bool = False
    external_form_url: Optional[str] = None
    status: CampaignStatus
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_start_date: Optional[datetime] = None
    registration_end_date: Optional[datetime] = None
    payment_gateway: PaymentGateway = PaymentGateway.RAZORPAY
    payment_account_id: Optional[str] = None
    payment_purpose: Optional[str] = None
    max_registrations: Optional[int] = None
    current_registrations: int = 0
    total_revenue: float = 0.0
    total_transferred: float = 0.0
    description: Optional[str] = None
    form_config: Optional[dict] = None
    payment_config: Optional[dict] = None  # Legacy offline payment config
    closed_group_config: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    archived_at: Optional[datetime] = None

class CampaignStats(BaseModel):
    total_registrations: int
    total_revenue: float
    paid_registrations: int
    registration_rate: float

# Password Reset Models
class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    reset_code: str
    new_password: str

# User Access Management
class UserAccessUpdate(BaseModel):
    user_id: str
    campaign_ids: List[str]
