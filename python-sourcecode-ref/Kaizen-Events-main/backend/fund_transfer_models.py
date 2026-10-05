from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum


class FundCollectionMode(str, Enum):
    KAIZEN_MANAGED = "kaizen_managed"
    ORGANIZER_DIRECT = "organizer_direct"


class TransferStatus(str, Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class ChangeRequestType(str, Enum):
    FUND_TRANSFER = "fund_transfer"
    BANK_ACCOUNT = "bank_account"
    PAYMENT_GATEWAY = "payment_gateway"
    FUND_COLLECTION_MODE = "fund_collection_mode"


class ChangeRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# Bank Account Models
class CampaignBankAccountCreate(BaseModel):
    campaign_id: str
    account_name: str
    account_number: str
    ifsc_code: str
    bank_name: str
    notification_email: str


class CampaignBankAccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    bank_name: Optional[str] = None
    notification_email: Optional[str] = None


class CampaignBankAccountResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    campaign_id: str
    account_name: str
    account_number_masked: str
    ifsc_code: str
    bank_name: str
    notification_email: str
    created_at: datetime
    updated_at: datetime


class CampaignBankAccountInDB(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    campaign_id: str
    account_name: str
    account_number: str
    account_number_masked: str
    ifsc_code: str
    bank_name: str
    notification_email: str
    created_at: datetime
    updated_at: datetime
    created_by: str


# Fund Transfer Models
class FundTransferCreate(BaseModel):
    campaign_id: str
    amount: float
    notes: Optional[str] = None


class FundTransferComplete(BaseModel):
    transaction_reference: str
    transfer_date: str
    send_notification: bool = False


class FundTransferResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    request_number: str
    campaign_id: str
    campaign_name: str
    organization_name: str
    
    amount: float
    
    status: TransferStatus
    
    bank_account_snapshot: Optional[dict] = None
    
    created_by: str
    created_by_name: Optional[str] = None
    created_at: datetime
    notes: Optional[str] = None
    
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_notes: Optional[str] = None
    
    rejected_by: Optional[str] = None
    rejected_by_name: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    completed_by: Optional[str] = None
    completed_by_name: Optional[str] = None
    completed_at: Optional[datetime] = None
    transaction_reference: Optional[str] = None
    transfer_date: Optional[str] = None
    
    notification_sent: bool = False
    notification_sent_at: Optional[datetime] = None
    notification_email: Optional[str] = None


class FundTransferInDB(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    request_number: str
    campaign_id: str
    campaign_name: str
    organization_name: str
    
    amount: float
    
    status: TransferStatus
    
    bank_account_id: Optional[str] = None
    bank_account_snapshot: Optional[dict] = None
    
    created_by: str
    created_at: datetime
    notes: Optional[str] = None
    
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_notes: Optional[str] = None
    
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    completed_by: Optional[str] = None
    completed_at: Optional[datetime] = None
    transaction_reference: Optional[str] = None
    transfer_date: Optional[str] = None
    
    notification_sent: bool = False
    notification_sent_at: Optional[datetime] = None
    notification_email: Optional[str] = None


# Change Request Models (for bank account, payment gateway, fund collection mode changes)
class ChangeRequestCreate(BaseModel):
    campaign_id: str
    request_type: ChangeRequestType
    current_value: Optional[dict] = None
    new_value: dict
    reason: str


class ChangeRequestResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    request_number: str
    campaign_id: str
    campaign_name: str
    organization_name: str
    
    request_type: ChangeRequestType
    current_value: Optional[dict] = None
    new_value: dict
    reason: str
    
    status: ChangeRequestStatus
    
    created_by: str
    created_by_name: Optional[str] = None
    created_at: datetime
    
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_notes: Optional[str] = None
    
    rejected_by: Optional[str] = None
    rejected_by_name: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None


class ChangeRequestInDB(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    request_number: str
    campaign_id: str
    campaign_name: str
    organization_name: str
    
    request_type: ChangeRequestType
    current_value: Optional[dict] = None
    new_value: dict
    reason: str
    
    status: ChangeRequestStatus
    
    created_by: str
    created_at: datetime
    
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_notes: Optional[str] = None
    
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None


# Fund Summary Models
class CampaignFundSummary(BaseModel):
    campaign_id: str
    campaign_name: str
    organization_name: str
    fund_collection_mode: FundCollectionMode
    
    total_collected: float  # Gross amount (what users pay)
    gateway_charges: float  # Payment gateway deductions
    gateway_settled: float  # Amount settled by gateway to Kaizen
    gateway_pending: float  # Amount pending settlement from gateway
    platform_fee: float  # 2.95% of (total_collected - gateway_charges)
    net_payable: float  # gateway_settled - platform_fee
    total_transferred: float  # Amount paid to organizer
    pending_transfer: float  # net_payable - total_transferred
    
    has_bank_account: bool
    bank_account: Optional[CampaignBankAccountResponse] = None
    
    pending_approval_count: int = 0


class FundTransferStats(BaseModel):
    total_collected: float  # Gross amount (what users pay)
    gateway_charges: float  # Payment gateway deductions
    gateway_settled: float  # Amount settled by gateway to Kaizen
    gateway_pending: float  # Amount pending settlement from gateway
    platform_fee: float  # 2.95% of (total_collected - gateway_charges)
    net_payable: float  # gateway_settled - platform_fee
    total_transferred: float  # Amount paid to organizer
    pending_transfer: float  # net_payable - total_transferred
    pending_approval_count: int
    campaigns_with_pending: int


# Approval Action Models
class ApprovalAction(BaseModel):
    notes: Optional[str] = None


class RejectionAction(BaseModel):
    reason: str
