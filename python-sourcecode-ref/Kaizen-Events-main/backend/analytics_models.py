from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class FailedPaymentInfo(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    amount: float
    created_at: Optional[str] = None
    gateway: str

class RegistrationAnalytics(BaseModel):
    total_registrations: int
    paid_registrations: int
    pending_registrations: int
    failed_registrations: int = 0
    total_revenue: float
    average_registration_value: float
    registration_by_date: List[Dict[str, Any]]
    top_registration_sources: List[Dict[str, Any]]
    failed_payments: List[FailedPaymentInfo] = []

class EmailTemplate(BaseModel):
    id: str
    name: str
    subject: str
    body: str
    variables: List[str]

class EmailSendRequest(BaseModel):
    registration_id: str
    template_id: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    attach_receipt: bool = True

class ExportRequest(BaseModel):
    campaign_id: str
    format: str  # csv or excel
    filters: Optional[Dict[str, Any]] = None
