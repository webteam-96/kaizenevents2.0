from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum

class FieldType(str, Enum):
    NAME = "name"
    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    NUMBER = "number"
    DATE = "date"
    TIME = "time"
    DATETIME = "datetime"
    DROPDOWN = "dropdown"
    RADIO = "radio"
    CHECKBOX = "checkbox"
    FILE_UPLOAD = "file_upload"
    TEXTAREA = "textarea"
    SECTION_HEADER = "section_header"
    TERMS_CHECKBOX = "terms_checkbox"

class NameFieldConfig(BaseModel):
    """Configuration for the Name field type (like Zoho Forms)"""
    show_first_name: bool = True  # Always true, but included for completeness
    show_middle_name: bool = False
    show_last_name: bool = True
    first_name_label: str = "First Name"
    middle_name_label: str = "Middle Name"
    last_name_label: str = "Last Name"
    first_name_placeholder: Optional[str] = "Enter first name"
    middle_name_placeholder: Optional[str] = "Enter middle name"
    last_name_placeholder: Optional[str] = "Enter last name"

class ValidationRule(BaseModel):
    type: str  # min, max, pattern, required, email, url, etc.
    value: Any
    message: Optional[str] = None

class ConditionalLogic(BaseModel):
    source_field_id: str
    condition: str  # equals, not_equals, contains, greater_than, less_than
    value: Any
    action: str  # show, hide, required

class PricingRule(BaseModel):
    field_id: str
    value: Any
    price_modifier: float
    modifier_type: str  # add, multiply, set

class FormFieldOption(BaseModel):
    label: str
    value: str
    price_modifier: Optional[float] = 0.0

class FormField(BaseModel):
    id: str
    type: FieldType
    label: str
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    required: bool = False
    options: Optional[List[FormFieldOption]] = None
    validation_rules: Optional[List[ValidationRule]] = None
    conditional_logic: Optional[List[ConditionalLogic]] = None
    default_value: Optional[Any] = None
    order: int = 0
    width: str = "full"  # full, half, third
    name_config: Optional[NameFieldConfig] = None  # For name field type
    
class FormConfig(BaseModel):
    fields: List[FormField]
    base_price: float = 0.0
    pricing_rules: Optional[List[PricingRule]] = None
    early_bird_enabled: bool = False
    early_bird_price: Optional[float] = None
    early_bird_end_date: Optional[str] = None
    coupon_codes_enabled: bool = False
    
class FormConfigUpdate(BaseModel):
    fields: List[FormField]
    base_price: Optional[float] = 0.0
    pricing_rules: Optional[List[PricingRule]] = None
    early_bird_enabled: Optional[bool] = False
    early_bird_price: Optional[float] = None
    early_bird_end_date: Optional[str] = None
    coupon_codes_enabled: Optional[bool] = False

class CouponCode(BaseModel):
    code: str
    discount_type: str  # percentage, fixed
    discount_value: float
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    usage_limit: Optional[int] = None
    current_usage: int = 0
    is_active: bool = True

class CouponCodeCreate(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    usage_limit: Optional[int] = None
