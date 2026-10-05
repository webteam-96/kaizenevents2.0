from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum

class FieldType(str, Enum):
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
    RATING = "rating"
    SLIDER = "slider"
    MATRIX = "matrix"
    NAME = "name"  # First, Last, Middle
    ADDRESS = "address"  # Street, City, State, Zip
    CURRENCY = "currency"
    PERCENTAGE = "percentage"
    CALCULATED = "calculated"

class ValidationRule(BaseModel):
    type: str  # required, email, url, pattern, min, max, minLength, maxLength, custom
    value: Any
    message: Optional[str] = None
    formula: Optional[str] = None  # For custom validation formulas

class ConditionalLogic(BaseModel):
    field_id: str
    operator: str  # equals, not_equals, contains, not_contains, greater_than, less_than, between, is_empty, is_not_empty
    value: Any
    action: str  # show, hide, require, set_value, enable, disable
    target_field_id: Optional[str] = None
    target_value: Optional[Any] = None

class RuleCondition(BaseModel):
    """Condition for field rules (without action - action is in the actions array)"""
    field_id: str
    operator: str  # equals, not_equals, contains, not_contains, greater_than, less_than, between, is_empty, is_not_empty
    value: Optional[Any] = None

class RuleAction(BaseModel):
    """Action for field rules"""
    action: str  # show, hide, require, enable, disable, set_value
    target_field_id: str
    target_value: Optional[Any] = None

class PricingFormula(BaseModel):
    formula: str  # e.g., "field_1 * field_2 + 100"
    description: Optional[str] = None
    fields_used: List[str]  # List of field IDs used in formula

class FieldRule(BaseModel):
    id: Optional[str] = None
    name: str
    conditions: List[RuleCondition]
    match_type: str = "all"  # all, any
    actions: List[RuleAction]

class PageBreak(BaseModel):
    id: str
    title: Optional[str] = None
    description: Optional[str] = None
    order: int
    conditions: Optional[List[ConditionalLogic]] = None  # Show page based on conditions

class FormFieldOption(BaseModel):
    label: str
    value: str
    price_modifier: Optional[float] = 0.0
    image_url: Optional[str] = None
    conditional_fields: Optional[List[str]] = None  # Fields to show when selected

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
    field_rules: Optional[List[FieldRule]] = None
    default_value: Optional[Any] = None
    order: int = 0
    width: str = "full"  # full, half, third
    page: int = 1  # Page number for multi-page forms
    is_calculated: bool = False
    calculation_formula: Optional[str] = None  # e.g., "${field_1} * ${field_2}"
    hidden: bool = False  # Hidden fields for calculations
    read_only: bool = False
    unique: bool = False  # Unique value validation
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    prefix: Optional[str] = None  # e.g., "$", "Rs."
    suffix: Optional[str] = None  # e.g., "%", "kg"
    name_config: Optional[NameFieldConfig] = None  # For name field type (Zoho-style)
    
class PricingRule(BaseModel):
    id: str
    name: str
    formula: str  # Advanced formula with operators and functions
    conditions: Optional[List[ConditionalLogic]] = None
    priority: int = 0
    description: Optional[str] = None

class PageRule(BaseModel):
    id: str
    name: str
    source_page: int
    conditions: List[ConditionalLogic]
    action: str  # skip_to, go_to, submit
    target_page: Optional[int] = None
    match_type: str = "all"  # all, any

class FormIntegration(BaseModel):
    type: str  # google_sheets, email, webhook, zapier, slack, etc.
    enabled: bool = True
    config: Dict[str, Any]
    trigger: str = "on_submit"  # on_submit, on_approval, on_payment

class FormNotification(BaseModel):
    type: str  # email, sms, webhook
    recipients: List[str]
    subject: Optional[str] = None
    template: Optional[str] = None
    conditions: Optional[List[ConditionalLogic]] = None

class FormTheme(BaseModel):
    primary_color: str = "#7c3aed"
    secondary_color: str = "#14b8a6"
    background_color: str = "#ffffff"
    text_color: str = "#1e293b"
    accent_color: str = "#7c3aed"
    button_style: str = "rounded"  # rounded, square, pill
    font_family: str = "Plus Jakarta Sans"
    card_style: str = "solid"  # solid, glass
    gradient: Optional[str] = None
    page_background: str = "#f8fafc"  # Page/outer background color

class FormSettings(BaseModel):
    allow_multiple_submissions: bool = False
    require_login: bool = False
    save_and_continue: bool = True
    show_progress_bar: bool = True
    show_submission_number: bool = True
    captcha_enabled: bool = False
    redirect_url: Optional[str] = None
    success_message: str = "Thank you for your submission!"
    collect_location: bool = False
    collect_device_info: bool = False

class FormConfig(BaseModel):
    fields: List[FormField]
    base_price: float = 0.0
    pricing_rules: Optional[List[PricingRule]] = None
    pricing_formula: Optional[str] = None  # Master formula
    early_bird_enabled: bool = False
    early_bird_price: Optional[float] = None
    early_bird_end_date: Optional[str] = None
    coupon_codes_enabled: bool = False
    page_breaks: Optional[List[PageBreak]] = None
    page_rules: Optional[List[PageRule]] = None
    field_rules: Optional[List[FieldRule]] = None
    integrations: Optional[List[FormIntegration]] = None
    notifications: Optional[List[FormNotification]] = None
    theme: Optional[FormTheme] = None
    settings: Optional[FormSettings] = None
    # New fields for form design
    header_image: Optional[str] = None  # URL for form header banner
    form_template_id: Optional[str] = None  # Template ID (elegant-gala, professional-seminar, etc.)
    
class FormConfigUpdate(BaseModel):
    fields: Optional[List[FormField]] = None
    base_price: Optional[float] = 0.0
    pricing_rules: Optional[List[PricingRule]] = None
    pricing_formula: Optional[str] = None
    early_bird_enabled: Optional[bool] = False
    early_bird_price: Optional[float] = None
    early_bird_end_date: Optional[str] = None
    coupon_codes_enabled: Optional[bool] = False
    page_breaks: Optional[List[PageBreak]] = None
    page_rules: Optional[List[PageRule]] = None
    field_rules: Optional[List[FieldRule]] = None
    integrations: Optional[List[FormIntegration]] = None
    notifications: Optional[List[FormNotification]] = None
    theme: Optional[FormTheme] = None
    settings: Optional[FormSettings] = None
    # New fields for form design
    header_image: Optional[str] = None
    form_template_id: Optional[str] = None

class CouponCode(BaseModel):
    code: str
    discount_type: str  # percentage, fixed, formula
    discount_value: float
    formula: Optional[str] = None  # For complex discount calculations
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    usage_limit: Optional[int] = None
    current_usage: int = 0
    is_active: bool = True
    conditions: Optional[List[ConditionalLogic]] = None

class CouponCodeCreate(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    formula: Optional[str] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    usage_limit: Optional[int] = None
    conditions: Optional[List[ConditionalLogic]] = None

class FormulaValidation(BaseModel):
    formula: str
    field_ids: List[str]

class FormulaResult(BaseModel):
    is_valid: bool
    result: Optional[float] = None
    error: Optional[str] = None
    parsed_formula: Optional[str] = None
