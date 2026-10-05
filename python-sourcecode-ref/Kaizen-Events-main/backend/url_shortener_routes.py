"""
URL Shortener Service
Creates and manages short URLs for campaign registration and kiosk links.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import secrets
import string
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(tags=["url-shortener"])
logger = logging.getLogger(__name__)


# ==================== Models ====================

class CreateShortUrlRequest(BaseModel):
    """Request to create a short URL"""
    original_url: str
    campaign_id: str
    url_type: str  # "registration" or "kiosk"


class ShortUrlResponse(BaseModel):
    """Response with short URL"""
    short_code: str
    short_url: str
    original_url: str


# ==================== Dependencies ====================

async def get_db():
    from server import db
    return db


# ==================== Helper Functions ====================

def generate_short_code(length: int = 6) -> str:
    """Generate a random short code"""
    chars = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


# ==================== Routes ====================

@router.get("/s/{short_code}")
async def redirect_short_url(
    short_code: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Redirect from short URL to original URL.
    Public endpoint - no authentication required.
    """
    # Find the short URL
    short_url_doc = await db.short_urls.find_one({"short_code": short_code})
    
    if not short_url_doc:
        raise HTTPException(status_code=404, detail="Short URL not found")
    
    # Increment click count
    await db.short_urls.update_one(
        {"short_code": short_code},
        {
            "$inc": {"clicks": 1},
            "$set": {"last_clicked": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Redirect to original URL
    original_url = short_url_doc["original_url"]
    
    # If it's a relative URL, redirect directly
    if original_url.startswith("/"):
        return RedirectResponse(url=original_url, status_code=302)
    
    return RedirectResponse(url=original_url, status_code=302)


@router.post("/api/short-urls", response_model=ShortUrlResponse)
async def create_short_url(
    request: CreateShortUrlRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Create a short URL for a campaign link.
    """
    import os
    
    # Check if short URL already exists for this campaign and type
    existing = await db.short_urls.find_one({
        "campaign_id": request.campaign_id,
        "url_type": request.url_type
    })
    
    if existing:
        # Return existing short URL
        base_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        if not base_url:
            # Try to construct from request
            base_url = request.original_url.split("/register")[0].split("/kiosk")[0]
        
        return ShortUrlResponse(
            short_code=existing["short_code"],
            short_url=f"{base_url}/s/{existing['short_code']}",
            original_url=existing["original_url"]
        )
    
    # Generate unique short code
    max_attempts = 10
    short_code = None
    
    for _ in range(max_attempts):
        candidate = generate_short_code()
        exists = await db.short_urls.find_one({"short_code": candidate})
        if not exists:
            short_code = candidate
            break
    
    if not short_code:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate unique short code"
        )
    
    # Create short URL document
    now = datetime.now(timezone.utc)
    short_url_doc = {
        "short_code": short_code,
        "original_url": request.original_url,
        "campaign_id": request.campaign_id,
        "url_type": request.url_type,
        "clicks": 0,
        "created_at": now.isoformat(),
        "last_clicked": None
    }
    
    await db.short_urls.insert_one(short_url_doc)
    
    # Build full short URL
    base_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not base_url:
        base_url = request.original_url.split("/register")[0].split("/kiosk")[0]
    
    logger.info(f"Short URL created: {short_code} -> {request.original_url}")
    
    return ShortUrlResponse(
        short_code=short_code,
        short_url=f"{base_url}/s/{short_code}",
        original_url=request.original_url
    )


@router.get("/api/short-urls/campaign/{campaign_id}")
async def get_campaign_short_urls(
    campaign_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get all short URLs for a campaign.
    """
    import os
    
    short_urls = await db.short_urls.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).to_list(10)
    
    base_url = os.environ.get("FRONTEND_URL", "")
    
    result = {}
    for url in short_urls:
        url_type = url.get("url_type")
        result[url_type] = {
            "short_code": url["short_code"],
            "short_url": f"{base_url}/s/{url['short_code']}" if base_url else f"/s/{url['short_code']}",
            "original_url": url["original_url"],
            "clicks": url.get("clicks", 0)
        }
    
    return result
