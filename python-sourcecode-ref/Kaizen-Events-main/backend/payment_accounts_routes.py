from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List
import uuid
from datetime import datetime, timezone

from payment_accounts_models import (
    PaymentAccountCreate, PaymentAccountUpdate, PaymentAccountResponse,
    PaymentAccountListResponse, PaymentAccountStats, PaymentGatewayType
)
from models import UserInDB, UserRole

router = APIRouter(prefix="/api/payment-accounts", tags=["payment-accounts"])
security = HTTPBearer()

# Dependency to get database
async def get_db():
    from server import db
    return db

# Dependency to get current user
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db
    return await get_current_user_with_db(credentials)

# Require Super Admin
def require_super_admin(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required"
        )
    return current_user


@router.post("", response_model=PaymentAccountResponse)
async def create_payment_account(
    account_data: PaymentAccountCreate,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Create a new payment account (Super Admin only)"""
    db = await get_db()
    
    # Check if name already exists
    existing = await db.payment_accounts.find_one({"name": account_data.name})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment account with this name already exists"
        )
    
    account_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    # Determine if credentials are configured
    has_instamojo = bool(account_data.instamojo_api_key and account_data.instamojo_auth_token)
    has_razorpay = bool(account_data.razorpay_key_id and account_data.razorpay_key_secret)
    
    account_doc = {
        "id": account_id,
        "name": account_data.name,
        "gateway_type": account_data.gateway_type,
        "description": account_data.description,
        "is_active": account_data.is_active,
        
        # Instamojo credentials
        "instamojo_api_key": account_data.instamojo_api_key,
        "instamojo_auth_token": account_data.instamojo_auth_token,
        "instamojo_salt": account_data.instamojo_salt,
        "instamojo_mode": account_data.instamojo_mode,
        
        # Razorpay credentials
        "razorpay_key_id": account_data.razorpay_key_id,
        "razorpay_key_secret": account_data.razorpay_key_secret,
        "razorpay_mode": account_data.razorpay_mode,
        
        # Stats
        "total_transactions": 0,
        "total_amount_collected": 0.0,
        "last_transaction_at": None,
        
        # Metadata
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": current_user.id
    }
    
    await db.payment_accounts.insert_one(account_doc)
    
    # Return response without sensitive credentials
    return PaymentAccountResponse(
        id=account_id,
        name=account_data.name,
        gateway_type=account_data.gateway_type,
        description=account_data.description,
        is_active=account_data.is_active,
        instamojo_mode=account_data.instamojo_mode if account_data.gateway_type == PaymentGatewayType.INSTAMOJO else None,
        razorpay_mode=account_data.razorpay_mode if account_data.gateway_type == PaymentGatewayType.RAZORPAY else None,
        has_instamojo_credentials=has_instamojo,
        has_razorpay_credentials=has_razorpay,
        total_transactions=0,
        total_amount_collected=0.0,
        last_transaction_at=None,
        created_at=now,
        updated_at=now
    )


@router.get("", response_model=List[PaymentAccountResponse])
async def list_payment_accounts(
    current_user: UserInDB = Depends(require_super_admin)
):
    """List all payment accounts (Super Admin only)"""
    db = await get_db()
    
    accounts = await db.payment_accounts.find({}, {"_id": 0}).to_list(100)
    
    response = []
    for acc in accounts:
        has_instamojo = bool(acc.get("instamojo_api_key") and acc.get("instamojo_auth_token"))
        has_razorpay = bool(acc.get("razorpay_key_id") and acc.get("razorpay_key_secret"))
        
        response.append(PaymentAccountResponse(
            id=acc["id"],
            name=acc["name"],
            gateway_type=acc["gateway_type"],
            description=acc.get("description"),
            is_active=acc.get("is_active", True),
            instamojo_mode=acc.get("instamojo_mode") if acc["gateway_type"] == "instamojo" else None,
            razorpay_mode=acc.get("razorpay_mode") if acc["gateway_type"] == "razorpay" else None,
            has_instamojo_credentials=has_instamojo,
            has_razorpay_credentials=has_razorpay,
            total_transactions=acc.get("total_transactions", 0),
            total_amount_collected=acc.get("total_amount_collected", 0.0),
            last_transaction_at=acc.get("last_transaction_at"),
            created_at=acc["created_at"],
            updated_at=acc["updated_at"]
        ))
    
    return response


@router.get("/list", response_model=List[PaymentAccountListResponse])
async def list_payment_accounts_for_dropdown(
    current_user: UserInDB = Depends(get_current_user)
):
    """List active payment accounts for campaign dropdown (all authenticated users)"""
    db = await get_db()
    
    accounts = await db.payment_accounts.find(
        {"is_active": True},
        {"_id": 0, "id": 1, "name": 1, "gateway_type": 1, "is_active": 1}
    ).to_list(100)
    
    return [PaymentAccountListResponse(**acc) for acc in accounts]


@router.get("/{account_id}", response_model=PaymentAccountResponse)
async def get_payment_account(
    account_id: str,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Get payment account details (Super Admin only)"""
    db = await get_db()
    
    account = await db.payment_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment account not found"
        )
    
    has_instamojo = bool(account.get("instamojo_api_key") and account.get("instamojo_auth_token"))
    has_razorpay = bool(account.get("razorpay_key_id") and account.get("razorpay_key_secret"))
    
    return PaymentAccountResponse(
        id=account["id"],
        name=account["name"],
        gateway_type=account["gateway_type"],
        description=account.get("description"),
        is_active=account.get("is_active", True),
        instamojo_mode=account.get("instamojo_mode") if account["gateway_type"] == "instamojo" else None,
        razorpay_mode=account.get("razorpay_mode") if account["gateway_type"] == "razorpay" else None,
        has_instamojo_credentials=has_instamojo,
        has_razorpay_credentials=has_razorpay,
        total_transactions=account.get("total_transactions", 0),
        total_amount_collected=account.get("total_amount_collected", 0.0),
        last_transaction_at=account.get("last_transaction_at"),
        created_at=account["created_at"],
        updated_at=account["updated_at"]
    )


@router.put("/{account_id}", response_model=PaymentAccountResponse)
async def update_payment_account(
    account_id: str,
    update_data: PaymentAccountUpdate,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Update payment account (Super Admin only)"""
    db = await get_db()
    
    account = await db.payment_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment account not found"
        )
    
    # Build update dict
    update_dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    update_fields = update_data.model_dump(exclude_unset=True)
    for key, value in update_fields.items():
        if value is not None:
            update_dict[key] = value
    
    await db.payment_accounts.update_one(
        {"id": account_id},
        {"$set": update_dict}
    )
    
    # Fetch updated account
    updated = await db.payment_accounts.find_one({"id": account_id}, {"_id": 0})
    
    has_instamojo = bool(updated.get("instamojo_api_key") and updated.get("instamojo_auth_token"))
    has_razorpay = bool(updated.get("razorpay_key_id") and updated.get("razorpay_key_secret"))
    
    return PaymentAccountResponse(
        id=updated["id"],
        name=updated["name"],
        gateway_type=updated["gateway_type"],
        description=updated.get("description"),
        is_active=updated.get("is_active", True),
        instamojo_mode=updated.get("instamojo_mode") if updated["gateway_type"] == "instamojo" else None,
        razorpay_mode=updated.get("razorpay_mode") if updated["gateway_type"] == "razorpay" else None,
        has_instamojo_credentials=has_instamojo,
        has_razorpay_credentials=has_razorpay,
        total_transactions=updated.get("total_transactions", 0),
        total_amount_collected=updated.get("total_amount_collected", 0.0),
        last_transaction_at=updated.get("last_transaction_at"),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"]
    )


@router.delete("/{account_id}")
async def delete_payment_account(
    account_id: str,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Delete payment account (Super Admin only)"""
    db = await get_db()
    
    # Check if account exists
    account = await db.payment_accounts.find_one({"id": account_id})
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment account not found"
        )
    
    # Check if any campaigns are using this account
    campaigns_using = await db.campaigns.count_documents({"payment_account_id": account_id})
    if campaigns_using > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete: {campaigns_using} campaign(s) are using this payment account. Please reassign them first."
        )
    
    await db.payment_accounts.delete_one({"id": account_id})
    
    return {"message": "Payment account deleted successfully"}


@router.get("/{account_id}/stats", response_model=PaymentAccountStats)
async def get_payment_account_stats(
    account_id: str,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Get payment account balance and transaction stats (Super Admin only)"""
    db = await get_db()
    
    account = await db.payment_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment account not found"
        )
    
    # Get transaction stats from registrations
    pipeline = [
        {"$match": {"payment_account_id": account_id}},
        {"$group": {
            "_id": "$payment_status",
            "count": {"$sum": 1},
            "total": {"$sum": "$amount_paid"}
        }}
    ]
    
    stats_cursor = db.registrations.aggregate(pipeline)
    stats_data = await stats_cursor.to_list(100)
    
    successful = 0
    failed = 0
    total_amount = 0.0
    
    for stat in stats_data:
        if stat["_id"] == "completed":
            successful = stat["count"]
            total_amount = stat["total"]
        elif stat["_id"] == "failed":
            failed = stat["count"]
    
    # Get recent transactions
    recent = await db.registrations.find(
        {"payment_account_id": account_id},
        {"_id": 0, "id": 1, "amount_paid": 1, "payment_status": 1, "created_at": 1, "user_data": 1}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    return PaymentAccountStats(
        account_id=account_id,
        account_name=account["name"],
        gateway_type=account["gateway_type"],
        available_balance=None,  # Would need API call to payment gateway
        pending_balance=None,
        total_transactions=successful + failed,
        successful_transactions=successful,
        failed_transactions=failed,
        total_amount=total_amount,
        recent_transactions=recent,
        last_updated=datetime.now(timezone.utc)
    )
