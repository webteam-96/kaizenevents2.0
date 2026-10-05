"""Campaign Members Routes - Endpoints for Closed Group Campaign Member Management"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import io
import csv
import logging

from models import UserInDB, UserRole
from campaign_member_models import (
    CampaignMemberCreate, CampaignMemberUpdate, CampaignMemberResponse,
    MemberStatus, MemberListResponse, UploadPreview, UploadResult,
    ColumnMapping, ReminderRequest, ReminderResult, SingleReminderRequest
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/campaigns", tags=["campaign-members"])
security = HTTPBearer()

# Dependency to get database
async def get_db():
    from server import db
    return db

# Dependency to get current user
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db
    return await get_current_user_with_db(credentials)


# ==================== FILE UPLOAD ENDPOINTS ====================

@router.post("/{campaign_id}/members/upload/preview")
async def preview_upload(
    campaign_id: str,
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Preview an uploaded CSV/Excel file before processing.
    Returns column names and sample rows for mapping.
    """
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Verify campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Read file content
    content = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith('.csv'):
            rows = parse_csv(content)
        elif filename.endswith(('.xlsx', '.xls')):
            rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")
        
        if not rows:
            raise HTTPException(status_code=400, detail="File is empty")
        
        columns = list(rows[0].keys())
        sample_rows = rows[:5]  # First 5 rows for preview
        
        return {
            "columns": columns,
            "sample_rows": sample_rows,
            "total_rows": len(rows)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing file: {e}")
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")


@router.post("/{campaign_id}/members/upload")
async def upload_members(
    campaign_id: str,
    file: UploadFile = File(...),
    name_column: str = Query(..., description="Column name for member name"),
    mobile_column: str = Query(..., description="Column name for mobile number"),
    email_column: Optional[str] = Query(None, description="Column name for email"),
    custom_columns: Optional[str] = Query(None, description="JSON string of custom column mappings"),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Upload members from CSV/Excel file with column mapping.
    Handles duplicates and returns error list.
    """
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Verify campaign exists and is closed group type
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign.get("campaign_type") != "closed_group":
        raise HTTPException(status_code=400, detail="This campaign is not a closed group campaign")
    
    # Parse custom columns if provided
    custom_col_map = {}
    if custom_columns:
        import json
        try:
            custom_col_map = json.loads(custom_columns)
        except (json.JSONDecodeError, TypeError):
            pass
    
    # Read and parse file
    content = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith('.csv'):
            rows = parse_csv(content)
        elif filename.endswith(('.xlsx', '.xls')):
            rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
        
        if not rows:
            raise HTTPException(status_code=400, detail="File is empty")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
    
    # Process rows
    added = 0
    skipped = 0
    errors = []
    now = datetime.now(timezone.utc)
    
    # Get existing members for duplicate check
    existing_mobiles = set()
    async for member in db.campaign_members.find({"campaign_id": campaign_id}, {"mobile": 1}):
        existing_mobiles.add(normalize_mobile(member.get("mobile", "")))
    
    # Track duplicates within the file
    file_mobiles = {}
    
    for idx, row in enumerate(rows, start=2):  # Start at 2 (1 is header)
        try:
            name = str(row.get(name_column, "")).strip()
            mobile = str(row.get(mobile_column, "")).strip()
            email = str(row.get(email_column, "")).strip() if email_column else None
            
            # Validate required fields
            if not name:
                errors.append({"row": idx, "error": "Name is required", "data": row})
                continue
            
            if not mobile:
                errors.append({"row": idx, "error": "Mobile number is required", "data": row})
                continue
            
            normalized_mobile = normalize_mobile(mobile)
            
            # Check for duplicates in file
            if normalized_mobile in file_mobiles:
                errors.append({
                    "row": idx, 
                    "error": f"Duplicate mobile number (same as row {file_mobiles[normalized_mobile]})", 
                    "data": row
                })
                continue
            
            file_mobiles[normalized_mobile] = idx
            
            # Check for existing member
            if normalized_mobile in existing_mobiles:
                skipped += 1
                continue
            
            # Build custom fields
            custom_fields = {}
            for field_name, col_name in custom_col_map.items():
                if col_name in row:
                    custom_fields[field_name] = str(row[col_name]).strip()
            
            # Create member
            member_doc = {
                "id": str(uuid.uuid4()),
                "campaign_id": campaign_id,
                "name": name,
                "mobile": mobile,
                "email": email if email else None,
                "custom_fields": custom_fields,
                "status": "unregistered",
                "registration_id": None,
                "registered_at": None,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": current_user.id
            }
            
            await db.campaign_members.insert_one(member_doc)
            existing_mobiles.add(normalized_mobile)
            added += 1
            
        except Exception as e:
            errors.append({"row": idx, "error": str(e), "data": row})
    
    # Save field mapping to campaign config
    field_mapping = {
        "name_column": name_column,
        "mobile_column": mobile_column,
        "email_column": email_column,
        "custom_columns": custom_col_map
    }
    
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "closed_group_config.field_mapping": field_mapping,
            "updated_at": now.isoformat()
        }}
    )
    
    return {
        "success": True,
        "total_rows": len(rows),
        "added": added,
        "skipped": skipped,
        "errors": len(errors),
        "error_details": errors[:100]  # Limit error details
    }


@router.get("/{campaign_id}/members/upload/errors")
async def download_error_list(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Download the last upload's error list as CSV"""
    # This would need to store errors in session/cache
    # For now, errors are returned in the upload response
    raise HTTPException(status_code=501, detail="Use error_details from upload response")


# ==================== MEMBER CRUD ENDPOINTS ====================

@router.get("/{campaign_id}/members", response_model=MemberListResponse)
async def list_members(
    campaign_id: str,
    status: Optional[MemberStatus] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    List campaign members with pagination and filters.
    Optimized for large datasets (10k+ members).
    """
    if current_user.role != UserRole.SUPER_ADMIN and campaign_id not in current_user.campaign_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = await get_db()
    
    # Build query
    query = {"campaign_id": campaign_id}
    
    if status:
        query["status"] = status.value
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"mobile": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    # Get counts
    total = await db.campaign_members.count_documents(query)
    registered_count = await db.campaign_members.count_documents({
        "campaign_id": campaign_id, "status": "registered"
    })
    unregistered_count = await db.campaign_members.count_documents({
        "campaign_id": campaign_id, "status": "unregistered"
    })
    
    # Calculate pagination
    skip = (page - 1) * page_size
    total_pages = (total + page_size - 1) // page_size
    
    # Fetch members
    cursor = db.campaign_members.find(query, {"_id": 0}).skip(skip).limit(page_size).sort("name", 1)
    members = await cursor.to_list(page_size)
    
    return {
        "members": members,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "registered_count": registered_count,
        "unregistered_count": unregistered_count
    }


@router.post("/{campaign_id}/members")
async def add_member(
    campaign_id: str,
    member: CampaignMemberCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Add a single member manually"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Verify campaign
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign.get("campaign_type") != "closed_group":
        raise HTTPException(status_code=400, detail="This campaign is not a closed group campaign")
    
    # Check for duplicate mobile
    normalized_mobile = normalize_mobile(member.mobile)
    existing = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "mobile": {"$regex": f"^{normalized_mobile[-10:]}"}  # Match last 10 digits
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="A member with this mobile number already exists")
    
    now = datetime.now(timezone.utc)
    
    member_doc = {
        "id": str(uuid.uuid4()),
        "campaign_id": campaign_id,
        "name": member.name,
        "mobile": member.mobile,
        "email": member.email,
        "custom_fields": member.custom_fields,
        "status": "unregistered",
        "registration_id": None,
        "registered_at": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": current_user.id
    }
    
    await db.campaign_members.insert_one(member_doc)
    
    return {"success": True, "member": member_doc}


@router.put("/{campaign_id}/members/{member_id}")
async def update_member(
    campaign_id: str,
    member_id: str,
    update: CampaignMemberUpdate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Update a member's details"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Check if member exists
    member = await db.campaign_members.find_one({
        "id": member_id, "campaign_id": campaign_id
    })
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Check if already registered
    if member.get("status") == "registered":
        raise HTTPException(status_code=400, detail="Cannot modify a registered member")
    
    # Build update
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if update.name is not None:
        update_data["name"] = update.name
    if update.mobile is not None:
        # Check for duplicate
        normalized = normalize_mobile(update.mobile)
        existing = await db.campaign_members.find_one({
            "campaign_id": campaign_id,
            "id": {"$ne": member_id},
            "mobile": {"$regex": f"{normalized[-10:]}"}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Mobile number already exists")
        update_data["mobile"] = update.mobile
    if update.email is not None:
        update_data["email"] = update.email
    if update.custom_fields is not None:
        update_data["custom_fields"] = update.custom_fields
    
    await db.campaign_members.update_one(
        {"id": member_id},
        {"$set": update_data}
    )
    
    return {"success": True, "message": "Member updated"}


@router.delete("/{campaign_id}/members/{member_id}")
async def delete_member(
    campaign_id: str,
    member_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Delete a member"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Check if member exists
    member = await db.campaign_members.find_one({
        "id": member_id, "campaign_id": campaign_id
    })
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Check if already registered
    if member.get("status") == "registered":
        raise HTTPException(status_code=400, detail="Cannot delete a registered member")
    
    await db.campaign_members.delete_one({"id": member_id})
    
    return {"success": True, "message": "Member deleted"}


# ==================== REMINDER ENDPOINTS ====================

@router.post("/{campaign_id}/members/reminders")
async def send_reminders(
    campaign_id: str,
    request: ReminderRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send reminders to unregistered members"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Get campaign
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Build query for members
    query = {"campaign_id": campaign_id, "status": "unregistered"}
    
    if request.member_ids:
        query["id"] = {"$in": request.member_ids}
    
    members = await db.campaign_members.find(query, {"_id": 0}).to_list(10000)
    
    if not members:
        return {
            "total": 0,
            "email_sent": 0,
            "email_failed": 0,
            "whatsapp_sent": 0,
            "whatsapp_failed": 0,
            "errors": []
        }
    
    # Send reminders
    from integration_service import brevo_service, interakt_service
    
    email_sent = 0
    email_failed = 0
    whatsapp_sent = 0
    whatsapp_failed = 0
    errors = []
    
    for member in members:
        # Send email reminder
        if "email" in request.channels and member.get("email"):
            try:
                if brevo_service.is_configured():
                    result = await brevo_service.send_email(
                        to_email=member["email"],
                        to_name=member["name"],
                        subject=f"Reminder: Register for {campaign['name']}",
                        html_content=generate_reminder_email(member, campaign)
                    )
                    if result["success"]:
                        email_sent += 1
                    else:
                        email_failed += 1
                        errors.append({"member_id": member["id"], "channel": "email", "error": result.get("error")})
            except Exception as e:
                email_failed += 1
                errors.append({"member_id": member["id"], "channel": "email", "error": str(e)})
        
        # Send WhatsApp reminder
        if "whatsapp" in request.channels and member.get("mobile"):
            try:
                if interakt_service.is_configured():
                    result = await interakt_service.send_payment_reminder(
                        phone_number=member["mobile"],
                        name=member["name"],
                        event_name=campaign["name"],
                        amount=campaign.get("payment_config", {}).get("base_amount", 0)
                    )
                    if result["success"]:
                        whatsapp_sent += 1
                    else:
                        whatsapp_failed += 1
                        errors.append({"member_id": member["id"], "channel": "whatsapp", "error": result.get("error")})
            except Exception as e:
                whatsapp_failed += 1
                errors.append({"member_id": member["id"], "channel": "whatsapp", "error": str(e)})
        
        # Update last_reminder_at timestamp
        await db.campaign_members.update_one(
            {"id": member["id"]},
            {"$set": {
                "last_reminder_at": datetime.now(timezone.utc).isoformat(),
                "reminder_count": (member.get("reminder_count") or 0) + 1
            }}
        )
    
    return {
        "total": len(members),
        "email_sent": email_sent,
        "email_failed": email_failed,
        "whatsapp_sent": whatsapp_sent,
        "whatsapp_failed": whatsapp_failed,
        "errors": errors[:50]  # Limit errors returned
    }


@router.post("/{campaign_id}/members/{member_id}/reminder")
async def send_individual_reminder(
    campaign_id: str,
    member_id: str,
    request: SingleReminderRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Send reminder to a specific member"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Get campaign
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get specific member
    member = await db.campaign_members.find_one({
        "id": member_id, 
        "campaign_id": campaign_id
    }, {"_id": 0})
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if member.get("status") == "registered":
        raise HTTPException(status_code=400, detail="Member has already registered")
    
    # Send reminders
    from integration_service import brevo_service, interakt_service
    
    results = {
        "member_id": member_id,
        "email_sent": False,
        "whatsapp_sent": False,
        "errors": []
    }
    
    # Send email reminder
    if "email" in request.channels and member.get("email"):
        try:
            if brevo_service.is_configured():
                result = await brevo_service.send_email(
                    to_email=member["email"],
                    to_name=member["name"],
                    subject=f"Reminder: Register for {campaign['name']}",
                    html_content=generate_reminder_email(member, campaign)
                )
                results["email_sent"] = result.get("success", False)
                if not result.get("success"):
                    results["errors"].append({"channel": "email", "error": result.get("error")})
            else:
                results["errors"].append({"channel": "email", "error": "Brevo not configured"})
        except Exception as e:
            results["errors"].append({"channel": "email", "error": str(e)})
    
    # Send WhatsApp reminder
    if "whatsapp" in request.channels and member.get("mobile"):
        try:
            if interakt_service.is_configured():
                result = await interakt_service.send_payment_reminder(
                    phone_number=member["mobile"],
                    name=member["name"],
                    event_name=campaign["name"],
                    amount=campaign.get("payment_config", {}).get("base_amount", 0)
                )
                results["whatsapp_sent"] = result.get("success", False)
                if not result.get("success"):
                    results["errors"].append({"channel": "whatsapp", "error": result.get("error")})
            else:
                results["errors"].append({"channel": "whatsapp", "error": "Interakt not configured"})
        except Exception as e:
            results["errors"].append({"channel": "whatsapp", "error": str(e)})
    
    # Update last_reminder_at timestamp
    await db.campaign_members.update_one(
        {"id": member_id},
        {"$set": {
            "last_reminder_at": datetime.now(timezone.utc).isoformat(),
            "reminder_count": (member.get("reminder_count") or 0) + 1
        }}
    )
    
    return results


# ==================== PUBLIC ENDPOINTS ====================

@router.get("/{campaign_id}/members/public")
async def get_public_member_list(
    campaign_id: str,
    search: Optional[str] = None
):
    """
    Get member list for public registration form.
    Returns minimal data with registration status.
    """
    from server import db
    
    # Verify campaign is closed group and active
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign.get("campaign_type") != "closed_group":
        raise HTTPException(status_code=400, detail="Not a closed group campaign")
    
    if campaign.get("status") != "active":
        raise HTTPException(status_code=400, detail="Campaign is not active")
    
    # Build query
    query = {"campaign_id": campaign_id}
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"mobile": {"$regex": search, "$options": "i"}}
        ]
    
    # Get members with limited fields
    cursor = db.campaign_members.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "mobile": 1, "email": 1, "custom_fields": 1, "status": 1}
    ).sort("name", 1).limit(100)  # Limit for search
    
    members = await cursor.to_list(100)
    
    # Mask sensitive data
    for member in members:
        if member.get("mobile"):
            mobile = member["mobile"]
            member["mobile_masked"] = f"****{mobile[-4:]}" if len(mobile) >= 4 else "****"
        if member.get("email"):
            email = member["email"]
            at_idx = email.find("@")
            if at_idx > 2:
                member["email_masked"] = f"{email[:2]}***{email[at_idx:]}"
            else:
                member["email_masked"] = "***"
    
    return {"members": members, "total": len(members)}


@router.get("/{campaign_id}/members/{member_id}/verify")
async def verify_member_for_registration(
    campaign_id: str,
    member_id: str
):
    """
    Verify a member can register and return their prefilled data.
    Used by public registration form.
    """
    from server import db
    
    member = await db.campaign_members.find_one(
        {"id": member_id, "campaign_id": campaign_id},
        {"_id": 0}
    )
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if member.get("status") == "registered":
        raise HTTPException(status_code=400, detail="Already registered")
    
    # Return prefill data
    return {
        "can_register": True,
        "prefill_data": {
            "member_id": member["id"],
            "name": member["name"],
            "mobile": member["mobile"],
            "email": member.get("email"),
            **member.get("custom_fields", {})
        }
    }


# ==================== HELPER FUNCTIONS ====================

def parse_csv(content: bytes) -> List[dict]:
    """Parse CSV content into list of dicts"""
    text = content.decode('utf-8-sig')  # Handle BOM
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def parse_excel(content: bytes) -> List[dict]:
    """Parse Excel content into list of dicts"""
    try:
        import openpyxl
        from io import BytesIO
        
        wb = openpyxl.load_workbook(BytesIO(content), read_only=True)
        ws = wb.active
        
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        
        headers = [str(h).strip() if h else f"Column_{i}" for i, h in enumerate(rows[0])]
        
        result = []
        for row in rows[1:]:
            row_dict = {}
            for i, value in enumerate(row):
                if i < len(headers):
                    row_dict[headers[i]] = value if value is not None else ""
            if any(row_dict.values()):  # Skip empty rows
                result.append(row_dict)
        
        return result
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Excel support not installed. Use CSV format.")


def normalize_mobile(mobile: str) -> str:
    """Normalize mobile number for comparison"""
    # Remove all non-digit characters
    digits = ''.join(filter(str.isdigit, str(mobile)))
    # Return last 10 digits (standard mobile number length)
    return digits[-10:] if len(digits) >= 10 else digits


def generate_reminder_email(member: dict, campaign: dict) -> str:
    """Generate HTML email for registration reminder"""
    # Get the registration URL
    slug = campaign.get("slug", campaign["id"])
    registration_url = f"https://kaizenevents.com/register/{slug}"
    
    return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
    <table style="width:100%;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
        <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#14b8a6);padding:32px;text-align:center;">
                <h1 style="color:#fff;margin:0;">Registration Reminder</h1>
            </td>
        </tr>
        <tr>
            <td style="padding:32px;">
                <p style="font-size:16px;color:#333;">Dear <strong>{member["name"]}</strong>,</p>
                <p style="font-size:16px;color:#555;line-height:1.6;">
                    This is a friendly reminder that you haven't yet completed your registration for 
                    <strong>{campaign["name"]}</strong>.
                </p>
                <p style="font-size:16px;color:#555;">
                    Please complete your registration at your earliest convenience to secure your spot.
                </p>
                <div style="text-align:center;margin:32px 0;">
                    <a href="{registration_url}" style="background:#7c3aed;color:#fff;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
                        Register Now
                    </a>
                </div>
                <p style="font-size:14px;color:#888;text-align:center;">
                    If the button doesn't work, copy this link:<br/>
                    <a href="{registration_url}" style="color:#7c3aed;">{registration_url}</a>
                </p>
            </td>
        </tr>
        <tr>
            <td style="background:#f8f9fa;padding:16px;text-align:center;font-size:12px;color:#888;">
                © {datetime.now().year} {campaign.get("organization_name", "Kaizen Events")}
            </td>
        </tr>
    </table>
</body>
</html>'''
