from fastapi import APIRouter, HTTPException, Depends, status, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List
from datetime import datetime, timezone, timedelta
import csv
import io
from collections import defaultdict

from models import UserInDB, UserRole
from analytics_models import RegistrationAnalytics, EmailSendRequest
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/api", tags=["analytics"])
security = HTTPBearer()

async def get_db():
    from server import db
    return db

async def get_current_user_with_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db as get_user
    return await get_user(credentials)

@router.get("/campaigns/{campaign_id}/analytics", response_model=RegistrationAnalytics)
async def get_campaign_analytics(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get analytics for a campaign"""
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get all registrations
    registrations = await db.registrations.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(10000)
    
    total_registrations = len(registrations)
    paid_registrations = sum(1 for r in registrations if r.get("payment_status") == "completed")
    pending_registrations = sum(1 for r in registrations if r.get("payment_status") == "pending")
    failed_registrations = sum(1 for r in registrations if r.get("payment_status") == "failed")
    
    total_revenue = sum(r.get("total_amount", 0) for r in registrations if r.get("payment_status") == "completed")
    average_registration_value = total_revenue / paid_registrations if paid_registrations > 0 else 0
    
    # Get failed payments with details
    failed_payments = [
        {
            "id": r.get("id"),
            "name": r.get("form_data", {}).get("name", "Unknown"),
            "email": r.get("form_data", {}).get("email", ""),
            "phone": r.get("form_data", {}).get("phone", ""),
            "amount": r.get("total_amount", 0),
            "created_at": r.get("created_at"),
            "gateway": r.get("payment_gateway", "unknown")
        }
        for r in registrations if r.get("payment_status") == "failed"
    ]
    
    # Group by date
    registrations_by_date = defaultdict(int)
    for r in registrations:
        try:
            date = datetime.fromisoformat(r["created_at"]).date()
            registrations_by_date[date.isoformat()] += 1
        except:
            pass
    
    registration_by_date = [
        {"date": date, "count": count}
        for date, count in sorted(registrations_by_date.items())
    ]
    
    return {
        "total_registrations": total_registrations,
        "paid_registrations": paid_registrations,
        "pending_registrations": pending_registrations,
        "failed_registrations": failed_registrations,
        "total_revenue": total_revenue,
        "average_registration_value": average_registration_value,
        "registration_by_date": registration_by_date,
        "failed_payments": failed_payments,
        "top_registration_sources": []
    }

@router.get("/campaigns/{campaign_id}/export/csv")
async def export_registrations_csv(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Export registrations as CSV"""
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    registrations = await db.registrations.find({"campaign_id": campaign_id}).to_list(10000)
    
    if not registrations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registrations found"
        )
    
    # Create CSV
    output = io.StringIO()
    
    # Get all form field keys
    all_keys = set()
    for r in registrations:
        all_keys.update(r.get("form_data", {}).keys())
    
    fieldnames = [
        "Registration ID",
        "Invoice Number",
        "Payment Status",
        "Registration Status",
        "Total Amount",
        "Payment ID",
        "Created At"
    ] + sorted(list(all_keys))
    
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for r in registrations:
        row = {
            "Registration ID": r["id"],
            "Invoice Number": r.get("invoice_number", ""),
            "Payment Status": r["payment_status"],
            "Registration Status": r["registration_status"],
            "Total Amount": r["total_amount"],
            "Payment ID": r.get("payment_id", ""),
            "Created At": r["created_at"]
        }
        
        # Add form data
        form_data = r.get("form_data", {})
        for key in all_keys:
            row[key] = form_data.get(key, "")
        
        writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=registrations_{campaign_id}.csv"
        }
    )

@router.post("/registrations/{registration_id}/resend-receipt")
async def resend_receipt(
    registration_id: str,
    email_request: EmailSendRequest,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Resend receipt email (mocked for now)"""
    registration = await db.registrations.find_one({"id": registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    if registration["payment_status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment not completed"
        )
    
    # Mock email sending
    # In production, integrate with Sendinblue here
    
    return {
        "status": "success",
        "message": "Receipt email sent successfully",
        "email": registration.get("form_data", {}).get("email", "N/A")
    }

@router.post("/registrations/{registration_id}/send-whatsapp")
async def send_whatsapp_notification(
    registration_id: str,
    current_user: UserInDB = Depends(get_current_user_with_db),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Send WhatsApp notification (mocked)"""
    registration = await db.registrations.find_one({"id": registration_id})
    
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found"
        )
    
    # Mock WhatsApp sending via Interakt
    # In production, integrate with Interakt API here
    
    return {
        "status": "success",
        "message": "WhatsApp notification sent successfully (MOCKED)",
        "phone": registration.get("form_data", {}).get("phone", "N/A")
    }
