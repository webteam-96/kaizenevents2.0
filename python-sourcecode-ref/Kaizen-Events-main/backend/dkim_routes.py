"""DKIM Domain Registration Routes"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
import asyncio
import resend
import logging

from models import UserInDB, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dkim", tags=["dkim"])
security = HTTPBearer()

# Dependency to get database
async def get_db():
    from server import db
    return db

# Dependency to get current user
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db
    return await get_current_user_with_db(credentials)

# ==================== MODELS ====================

class DKIMDomainCreate(BaseModel):
    domain: str
    resend_api_key: str

class DKIMDomainResponse(BaseModel):
    id: str
    domain: str
    status: str  # 'pending', 'verified', 'failed'
    records: Optional[List[dict]] = None
    created_at: str
    verified_at: Optional[str] = None
    has_api_key: bool = True

class EmailSenderCreate(BaseModel):
    name: str
    email: EmailStr
    dkim_domain_id: str
    is_default: bool = False

class EmailSenderResponse(BaseModel):
    id: str
    name: str
    email: str
    domain: str
    dkim_domain_id: str
    is_default: bool
    is_verified: bool
    created_at: str

# ==================== DKIM DOMAIN ROUTES ====================

@router.get("/test")
async def test_endpoint():
    """Test endpoint to verify routes are working"""
    return {"message": "DKIM routes are working"}

@router.post("/domains", response_model=DKIMDomainResponse)
async def register_dkim_domain(
    domain_data: DKIMDomainCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Register a new DKIM domain with Resend"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Check if domain already exists
    existing = await db.dkim_domains.find_one({"domain": domain_data.domain.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Domain already registered")
    
    try:
        # Initialize Resend with the provided API key
        resend.api_key = domain_data.resend_api_key
        
        # Create domain in Resend
        result = await asyncio.to_thread(
            resend.Domains.create,
            {"name": domain_data.domain.lower()}
        )
        
        domain_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        # Extract DNS records from response
        records = []
        if result.get('records'):
            for record in result['records']:
                records.append({
                    "type": record.get('type', 'TXT'),
                    "name": record.get('name', ''),
                    "value": record.get('value', ''),
                    "priority": record.get('priority')
                })
        
        domain_doc = {
            "id": domain_id,
            "domain": domain_data.domain.lower(),
            "resend_domain_id": result.get('id'),
            "resend_api_key": domain_data.resend_api_key,  # Encrypted in production
            "status": result.get('status', 'pending'),
            "records": records,
            "created_at": now,
            "created_by": current_user.id,
            "verified_at": None
        }
        
        await db.dkim_domains.insert_one(domain_doc)
        
        return DKIMDomainResponse(
            id=domain_id,
            domain=domain_data.domain.lower(),
            status=result.get('status', 'pending'),
            records=records,
            created_at=now,
            has_api_key=True
        )
        
    except Exception as e:
        logger.error(f"Failed to register DKIM domain: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/domains", response_model=List[DKIMDomainResponse])
async def list_dkim_domains(current_user: UserInDB = Depends(get_current_user)):
    """List all registered DKIM domains"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    domains = await db.dkim_domains.find({}, {"_id": 0, "resend_api_key": 0}).to_list(100)
    
    return [
        DKIMDomainResponse(
            id=d["id"],
            domain=d["domain"],
            status=d.get("status", "pending"),
            records=d.get("records", []),
            created_at=d["created_at"],
            verified_at=d.get("verified_at"),
            has_api_key=True
        )
        for d in domains
    ]

@router.get("/domains/{domain_id}", response_model=DKIMDomainResponse)
async def get_dkim_domain(
    domain_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get DKIM domain details"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    domain = await db.dkim_domains.find_one({"id": domain_id}, {"_id": 0, "resend_api_key": 0})
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    
    return DKIMDomainResponse(
        id=domain["id"],
        domain=domain["domain"],
        status=domain.get("status", "pending"),
        records=domain.get("records", []),
        created_at=domain["created_at"],
        verified_at=domain.get("verified_at"),
        has_api_key=True
    )

@router.post("/domains/{domain_id}/verify")
async def verify_dkim_domain(
    domain_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Verify DKIM domain DNS records"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    domain = await db.dkim_domains.find_one({"id": domain_id})
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    
    try:
        resend.api_key = domain["resend_api_key"]
        
        # Verify domain in Resend
        result = await asyncio.to_thread(
            resend.Domains.verify,
            domain["resend_domain_id"]
        )
        
        # Update status
        new_status = result.get('status', 'pending')
        update_data = {"status": new_status}
        
        if new_status == 'verified':
            update_data["verified_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.dkim_domains.update_one(
            {"id": domain_id},
            {"$set": update_data}
        )
        
        return {"status": new_status, "message": f"Domain verification status: {new_status}"}
        
    except Exception as e:
        logger.error(f"Failed to verify domain: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/domains/{domain_id}")
async def delete_dkim_domain(
    domain_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Delete a DKIM domain"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    domain = await db.dkim_domains.find_one({"id": domain_id})
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    
    # Check if any senders are using this domain
    senders_count = await db.email_senders.count_documents({"dkim_domain_id": domain_id})
    if senders_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete domain. {senders_count} email sender(s) are using it."
        )
    
    try:
        # Delete from Resend
        resend.api_key = domain["resend_api_key"]
        await asyncio.to_thread(
            resend.Domains.remove,
            domain["resend_domain_id"]
        )
    except Exception as e:
        logger.warning(f"Failed to delete domain from Resend: {e}")
    
    # Delete from database
    await db.dkim_domains.delete_one({"id": domain_id})
    
    return {"message": "Domain deleted successfully"}

# ==================== EMAIL SENDER ROUTES ====================

@router.post("/senders", response_model=EmailSenderResponse)
async def create_email_sender(
    sender_data: EmailSenderCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Create a new email sender address"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    # Verify domain exists and is verified
    domain = await db.dkim_domains.find_one({"id": sender_data.dkim_domain_id})
    if not domain:
        raise HTTPException(status_code=404, detail="DKIM domain not found")
    
    # Check email matches domain
    email_domain = sender_data.email.split('@')[1].lower()
    if email_domain != domain["domain"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Email domain must match DKIM domain ({domain['domain']})"
        )
    
    # Check if sender email already exists
    existing = await db.email_senders.find_one({"email": sender_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email sender already exists")
    
    sender_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # If this is set as default, unset other defaults
    if sender_data.is_default:
        await db.email_senders.update_many({}, {"$set": {"is_default": False}})
    
    sender_doc = {
        "id": sender_id,
        "name": sender_data.name,
        "email": sender_data.email.lower(),
        "dkim_domain_id": sender_data.dkim_domain_id,
        "domain": domain["domain"],
        "is_default": sender_data.is_default,
        "is_verified": domain.get("status") == "verified",
        "created_at": now,
        "created_by": current_user.id
    }
    
    await db.email_senders.insert_one(sender_doc)
    
    return EmailSenderResponse(**{k: v for k, v in sender_doc.items() if k != "_id"})

@router.get("/senders", response_model=List[EmailSenderResponse])
async def list_email_senders(current_user: UserInDB = Depends(get_current_user)):
    """List all email senders"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    senders = await db.email_senders.find({}, {"_id": 0}).to_list(100)
    
    # Update verification status based on domain status
    for sender in senders:
        domain = await db.dkim_domains.find_one({"id": sender["dkim_domain_id"]})
        sender["is_verified"] = domain.get("status") == "verified" if domain else False
    
    return [EmailSenderResponse(**s) for s in senders]

@router.put("/senders/{sender_id}")
async def update_email_sender(
    sender_id: str,
    sender_data: EmailSenderCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """Update an email sender"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    sender = await db.email_senders.find_one({"id": sender_id})
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")
    
    # If setting as default, unset others
    if sender_data.is_default:
        await db.email_senders.update_many(
            {"id": {"$ne": sender_id}},
            {"$set": {"is_default": False}}
        )
    
    await db.email_senders.update_one(
        {"id": sender_id},
        {"$set": {
            "name": sender_data.name,
            "is_default": sender_data.is_default,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Sender updated successfully"}

@router.delete("/senders/{sender_id}")
async def delete_email_sender(
    sender_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Delete an email sender"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    
    db = await get_db()
    
    result = await db.email_senders.delete_one({"id": sender_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sender not found")
    
    return {"message": "Sender deleted successfully"}
