from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from models import UserInDB, CampaignStatus, UserRole
from form_models_advanced import (
    FormConfig, FormConfigUpdate, CouponCode, CouponCodeCreate,
    FormulaValidation, FormulaResult
)
from formula_engine import formula_engine
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/api", tags=["form-builder"])
security = HTTPBearer()

# Dependency to get database
async def get_db():
    from server import db
    return db

# Dependency to get current user
async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db as get_user
    return await get_user(credentials)

# Dependency for super admin
def require_super_admin(current_user: UserInDB = Depends(get_current_user_with_db)) -> UserInDB:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required"
        )
    return current_user

@router.post("/formula/validate", response_model=FormulaResult)
async def validate_formula(
    validation: FormulaValidation,
    current_user: UserInDB = Depends(get_current_user_with_db)
):
    """Validate a formula"""
    try:
        result = formula_engine.validate_formula(validation.formula, validation.field_ids)
        
        return FormulaResult(
            is_valid=result.get("valid", False),
            result=result.get("test_result"),
            error=result.get("error"),
            parsed_formula=validation.formula
        )
    except Exception as e:
        return FormulaResult(
            is_valid=False,
            error=str(e)
        )

@router.get("/campaigns/{campaign_id}/form", response_model=Optional[FormConfig])
async def get_campaign_form(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get form configuration for a campaign"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access
    from models import UserRole
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    form_config = campaign.get("form_config")
    if not form_config:
        return None
    
    return FormConfig(**form_config)

@router.put("/campaigns/{campaign_id}/form", response_model=FormConfig)
async def update_campaign_form(
    campaign_id: str,
    form_config: FormConfigUpdate,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update form configuration for a campaign (Super Admin only)"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Update form configuration
    form_data = form_config.model_dump(exclude_unset=True)
    
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "form_config": form_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return FormConfig(**form_data)

@router.delete("/campaigns/{campaign_id}/form")
async def delete_campaign_form(
    campaign_id: str,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete form configuration for a campaign (Super Admin only)"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "form_config": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Form configuration deleted successfully"}

@router.get("/campaigns/{campaign_id}/coupons", response_model=List[CouponCode])
async def get_campaign_coupons(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get coupon codes for a campaign"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access
    from models import UserRole
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    coupons = await db.coupon_codes.find({"campaign_id": campaign_id}).to_list(1000)
    
    return [CouponCode(**{k: v for k, v in c.items() if k != '_id'}) for c in coupons]

@router.post("/campaigns/{campaign_id}/coupons", response_model=CouponCode)
async def create_campaign_coupon(
    campaign_id: str,
    coupon: CouponCodeCreate,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Create a coupon code for a campaign (Super Admin only)"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check if coupon code already exists for this campaign
    existing = await db.coupon_codes.find_one({
        "campaign_id": campaign_id,
        "code": coupon.code
    })
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coupon code already exists for this campaign"
        )
    
    coupon_doc = {
        **coupon.model_dump(),
        "campaign_id": campaign_id,
        "current_usage": 0,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.coupon_codes.insert_one(coupon_doc)
    
    return CouponCode(**coupon_doc)

@router.delete("/campaigns/{campaign_id}/coupons/{code}")
async def delete_campaign_coupon(
    campaign_id: str,
    code: str,
    current_user: UserInDB = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete a coupon code (Super Admin only)"""
    result = await db.coupon_codes.delete_one({
        "campaign_id": campaign_id,
        "code": code
    })
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coupon code not found"
        )
    
    return {"message": "Coupon code deleted successfully"}



# ==================== Pricing & Rules Evaluation ====================

from pydantic import BaseModel
from typing import Dict, Any

class PricingRequest(BaseModel):
    base_price: float
    field_values: Dict[str, Any]
    pricing_rules: Optional[list] = None
    pricing_formula: Optional[str] = None
    coupon_code: Optional[str] = None

class PricingResponse(BaseModel):
    base_price: float
    subtotal: float
    discount: float = 0
    discount_type: Optional[str] = None
    total_price: float
    applied_rules: list = []
    coupon_applied: Optional[str] = None

class FieldRulesRequest(BaseModel):
    field_values: Dict[str, Any]
    field_rules: list

class FieldRulesResponse(BaseModel):
    field_visibility: Dict[str, bool]
    field_required: Dict[str, bool]
    field_values: Dict[str, Any]

@router.post("/campaigns/{campaign_id}/calculate-price", response_model=PricingResponse)
async def calculate_price(
    campaign_id: str,
    request: PricingRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Calculate price based on form values, pricing rules, and coupon codes (Public endpoint)"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Calculate price using formula engine
    result = formula_engine.apply_pricing_rules(
        base_price=request.base_price,
        field_values=request.field_values,
        pricing_rules=request.pricing_rules or [],
        pricing_formula=request.pricing_formula
    )
    
    subtotal = result["total_price"]
    discount = 0
    discount_type = None
    coupon_applied = None
    
    # Apply coupon code if provided
    if request.coupon_code:
        coupon = await db.coupon_codes.find_one({
            "campaign_id": campaign_id,
            "code": request.coupon_code,
            "is_active": True
        })
        
        if coupon:
            # Check usage limit
            if coupon.get("usage_limit") and coupon.get("current_usage", 0) >= coupon["usage_limit"]:
                pass  # Coupon exhausted
            # Check expiry
            elif coupon.get("valid_until") and datetime.fromisoformat(coupon["valid_until"]) < datetime.now(timezone.utc):
                pass  # Coupon expired
            else:
                # Apply discount
                if coupon.get("discount_type") == "percentage":
                    discount = subtotal * (coupon.get("discount_value", 0) / 100)
                    discount_type = "percentage"
                else:
                    discount = min(coupon.get("discount_value", 0), subtotal)
                    discount_type = "fixed"
                coupon_applied = request.coupon_code
    
    total_price = max(0, subtotal - discount)
    
    return PricingResponse(
        base_price=request.base_price,
        subtotal=round(subtotal, 2),
        discount=round(discount, 2),
        discount_type=discount_type,
        total_price=round(total_price, 2),
        applied_rules=result.get("applied_rules", []),
        coupon_applied=coupon_applied
    )

@router.post("/evaluate-field-rules", response_model=FieldRulesResponse)
async def evaluate_field_rules(request: FieldRulesRequest):
    """Evaluate field rules and return visibility/required states (Public endpoint)"""
    field_visibility = {}
    field_required = {}
    field_values = dict(request.field_values)
    
    for rule in request.field_rules:
        conditions = rule.get("conditions", [])
        match_type = rule.get("match_type", "all")
        actions = rule.get("actions", [])
        
        # Evaluate conditions
        condition_results = []
        for condition in conditions:
            result = formula_engine.evaluate_condition(condition, request.field_values)
            condition_results.append(result)
        
        # Check if rule should apply
        if match_type == "all":
            rule_applies = all(condition_results) if condition_results else False
        else:  # any
            rule_applies = any(condition_results) if condition_results else False
        
        # Apply actions if rule matches
        if rule_applies:
            for action in actions:
                target_field = action.get("target_field_id")
                action_type = action.get("action")
                
                if action_type == "show":
                    field_visibility[target_field] = True
                elif action_type == "hide":
                    field_visibility[target_field] = False
                elif action_type == "require":
                    field_required[target_field] = True
                elif action_type == "set_value":
                    field_values[target_field] = action.get("value")
    
    return FieldRulesResponse(
        field_visibility=field_visibility,
        field_required=field_required,
        field_values=field_values
    )

@router.post("/campaigns/{campaign_id}/validate-coupon")
async def validate_coupon(
    campaign_id: str,
    code: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Validate a coupon code (Public endpoint)"""
    coupon = await db.coupon_codes.find_one({
        "campaign_id": campaign_id,
        "code": code,
        "is_active": True
    }, {"_id": 0})
    
    if not coupon:
        return {"valid": False, "error": "Invalid coupon code"}
    
    # Check usage limit
    if coupon.get("usage_limit") and coupon.get("current_usage", 0) >= coupon["usage_limit"]:
        return {"valid": False, "error": "Coupon usage limit reached"}
    
    # Check expiry
    if coupon.get("valid_until"):
        try:
            expiry = datetime.fromisoformat(coupon["valid_until"])
            if expiry < datetime.now(timezone.utc):
                return {"valid": False, "error": "Coupon has expired"}
        except Exception:
            pass
    
    return {
        "valid": True,
        "discount_type": coupon.get("discount_type"),
        "discount_value": coupon.get("discount_value"),
        "description": coupon.get("description")
    }
