"""Campaign Members Models and Routes for Closed Group Campaigns"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ==================== ENUMS ====================

class CampaignType(str, Enum):
    OPEN = "open"  # Anyone can register
    CLOSED_GROUP = "closed_group"  # Only uploaded members can register


class MemberStatus(str, Enum):
    UNREGISTERED = "unregistered"
    REGISTERED = "registered"


# ==================== MODELS ====================

class CampaignMemberBase(BaseModel):
    """Base model for campaign member"""
    name: str
    mobile: str
    email: Optional[str] = None
    # Dynamic fields stored here
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class CampaignMemberCreate(CampaignMemberBase):
    """Create a campaign member"""
    pass


class CampaignMemberUpdate(BaseModel):
    """Update a campaign member"""
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None


class CampaignMemberInDB(CampaignMemberBase):
    """Campaign member as stored in database"""
    id: str
    campaign_id: str
    status: MemberStatus = MemberStatus.UNREGISTERED
    registration_id: Optional[str] = None  # Link to registration if registered
    registered_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    created_by: str  # User who added this member
    

class CampaignMemberResponse(BaseModel):
    """Response model for campaign member"""
    id: str
    campaign_id: str
    name: str
    mobile: str
    email: Optional[str] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    status: MemberStatus
    registration_id: Optional[str] = None
    registered_at: Optional[datetime] = None
    created_at: datetime


# ==================== UPLOAD MODELS ====================

class ColumnMapping(BaseModel):
    """Mapping of file columns to member fields"""
    name_column: str  # Required
    mobile_column: str  # Required
    email_column: Optional[str] = None
    custom_columns: Dict[str, str] = Field(default_factory=dict)  # field_name -> column_name


class UploadResult(BaseModel):
    """Result of file upload"""
    success: bool
    total_rows: int
    added: int
    skipped: int  # Already exists
    errors: int
    error_details: List[Dict[str, Any]] = Field(default_factory=list)


class UploadPreview(BaseModel):
    """Preview of uploaded file before processing"""
    columns: List[str]
    sample_rows: List[Dict[str, Any]]
    total_rows: int


# ==================== MEMBER LIST MODELS ====================

class MemberListRequest(BaseModel):
    """Request for member list with filters"""
    status: Optional[MemberStatus] = None
    search: Optional[str] = None
    page: int = 1
    page_size: int = 50


class MemberListResponse(BaseModel):
    """Paginated member list response"""
    members: List[CampaignMemberResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    registered_count: int
    unregistered_count: int


# ==================== REMINDER MODELS ====================

class ReminderRequest(BaseModel):
    """Request to send reminders"""
    member_ids: Optional[List[str]] = None  # None or empty = all unregistered
    channels: List[str] = ["email", "whatsapp"]  # Which channels to use
    

class SingleReminderRequest(BaseModel):
    """Request to send reminder to single member"""
    channels: List[str] = ["email", "whatsapp"]


class ReminderResult(BaseModel):
    """Result of sending reminders"""
    total: int
    email_sent: int
    email_failed: int
    whatsapp_sent: int
    whatsapp_failed: int
    errors: List[Dict[str, Any]] = Field(default_factory=list)


# ==================== CLOSED GROUP CONFIG ====================

class ClosedGroupConfig(BaseModel):
    """Configuration for closed group campaign"""
    enabled: bool = False
    field_mapping: Optional[ColumnMapping] = None
    allow_manual_add: bool = True
    show_registered_in_list: bool = True  # Show registered members in selection
    require_email: bool = False
    custom_field_labels: Dict[str, str] = Field(default_factory=dict)  # field_name -> display label
