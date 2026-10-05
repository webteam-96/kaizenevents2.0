from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from fund_transfer_models import (
    FundCollectionMode, TransferStatus, ChangeRequestType, ChangeRequestStatus,
    CampaignBankAccountCreate, CampaignBankAccountUpdate, CampaignBankAccountResponse,
    FundTransferCreate, FundTransferComplete, FundTransferResponse,
    ChangeRequestCreate, ChangeRequestResponse,
    CampaignFundSummary, FundTransferStats,
    ApprovalAction, RejectionAction
)
from models import UserInDB, UserRole
from settlement_service import get_campaign_settlement_summary, sync_campaign_settlements
from integration_service import brevo_service
from audit_log import audit, AuditEventType

router = APIRouter(prefix="/api/fund-transfers", tags=["fund-transfers"])
security = HTTPBearer()

PLATFORM_FEE_PERCENTAGE = 0.0295  # 2.95%


# ==================== EMAIL TEMPLATES ====================

def get_transfer_completed_email(transfer: dict, campaign: dict) -> tuple:
    """Generate email content for completed transfer"""
    subject = f"Fund Transfer Completed - {campaign['name']}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Fund Transfer Completed</h1>
            </div>
            
            <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0;">
                <p>Dear {campaign['organization_name']},</p>
                
                <p>We are pleased to inform you that a fund transfer has been successfully completed for your event.</p>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #6366f1; margin-top: 0;">Transfer Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Event:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{campaign['name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Transfer Amount:</td>
                            <td style="padding: 8px 0; font-weight: bold; color: #059669;">₹{transfer['amount']:,.2f}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Transaction Reference:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{transfer.get('transaction_reference', 'N/A')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Transfer Date:</td>
                            <td style="padding: 8px 0;">{transfer.get('transfer_date', 'N/A')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Request Number:</td>
                            <td style="padding: 8px 0;">{transfer.get('request_number', 'N/A')}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #059669;">
                    <p style="margin: 0; color: #059669;">
                        <strong>✓ Funds have been credited to your registered bank account.</strong>
                    </p>
                </div>
                
                <p style="margin-top: 20px;">If you have any questions, please contact our support team.</p>
                
                <p>Best regards,<br><strong>Kaizen Events Team</strong></p>
            </div>
            
            <div style="background: #1e293b; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
                <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                    This is an automated notification from Kaizen Events Platform
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


def get_transfer_approved_email(transfer: dict, campaign: dict) -> tuple:
    """Generate email content for approved transfer"""
    subject = f"Fund Transfer Approved - {campaign['name']}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Fund Transfer Approved</h1>
            </div>
            
            <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0;">
                <p>Dear {campaign['organization_name']},</p>
                
                <p>Your fund transfer request has been approved and will be processed shortly.</p>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #3b82f6; margin-top: 0;">Transfer Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Event:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{campaign['name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Approved Amount:</td>
                            <td style="padding: 8px 0; font-weight: bold; color: #3b82f6;">₹{transfer['amount']:,.2f}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Request Number:</td>
                            <td style="padding: 8px 0;">{transfer.get('request_number', 'N/A')}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background: #eff6ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <p style="margin: 0; color: #1d4ed8;">
                        <strong>ℹ The transfer will be processed within 2-3 business days.</strong>
                    </p>
                </div>
                
                <p style="margin-top: 20px;">You will receive another notification once the funds are credited to your account.</p>
                
                <p>Best regards,<br><strong>Kaizen Events Team</strong></p>
            </div>
            
            <div style="background: #1e293b; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
                <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                    This is an automated notification from Kaizen Events Platform
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


async def send_transfer_email(transfer: dict, campaign: dict, email_type: str):
    """Send transfer notification email"""
    notification_email = transfer.get("notification_email")
    if not notification_email:
        return {"success": False, "error": "No notification email configured"}
    
    if email_type == "completed":
        subject, html_content = get_transfer_completed_email(transfer, campaign)
    elif email_type == "approved":
        subject, html_content = get_transfer_approved_email(transfer, campaign)
    else:
        return {"success": False, "error": f"Unknown email type: {email_type}"}
    
    return await brevo_service.send_email(
        to_email=notification_email,
        to_name=campaign['organization_name'],
        subject=subject,
        html_content=html_content
    )


async def get_db():
    from server import db
    return db


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db
    return await get_current_user_with_db(credentials)


def require_super_admin(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required"
        )
    return current_user


def require_approver(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required"
        )
    if not current_user.can_approve_transfers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Transfer approval permission required"
        )
    return current_user


def generate_request_number(prefix: str) -> str:
    now = datetime.now(timezone.utc)
    return f"{prefix}-{now.strftime('%Y')}-{str(uuid.uuid4())[:8].upper()}"


def mask_account_number(account_number: str) -> str:
    if len(account_number) <= 4:
        return "****"
    return "****" + account_number[-4:]


# ==================== STATS & DASHBOARD ====================

@router.get("/stats")
async def get_fund_transfer_stats(
    campaign_id: Optional[str] = Query(None, description="Filter by campaign ID"),
    current_user: UserInDB = Depends(require_super_admin)
):
    """Get fund transfer statistics (Super Admin only). Can filter by campaign."""
    db = await get_db()
    
    # Build query filter
    query = {"fund_collection_mode": FundCollectionMode.KAIZEN_MANAGED}
    if campaign_id:
        query["id"] = campaign_id
    
    # Get campaigns
    campaigns = await db.campaigns.find(query, {"_id": 0}).to_list(1000)
    
    total_collected = 0.0
    gateway_fees = 0.0
    gateway_settled = 0.0
    gateway_pending = 0.0
    total_transferred = 0.0
    campaigns_with_pending = 0
    total_platform_fee = 0.0
    total_kaizen_share = 0.0
    
    for campaign in campaigns:
        # Get settlement summary from actual payment data
        settlement_summary = await get_campaign_settlement_summary(db, campaign["id"])
        
        campaign_collected = settlement_summary["total_collected"]
        campaign_gateway_fees = settlement_summary["gateway_fees"]
        campaign_gateway_settled = settlement_summary["gateway_settled"]
        campaign_gateway_pending = settlement_summary["gateway_pending"]
        campaign_transferred = campaign.get("total_transferred", 0)
        
        total_collected += campaign_collected
        gateway_fees += campaign_gateway_fees
        gateway_settled += campaign_gateway_settled
        gateway_pending += campaign_gateway_pending
        total_transferred += campaign_transferred
        
        # Platform fee is 2.95% of total collected amount
        # Kaizen's share = Platform fee - Gateway charges (since gateway already deducted their part)
        platform_fee = campaign_collected * PLATFORM_FEE_PERCENTAGE
        kaizen_share = max(0, platform_fee - campaign_gateway_fees)
        
        total_platform_fee += platform_fee
        total_kaizen_share += kaizen_share
        
        # Net payable = Gateway settled - Kaizen's share
        net_payable = campaign_gateway_settled - kaizen_share
        
        if net_payable > campaign_transferred:
            campaigns_with_pending += 1
    
    # Net payable to organizers = Gateway settled - Kaizen's share
    net_payable_total = gateway_settled - total_kaizen_share
    pending_transfer = max(0, net_payable_total - total_transferred)
    
    # Count pending approvals
    pending_approval_count = await db.fund_transfers.count_documents(
        {"status": TransferStatus.PENDING_APPROVAL}
    )
    pending_approval_count += await db.change_requests.count_documents(
        {"status": ChangeRequestStatus.PENDING}
    )
    
    return {
        "total_collected": total_collected,
        "gateway_charges": gateway_fees,
        "gateway_settled": gateway_settled,
        "gateway_pending": gateway_pending,
        "platform_fee": total_platform_fee,  # Full 2.95% of collected
        "kaizen_share": total_kaizen_share,  # Platform fee minus gateway charges
        "net_payable": max(0, net_payable_total),
        "total_transferred": total_transferred,
        "pending_transfer": pending_transfer,
        "pending_approval_count": pending_approval_count,
        "campaigns_with_pending": campaigns_with_pending
    }


@router.post("/sync-settlements/{campaign_id}")
async def sync_campaign_settlement_data(
    campaign_id: str,
    current_user: UserInDB = Depends(require_super_admin)
):
    """
    Sync settlement data from payment gateways for a campaign.
    This fetches actual gateway fees and settlement status from Razorpay/Instamojo.
    """
    db = await get_db()
    
    # Verify campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Sync settlements
    result = await sync_campaign_settlements(db, campaign_id)
    
    return {
        "message": "Settlement sync completed",
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name"),
        "summary": result
    }


@router.post("/sync-all-settlements")
async def sync_all_settlements(
    current_user: UserInDB = Depends(require_super_admin)
):
    """
    Sync settlement data from payment gateways for all Kaizen-managed campaigns.
    """
    db = await get_db()
    
    # Get all kaizen managed campaigns
    campaigns = await db.campaigns.find(
        {"fund_collection_mode": FundCollectionMode.KAIZEN_MANAGED},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(1000)
    
    results = []
    for campaign in campaigns:
        try:
            result = await sync_campaign_settlements(db, campaign["id"])
            results.append({
                "campaign_id": campaign["id"],
                "campaign_name": campaign["name"],
                "status": "success",
                "summary": result
            })
        except Exception as e:
            results.append({
                "campaign_id": campaign["id"],
                "campaign_name": campaign["name"],
                "status": "error",
                "error": str(e)
            })
    
    return {
        "message": "Settlement sync completed for all campaigns",
        "results": results
    }


@router.get("/campaigns-pending")
async def get_campaigns_with_pending_transfers(
    current_user: UserInDB = Depends(require_super_admin)
):
    """Get list of campaigns with pending transfers"""
    db = await get_db()
    
    campaigns = await db.campaigns.find(
        {"fund_collection_mode": FundCollectionMode.KAIZEN_MANAGED},
        {"_id": 0}
    ).to_list(1000)
    
    result = []
    for campaign in campaigns:
        # Get settlement summary from actual payment data
        settlement_summary = await get_campaign_settlement_summary(db, campaign["id"])
        
        collected = settlement_summary["total_collected"]
        gateway_fees = settlement_summary["gateway_fees"]
        gateway_settled = settlement_summary["gateway_settled"]
        gateway_pending = settlement_summary["gateway_pending"]
        transferred = campaign.get("total_transferred", 0)
        
        # Platform fee is 2.95% of total collected
        # Kaizen's share = Platform fee - Gateway charges
        platform_fee = collected * PLATFORM_FEE_PERCENTAGE
        kaizen_share = max(0, platform_fee - gateway_fees)
        
        # Net payable = Gateway settled - Kaizen's share
        net_payable = gateway_settled - kaizen_share
        pending = max(0, net_payable - transferred)
        
        if pending > 0 or collected > 0:  # Show all campaigns with any collection
            result.append({
                "campaign_id": campaign["id"],
                "campaign_name": campaign["name"],
                "organization_name": campaign["organization_name"],
                "collected": collected,
                "gateway_fees": gateway_fees,
                "gateway_settled": gateway_settled,
                "gateway_pending": gateway_pending,
                "platform_fee": platform_fee,
                "kaizen_share": kaizen_share,
                "net_payable": max(0, net_payable),
                "transferred": transferred,
                "pending": pending
            })
    
    # Sort by pending amount descending
    result.sort(key=lambda x: x["pending"], reverse=True)
    
    return result


# ==================== CAMPAIGN FUND SUMMARY ====================

@router.get("/campaign/{campaign_id}/summary")
async def get_campaign_fund_summary(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get fund summary for a campaign"""
    db = await get_db()
    
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(status_code=403, detail="Access denied")
    
    fund_mode = campaign.get("fund_collection_mode")
    if fund_mode != FundCollectionMode.KAIZEN_MANAGED:
        return {"fund_collection_mode": fund_mode, "message": "Fund management not applicable"}
    
    # Get actual settlement data from payments
    settlement_summary = await get_campaign_settlement_summary(db, campaign_id)
    
    collected = settlement_summary["total_collected"]
    gateway_fees = settlement_summary["gateway_fees"]
    gateway_settled = settlement_summary["gateway_settled"]
    gateway_pending = settlement_summary["gateway_pending"]
    transferred = campaign.get("total_transferred", 0)
    
    # Platform fee is 2.95% of total collected
    # Kaizen's share = Platform fee - Gateway charges
    platform_fee = collected * PLATFORM_FEE_PERCENTAGE
    kaizen_share = max(0, platform_fee - gateway_fees)
    
    # Net payable = Gateway settled - Kaizen's share
    net_payable = gateway_settled - kaizen_share
    pending = max(0, net_payable - transferred)
    
    # Get bank account
    bank_account = await db.campaign_bank_accounts.find_one(
        {"campaign_id": campaign_id}, {"_id": 0}
    )
    
    # Count pending approvals for this campaign
    pending_approval_count = await db.fund_transfers.count_documents({
        "campaign_id": campaign_id,
        "status": TransferStatus.PENDING_APPROVAL
    })
    
    # For org admin, show simplified view (what they receive, not Kaizen's breakdown)
    if current_user.role == UserRole.ORG_ADMIN:
        return {
            "campaign_id": campaign_id,
            "campaign_name": campaign["name"],
            "organization_name": campaign["organization_name"],
            "fund_collection_mode": fund_mode,
            "total_collected": collected,  # What users paid
            "amount_receivable": net_payable,  # What organizer will receive
            "amount_received": transferred,  # Already transferred
            "amount_pending": pending,  # Yet to receive
            "gateway_pending": gateway_pending,  # Still with payment gateway
            "has_bank_account": bank_account is not None,
            "bank_account": {
                "account_name": bank_account["account_name"],
                "account_number_masked": bank_account["account_number_masked"],
                "ifsc_code": bank_account["ifsc_code"],
                "bank_name": bank_account["bank_name"],
                "notification_email": bank_account["notification_email"]
            } if bank_account else None,
            "view_type": "org_admin"
        }
    
    # For super admin, show full breakdown
    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign["name"],
        "organization_name": campaign["organization_name"],
        "fund_collection_mode": fund_mode,
        "total_collected": collected,
        "gateway_fees": gateway_fees,
        "gateway_settled": gateway_settled,
        "gateway_pending": gateway_pending,
        "platform_fee": platform_fee,
        "kaizen_share": kaizen_share,
        "net_payable": net_payable,
        "transferred": transferred,
        "pending": pending,
        "has_bank_account": bank_account is not None,
        "bank_account": {
            "id": bank_account["id"],
            "account_name": bank_account["account_name"],
            "account_number": bank_account["account_number"],
            "account_number_masked": bank_account["account_number_masked"],
            "ifsc_code": bank_account["ifsc_code"],
            "bank_name": bank_account["bank_name"],
            "notification_email": bank_account["notification_email"]
        } if bank_account else None,
        "pending_approval_count": pending_approval_count,
        "view_type": "super_admin"
    }


# ==================== BANK ACCOUNT MANAGEMENT ====================

@router.post("/campaign/{campaign_id}/bank-account")
async def create_bank_account(
    campaign_id: str,
    account_data: CampaignBankAccountCreate,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Add bank account for a campaign (Super Admin only, requires approval)"""
    db = await get_db()
    
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Check if bank account already exists
    existing = await db.campaign_bank_accounts.find_one({"campaign_id": campaign_id})
    if existing:
        raise HTTPException(status_code=400, detail="Bank account already exists for this campaign")
    
    # Create change request for approval
    request_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    change_request = {
        "id": request_id,
        "request_number": generate_request_number("BA"),
        "campaign_id": campaign_id,
        "campaign_name": campaign["name"],
        "organization_name": campaign["organization_name"],
        "request_type": ChangeRequestType.BANK_ACCOUNT,
        "current_value": None,
        "new_value": {
            "account_name": account_data.account_name,
            "account_number": account_data.account_number,
            "account_number_masked": mask_account_number(account_data.account_number),
            "ifsc_code": account_data.ifsc_code,
            "bank_name": account_data.bank_name,
            "notification_email": account_data.notification_email
        },
        "reason": "New bank account setup",
        "status": ChangeRequestStatus.PENDING,
        "created_by": current_user.id,
        "created_at": now.isoformat()
    }
    
    await db.change_requests.insert_one(change_request)
    
    return {"message": "Bank account request submitted for approval", "request_id": request_id}


@router.put("/campaign/{campaign_id}/bank-account")
async def update_bank_account(
    campaign_id: str,
    account_data: CampaignBankAccountUpdate,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Update bank account for a campaign (Super Admin only, requires approval)"""
    db = await get_db()
    
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    existing = await db.campaign_bank_accounts.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="No bank account found for this campaign")
    
    # Create change request for approval
    request_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    new_value = {}
    if account_data.account_name:
        new_value["account_name"] = account_data.account_name
    if account_data.account_number:
        new_value["account_number"] = account_data.account_number
        new_value["account_number_masked"] = mask_account_number(account_data.account_number)
    if account_data.ifsc_code:
        new_value["ifsc_code"] = account_data.ifsc_code
    if account_data.bank_name:
        new_value["bank_name"] = account_data.bank_name
    if account_data.notification_email:
        new_value["notification_email"] = account_data.notification_email
    
    change_request = {
        "id": request_id,
        "request_number": generate_request_number("BA"),
        "campaign_id": campaign_id,
        "campaign_name": campaign["name"],
        "organization_name": campaign["organization_name"],
        "request_type": ChangeRequestType.BANK_ACCOUNT,
        "current_value": {
            "account_name": existing["account_name"],
            "account_number_masked": existing["account_number_masked"],
            "ifsc_code": existing["ifsc_code"],
            "bank_name": existing["bank_name"],
            "notification_email": existing["notification_email"]
        },
        "new_value": new_value,
        "reason": "Bank account update",
        "status": ChangeRequestStatus.PENDING,
        "created_by": current_user.id,
        "created_at": now.isoformat()
    }
    
    await db.change_requests.insert_one(change_request)
    
    return {"message": "Bank account update request submitted for approval", "request_id": request_id}


@router.get("/campaign/{campaign_id}/bank-account")
async def get_bank_account(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get bank account for a campaign"""
    db = await get_db()
    
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(status_code=403, detail="Access denied")
    
    bank_account = await db.campaign_bank_accounts.find_one(
        {"campaign_id": campaign_id}, {"_id": 0}
    )
    
    if not bank_account:
        return None
    
    # For org admin, mask account number
    if current_user.role == UserRole.ORG_ADMIN:
        return {
            "account_name": bank_account["account_name"],
            "account_number_masked": bank_account["account_number_masked"],
            "ifsc_code": bank_account["ifsc_code"],
            "bank_name": bank_account["bank_name"],
            "notification_email": bank_account["notification_email"]
        }
    
    return bank_account


# ==================== FUND TRANSFERS ====================

@router.post("")
async def create_fund_transfer(
    transfer_data: FundTransferCreate,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Create a fund transfer request (Super Admin only, requires approval)"""
    db = await get_db()
    
    campaign = await db.campaigns.find_one({"id": transfer_data.campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign.get("fund_collection_mode") != FundCollectionMode.KAIZEN_MANAGED:
        raise HTTPException(status_code=400, detail="Fund transfers only applicable for Kaizen-managed campaigns")
    
    # Check bank account exists
    bank_account = await db.campaign_bank_accounts.find_one(
        {"campaign_id": transfer_data.campaign_id}, {"_id": 0}
    )
    if not bank_account:
        raise HTTPException(status_code=400, detail="Bank account not configured for this campaign")
    
    # Calculate available amount
    collected = campaign.get("total_revenue", 0)
    transferred = campaign.get("total_transferred", 0)
    platform_fee = collected * PLATFORM_FEE_PERCENTAGE
    net_payable = collected - platform_fee
    available = net_payable - transferred
    
    if transfer_data.amount > available:
        raise HTTPException(
            status_code=400, 
            detail=f"Transfer amount exceeds available balance. Available: ₹{available:.2f}"
        )
    
    if transfer_data.amount <= 0:
        raise HTTPException(status_code=400, detail="Transfer amount must be positive")
    
    # Create transfer request
    transfer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    transfer_doc = {
        "id": transfer_id,
        "request_number": generate_request_number("TR"),
        "campaign_id": transfer_data.campaign_id,
        "campaign_name": campaign["name"],
        "organization_name": campaign["organization_name"],
        "amount": transfer_data.amount,
        "status": TransferStatus.PENDING_APPROVAL,
        "bank_account_id": bank_account["id"],
        "bank_account_snapshot": {
            "account_name": bank_account["account_name"],
            "account_number_masked": bank_account["account_number_masked"],
            "ifsc_code": bank_account["ifsc_code"],
            "bank_name": bank_account["bank_name"]
        },
        "created_by": current_user.id,
        "created_at": now.isoformat(),
        "notes": transfer_data.notes,
        "notification_email": bank_account["notification_email"]
    }
    
    await db.fund_transfers.insert_one(transfer_doc)
    
    # Log fund transfer creation
    await audit.log(
        AuditEventType.TRANSFER_CREATED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="fund_transfer",
        resource_id=transfer_id,
        action_details={
            "campaign_id": transfer_data.campaign_id,
            "campaign_name": campaign["name"],
            "amount": transfer_data.amount,
            "request_number": transfer_doc["request_number"]
        }
    )
    
    return {"message": "Transfer request submitted for approval", "transfer_id": transfer_id, "request_number": transfer_doc["request_number"]}


@router.get("")
async def list_fund_transfers(
    campaign_id: Optional[str] = None,
    status: Optional[TransferStatus] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """List fund transfers"""
    db = await get_db()
    
    query = {}
    
    if current_user.role == UserRole.ORG_ADMIN:
        # Org admin can only see transfers for their campaigns
        query["campaign_id"] = {"$in": current_user.campaign_access}
    
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    if status:
        query["status"] = status
    
    transfers = await db.fund_transfers.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get user names
    user_ids = set()
    for t in transfers:
        if t.get("created_by"):
            user_ids.add(t["created_by"])
        if t.get("approved_by"):
            user_ids.add(t["approved_by"])
        if t.get("completed_by"):
            user_ids.add(t["completed_by"])
    
    users = await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    user_names = {u["id"]: u["name"] for u in users}
    
    for t in transfers:
        t["created_by_name"] = user_names.get(t.get("created_by"))
        t["approved_by_name"] = user_names.get(t.get("approved_by"))
        t["completed_by_name"] = user_names.get(t.get("completed_by"))
    
    return transfers


@router.get("/campaign/{campaign_id}/transfers")
async def get_campaign_transfers(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get transfers for a specific campaign"""
    db = await get_db()
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN:
        if campaign_id not in current_user.campaign_access:
            raise HTTPException(status_code=403, detail="Access denied")
    
    transfers = await db.fund_transfers.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return transfers


# ==================== APPROVALS ====================

@router.get("/pending-approvals")
async def get_pending_approvals(
    current_user: UserInDB = Depends(require_approver)
):
    """Get all pending approvals (Director only)"""
    db = await get_db()
    
    # Get pending transfer requests
    pending_transfers = await db.fund_transfers.find(
        {"status": TransferStatus.PENDING_APPROVAL},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get pending change requests
    pending_changes = await db.change_requests.find(
        {"status": ChangeRequestStatus.PENDING},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get user names
    user_ids = set()
    for t in pending_transfers:
        if t.get("created_by"):
            user_ids.add(t["created_by"])
    for c in pending_changes:
        if c.get("created_by"):
            user_ids.add(c["created_by"])
    
    users = await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    user_names = {u["id"]: u["name"] for u in users}
    
    for t in pending_transfers:
        t["created_by_name"] = user_names.get(t.get("created_by"))
        t["type"] = "fund_transfer"
    
    for c in pending_changes:
        c["created_by_name"] = user_names.get(c.get("created_by"))
        c["type"] = c["request_type"]
    
    return {
        "transfers": pending_transfers,
        "change_requests": pending_changes,
        "total_pending": len(pending_transfers) + len(pending_changes)
    }


@router.put("/{transfer_id}/approve")
async def approve_transfer(
    transfer_id: str,
    action: ApprovalAction,
    current_user: UserInDB = Depends(require_approver)
):
    """Approve a fund transfer request (Director only)"""
    db = await get_db()
    
    transfer = await db.fund_transfers.find_one({"id": transfer_id}, {"_id": 0})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    if transfer["status"] != TransferStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Transfer is not pending approval")
    
    # Get campaign for email
    campaign = await db.campaigns.find_one({"id": transfer["campaign_id"]}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    
    await db.fund_transfers.update_one(
        {"id": transfer_id},
        {"$set": {
            "status": TransferStatus.APPROVED,
            "approved_by": current_user.id,
            "approved_at": now.isoformat(),
            "approval_notes": action.notes
        }}
    )
    
    # Log transfer approval
    await audit.log(
        AuditEventType.TRANSFER_APPROVED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="fund_transfer",
        resource_id=transfer_id,
        action_details={
            "campaign_id": transfer["campaign_id"],
            "amount": transfer["amount"],
            "request_number": transfer.get("request_number")
        }
    )
    
    # Send approval notification email
    if transfer.get("notification_email"):
        await send_transfer_email(transfer, campaign, "approved")
    
    return {"message": "Transfer approved successfully"}


@router.put("/{transfer_id}/reject")
async def reject_transfer(
    transfer_id: str,
    action: RejectionAction,
    current_user: UserInDB = Depends(require_approver)
):
    """Reject a fund transfer request (Director only)"""
    db = await get_db()
    
    transfer = await db.fund_transfers.find_one({"id": transfer_id}, {"_id": 0})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    if transfer["status"] != TransferStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Transfer is not pending approval")
    
    now = datetime.now(timezone.utc)
    
    await db.fund_transfers.update_one(
        {"id": transfer_id},
        {"$set": {
            "status": TransferStatus.REJECTED,
            "rejected_by": current_user.id,
            "rejected_at": now.isoformat(),
            "rejection_reason": action.reason
        }}
    )
    
    # Log transfer rejection
    await audit.log(
        AuditEventType.TRANSFER_REJECTED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="fund_transfer",
        resource_id=transfer_id,
        action_details={
            "campaign_id": transfer["campaign_id"],
            "amount": transfer["amount"],
            "request_number": transfer.get("request_number"),
            "rejection_reason": action.reason
        }
    )
    
    return {"message": "Transfer rejected"}


@router.put("/{transfer_id}/resubmit")
async def resubmit_transfer(
    transfer_id: str,
    transfer_data: FundTransferCreate,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Modify and resubmit a rejected transfer (Super Admin only)"""
    db = await get_db()
    
    transfer = await db.fund_transfers.find_one({"id": transfer_id}, {"_id": 0})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    if transfer["status"] != TransferStatus.REJECTED:
        raise HTTPException(status_code=400, detail="Only rejected transfers can be resubmitted")
    
    # Validate amount
    campaign = await db.campaigns.find_one({"id": transfer["campaign_id"]}, {"_id": 0})
    collected = campaign.get("total_revenue", 0)
    transferred = campaign.get("total_transferred", 0)
    platform_fee = collected * PLATFORM_FEE_PERCENTAGE
    net_payable = collected - platform_fee
    available = net_payable - transferred
    
    if transfer_data.amount > available:
        raise HTTPException(
            status_code=400, 
            detail=f"Transfer amount exceeds available balance. Available: ₹{available:.2f}"
        )
    
    await db.fund_transfers.update_one(
        {"id": transfer_id},
        {"$set": {
            "amount": transfer_data.amount,
            "notes": transfer_data.notes,
            "status": TransferStatus.PENDING_APPROVAL,
            "rejected_by": None,
            "rejected_at": None,
            "rejection_reason": None
        }}
    )
    
    return {"message": "Transfer resubmitted for approval"}


@router.put("/{transfer_id}/complete")
async def complete_transfer(
    transfer_id: str,
    complete_data: FundTransferComplete,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Mark a transfer as completed after bank transfer (Super Admin only)"""
    db = await get_db()
    
    transfer = await db.fund_transfers.find_one({"id": transfer_id}, {"_id": 0})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    if transfer["status"] != TransferStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Transfer must be approved before completing")
    
    # Get campaign for email
    campaign = await db.campaigns.find_one({"id": transfer["campaign_id"]}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    
    # Update transfer
    update_data = {
        "status": TransferStatus.COMPLETED,
        "completed_by": current_user.id,
        "completed_at": now.isoformat(),
        "transaction_reference": complete_data.transaction_reference,
        "transfer_date": complete_data.transfer_date
    }
    
    # Send notification email
    if complete_data.send_notification and transfer.get("notification_email"):
        # Update transfer with transaction details before sending email
        transfer["transaction_reference"] = complete_data.transaction_reference
        transfer["transfer_date"] = complete_data.transfer_date
        
        email_result = await send_transfer_email(transfer, campaign, "completed")
        if email_result.get("success"):
            update_data["notification_sent"] = True
            update_data["notification_sent_at"] = now.isoformat()
        else:
            # Log error but don't fail the transfer
            import logging
            logging.warning(f"Failed to send transfer notification: {email_result.get('error')}")
    
    await db.fund_transfers.update_one({"id": transfer_id}, {"$set": update_data})
    
    # Update campaign total_transferred
    await db.campaigns.update_one(
        {"id": transfer["campaign_id"]},
        {"$inc": {"total_transferred": transfer["amount"]}}
    )
    
    # Log transfer completion
    await audit.log(
        AuditEventType.TRANSFER_COMPLETED,
        user_id=current_user.id,
        user_email=current_user.email,
        resource_type="fund_transfer",
        resource_id=transfer_id,
        action_details={
            "campaign_id": transfer["campaign_id"],
            "amount": transfer["amount"],
            "request_number": transfer.get("request_number"),
            "transaction_reference": complete_data.transaction_reference
        }
    )
    
    return {"message": "Transfer marked as completed"}


@router.post("/{transfer_id}/send-notification")
async def send_transfer_notification_endpoint(
    transfer_id: str,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Manually send notification for a completed transfer"""
    db = await get_db()
    
    transfer = await db.fund_transfers.find_one({"id": transfer_id}, {"_id": 0})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    if transfer["status"] != TransferStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Can only send notification for completed transfers")
    
    # Get campaign for email
    campaign = await db.campaigns.find_one({"id": transfer["campaign_id"]}, {"_id": 0})
    
    # Send email
    email_result = await send_transfer_email(transfer, campaign, "completed")
    
    if not email_result.get("success"):
        raise HTTPException(status_code=500, detail=f"Failed to send email: {email_result.get('error')}")
    
    now = datetime.now(timezone.utc)
    
    await db.fund_transfers.update_one(
        {"id": transfer_id},
        {"$set": {
            "notification_sent": True,
            "notification_sent_at": now.isoformat()
        }}
    )
    
    return {"message": f"Notification sent to {transfer.get('notification_email')}"}


# ==================== CHANGE REQUESTS ====================

@router.get("/change-requests")
async def list_change_requests(
    campaign_id: Optional[str] = None,
    request_type: Optional[ChangeRequestType] = None,
    status: Optional[ChangeRequestStatus] = None,
    current_user: UserInDB = Depends(require_super_admin)
):
    """List change requests"""
    db = await get_db()
    
    query = {}
    if campaign_id:
        query["campaign_id"] = campaign_id
    if request_type:
        query["request_type"] = request_type
    if status:
        query["status"] = status
    
    requests = await db.change_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    return requests


@router.post("/change-requests")
async def create_change_request(
    request_data: ChangeRequestCreate,
    current_user: UserInDB = Depends(require_super_admin)
):
    """Create a change request (for fund collection mode, payment gateway changes)"""
    db = await get_db()
    
    campaign = await db.campaigns.find_one({"id": request_data.campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # For fund collection mode change, check prerequisites
    if request_data.request_type == ChangeRequestType.FUND_COLLECTION_MODE:
        if campaign.get("fund_collection_mode") == FundCollectionMode.KAIZEN_MANAGED:
            # Check if all funds are settled
            collected = campaign.get("total_revenue", 0)
            transferred = campaign.get("total_transferred", 0)
            platform_fee = collected * PLATFORM_FEE_PERCENTAGE
            net_payable = collected - platform_fee
            pending = net_payable - transferred
            
            if pending > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot change fund collection mode. Pending transfer: ₹{pending:.2f}. Please complete all transfers first."
                )
            
            # Check for pending transfer requests
            pending_requests = await db.fund_transfers.count_documents({
                "campaign_id": request_data.campaign_id,
                "status": {"$in": [TransferStatus.PENDING_APPROVAL, TransferStatus.APPROVED]}
            })
            if pending_requests > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot change fund collection mode. There are pending transfer requests."
                )
    
    request_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    change_request = {
        "id": request_id,
        "request_number": generate_request_number("CR"),
        "campaign_id": request_data.campaign_id,
        "campaign_name": campaign["name"],
        "organization_name": campaign["organization_name"],
        "request_type": request_data.request_type,
        "current_value": request_data.current_value,
        "new_value": request_data.new_value,
        "reason": request_data.reason,
        "status": ChangeRequestStatus.PENDING,
        "created_by": current_user.id,
        "created_at": now.isoformat()
    }
    
    await db.change_requests.insert_one(change_request)
    
    return {"message": "Change request submitted for approval", "request_id": request_id}


@router.put("/change-requests/{request_id}/approve")
async def approve_change_request(
    request_id: str,
    action: ApprovalAction,
    current_user: UserInDB = Depends(require_approver)
):
    """Approve a change request (Director only)"""
    db = await get_db()
    
    change_request = await db.change_requests.find_one({"id": request_id}, {"_id": 0})
    if not change_request:
        raise HTTPException(status_code=404, detail="Change request not found")
    
    if change_request["status"] != ChangeRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request is not pending approval")
    
    now = datetime.now(timezone.utc)
    
    # Apply the change based on request type
    if change_request["request_type"] == ChangeRequestType.BANK_ACCOUNT:
        new_value = change_request["new_value"]
        
        if change_request["current_value"] is None:
            # New bank account
            bank_account_doc = {
                "id": str(uuid.uuid4()),
                "campaign_id": change_request["campaign_id"],
                "account_name": new_value["account_name"],
                "account_number": new_value["account_number"],
                "account_number_masked": new_value["account_number_masked"],
                "ifsc_code": new_value["ifsc_code"],
                "bank_name": new_value["bank_name"],
                "notification_email": new_value["notification_email"],
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": change_request["created_by"]
            }
            await db.campaign_bank_accounts.insert_one(bank_account_doc)
        else:
            # Update existing
            await db.campaign_bank_accounts.update_one(
                {"campaign_id": change_request["campaign_id"]},
                {"$set": {**new_value, "updated_at": now.isoformat()}}
            )
    
    elif change_request["request_type"] == ChangeRequestType.FUND_COLLECTION_MODE:
        await db.campaigns.update_one(
            {"id": change_request["campaign_id"]},
            {"$set": {"fund_collection_mode": change_request["new_value"]["fund_collection_mode"]}}
        )
    
    elif change_request["request_type"] == ChangeRequestType.PAYMENT_GATEWAY:
        update_data = {}
        if "payment_gateway" in change_request["new_value"]:
            update_data["payment_gateway"] = change_request["new_value"]["payment_gateway"]
        if "payment_account_id" in change_request["new_value"]:
            update_data["payment_account_id"] = change_request["new_value"]["payment_account_id"]
        
        await db.campaigns.update_one(
            {"id": change_request["campaign_id"]},
            {"$set": update_data}
        )
    
    # Update change request status
    await db.change_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": ChangeRequestStatus.APPROVED,
            "approved_by": current_user.id,
            "approved_at": now.isoformat(),
            "approval_notes": action.notes
        }}
    )
    
    return {"message": "Change request approved and applied"}


@router.put("/change-requests/{request_id}/reject")
async def reject_change_request(
    request_id: str,
    action: RejectionAction,
    current_user: UserInDB = Depends(require_approver)
):
    """Reject a change request (Director only)"""
    db = await get_db()
    
    change_request = await db.change_requests.find_one({"id": request_id}, {"_id": 0})
    if not change_request:
        raise HTTPException(status_code=404, detail="Change request not found")
    
    if change_request["status"] != ChangeRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request is not pending approval")
    
    now = datetime.now(timezone.utc)
    
    await db.change_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": ChangeRequestStatus.REJECTED,
            "rejected_by": current_user.id,
            "rejected_at": now.isoformat(),
            "rejection_reason": action.reason
        }}
    )
    
    return {"message": "Change request rejected"}
