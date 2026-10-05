"""Activity Log Routes - Endpoints for viewing change history"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import logging

from models import UserInDB, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/activity-logs", tags=["activity-logs"])
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

class ActivityLogEntry(BaseModel):
    id: str
    timestamp: str
    event_type: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    action_details: Optional[Dict[str, Any]] = None
    status: str = "success"
    ip_address: Optional[str] = None

class ActivityLogResponse(BaseModel):
    logs: List[ActivityLogEntry]
    total: int
    page: int
    page_size: int
    has_more: bool


# ==================== ROUTES ====================

@router.get("", response_model=ActivityLogResponse)
async def get_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=100),
    event_type: Optional[str] = None,
    resource_type: Optional[str] = None,
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get activity logs with filtering.
    Only accessible by Directors (can_approve_transfers) and Super Admins.
    """
    # Check if user is Director or Super Admin
    is_director = current_user.can_approve_transfers
    is_super_admin = current_user.role == UserRole.SUPER_ADMIN
    
    if not is_director and not is_super_admin:
        raise HTTPException(
            status_code=403,
            detail="Only Directors and Super Admins can view activity logs"
        )
    
    db = await get_db()
    
    # Build query
    query = {}
    
    if event_type:
        query["event_type"] = event_type
    
    if resource_type:
        query["resource_type"] = resource_type
    
    if user_id:
        query["user_id"] = user_id
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query["timestamp"] = {"$gte": start_dt.isoformat()}
        except ValueError:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "timestamp" in query:
                query["timestamp"]["$lte"] = end_dt.isoformat()
            else:
                query["timestamp"] = {"$lte": end_dt.isoformat()}
        except ValueError:
            pass
    
    # Get total count
    total = await db.audit_logs.count_documents(query)
    
    # Get paginated results
    skip = (page - 1) * page_size
    logs = await db.audit_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Enrich logs with user names and resource names
    enriched_logs = []
    for log in logs:
        enriched = {
            "id": log.get("integrity_hash", log.get("id", "")),
            "timestamp": log.get("timestamp", ""),
            "event_type": log.get("event_type", ""),
            "user_id": log.get("user_id"),
            "user_email": log.get("user_email"),
            "user_name": None,
            "resource_type": log.get("resource_type"),
            "resource_id": log.get("resource_id"),
            "resource_name": None,
            "action_details": log.get("action_details"),
            "status": log.get("status", "success"),
            "ip_address": log.get("ip_address")
        }
        
        # Try to get user name
        if enriched["user_id"]:
            user = await db.users.find_one({"id": enriched["user_id"]}, {"name": 1, "email": 1})
            if user:
                enriched["user_name"] = user.get("name", user.get("email", "Unknown"))
        
        # Try to get resource name based on type
        if enriched["resource_type"] and enriched["resource_id"]:
            if enriched["resource_type"] == "campaign":
                resource = await db.campaigns.find_one({"id": enriched["resource_id"]}, {"name": 1})
                if resource:
                    enriched["resource_name"] = resource.get("name")
            elif enriched["resource_type"] == "user":
                resource = await db.users.find_one({"id": enriched["resource_id"]}, {"name": 1, "email": 1})
                if resource:
                    enriched["resource_name"] = resource.get("name", resource.get("email"))
            elif enriched["resource_type"] == "fund_transfer":
                resource = await db.fund_transfers.find_one({"id": enriched["resource_id"]}, {"id": 1})
                if resource:
                    enriched["resource_name"] = f"Transfer #{enriched['resource_id'][:8].upper()}"
        
        enriched_logs.append(ActivityLogEntry(**enriched))
    
    return ActivityLogResponse(
        logs=enriched_logs,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(skip + len(logs)) < total
    )


@router.get("/entity/{entity_type}/{entity_id}")
async def get_entity_history(
    entity_type: str,
    entity_id: str,
    limit: int = Query(50, ge=10, le=200),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get change history for a specific entity (campaign, user, fund_transfer).
    Directors and Super Admins can view any entity.
    Org Admins can only view campaigns they have access to.
    """
    # Validate entity type
    valid_types = ["campaign", "user", "fund_transfer", "payment", "registration"]
    if entity_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid entity type. Must be one of: {', '.join(valid_types)}"
        )
    
    # Check access permissions
    is_director = current_user.can_approve_transfers
    is_super_admin = current_user.role == UserRole.SUPER_ADMIN
    
    if not is_director and not is_super_admin:
        # Org admins can only view campaigns they have access to
        if entity_type == "campaign":
            if entity_id not in current_user.campaign_access:
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            raise HTTPException(
                status_code=403,
                detail="Only Directors and Super Admins can view this history"
            )
    
    db = await get_db()
    
    # Get entity info for display
    entity_name = None
    if entity_type == "campaign":
        entity = await db.campaigns.find_one({"id": entity_id}, {"name": 1})
        if entity:
            entity_name = entity.get("name")
    elif entity_type == "user":
        entity = await db.users.find_one({"id": entity_id}, {"name": 1, "email": 1})
        if entity:
            entity_name = entity.get("name", entity.get("email"))
    elif entity_type == "fund_transfer":
        entity_name = f"Transfer #{entity_id[:8].upper()}"
    
    # Query logs for this entity
    logs = await db.audit_logs.find(
        {
            "resource_type": entity_type,
            "resource_id": entity_id
        },
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Enrich with user names
    enriched_logs = []
    for log in logs:
        user_name = None
        if log.get("user_id"):
            user = await db.users.find_one({"id": log["user_id"]}, {"name": 1, "email": 1})
            if user:
                user_name = user.get("name", user.get("email", "Unknown"))
        
        enriched_logs.append({
            "id": log.get("integrity_hash", log.get("id", "")),
            "timestamp": log.get("timestamp", ""),
            "event_type": log.get("event_type", ""),
            "user_id": log.get("user_id"),
            "user_email": log.get("user_email"),
            "user_name": user_name,
            "action_details": log.get("action_details"),
            "status": log.get("status", "success"),
            "ip_address": log.get("ip_address")
        })
    
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "history": enriched_logs,
        "total": len(enriched_logs)
    }


@router.get("/event-types")
async def get_event_types(
    current_user: UserInDB = Depends(get_current_user)
):
    """Get list of distinct event types for filtering"""
    is_director = current_user.can_approve_transfers
    is_super_admin = current_user.role == UserRole.SUPER_ADMIN
    
    if not is_director and not is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = await get_db()
    
    event_types = await db.audit_logs.distinct("event_type")
    
    return {"event_types": sorted(event_types)}


@router.get("/stats")
async def get_activity_stats(
    days: int = Query(7, ge=1, le=90),
    current_user: UserInDB = Depends(get_current_user)
):
    """Get activity statistics for dashboard"""
    is_director = current_user.can_approve_transfers
    is_super_admin = current_user.role == UserRole.SUPER_ADMIN
    
    if not is_director and not is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = await get_db()
    
    # Get date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)
    
    # Count by event type
    pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": start_date.isoformat()}
            }
        },
        {
            "$group": {
                "_id": "$event_type",
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"count": -1}}
    ]
    
    event_counts = await db.audit_logs.aggregate(pipeline).to_list(100)
    
    # Count by user
    user_pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": start_date.isoformat()},
                "user_id": {"$ne": None}
            }
        },
        {
            "$group": {
                "_id": "$user_id",
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    
    user_counts = await db.audit_logs.aggregate(user_pipeline).to_list(10)
    
    # Enrich user data
    enriched_user_counts = []
    for uc in user_counts:
        user = await db.users.find_one({"id": uc["_id"]}, {"name": 1, "email": 1})
        enriched_user_counts.append({
            "user_id": uc["_id"],
            "user_name": user.get("name", user.get("email", "Unknown")) if user else "Unknown",
            "count": uc["count"]
        })
    
    # Total count
    total = await db.audit_logs.count_documents({
        "timestamp": {"$gte": start_date.isoformat()}
    })
    
    return {
        "period_days": days,
        "total_events": total,
        "by_event_type": [{"event_type": ec["_id"], "count": ec["count"]} for ec in event_counts],
        "by_user": enriched_user_counts
    }
