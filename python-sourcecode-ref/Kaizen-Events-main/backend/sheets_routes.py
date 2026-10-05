"""Google Sheets Integration Routes - Real-time Registration Data Sync"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import os
import uuid
import warnings
import logging
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from auth import get_current_user, require_super_admin
from models import UserInDB, UserRole
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sheets", tags=["google-sheets"])
# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'kaizen_events')]
# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_SHEETS_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_SHEETS_CLIENT_SECRET', '')
REDIRECT_URI = os.environ.get('GOOGLE_SHEETS_REDIRECT_URI', 'https://kioskflow.preview.emergentagent.com/api/sheets/callback')
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]
# ==================== MODELS ====================
class SheetsConfig(BaseModel):
    campaign_id: str
    spreadsheet_id: Optional[str] = None
    sheet_name: Optional[str] = "Registrations"
    auto_sync: bool = True
    include_payment_info: bool = True
    column_mapping: Optional[Dict[str, str]] = None
class SheetsSyncRequest(BaseModel):
    campaign_id: str
    force_full_sync: bool = False
# ==================== HELPER FUNCTIONS ====================
async def get_sheets_credentials(user_id: str, db):
    """Get Google Sheets credentials for a user, auto-refreshing if needed"""
    token_doc = await db.sheets_tokens.find_one({"user_id": user_id}, {"_id": 0})
    if not token_doc:
        return None
    creds = Credentials(
        token=token_doc["access_token"],
        refresh_token=token_doc.get("refresh_token"),
        token_uri=token_doc.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_doc.get("client_id", GOOGLE_CLIENT_ID),
        client_secret=token_doc.get("client_secret", GOOGLE_CLIENT_SECRET)
    )
    # Check if token is expired
    expires_at = token_doc.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expires_at:
            # Refresh token
            try:
                creds.refresh(GoogleRequest())
                # Update stored token
                await db.sheets_tokens.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "access_token": creds.token,
                        "expires_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            except Exception as e:
                logger.error(f"Failed to refresh token: {e}")
                return None
    return creds
async def append_to_sheet(creds, spreadsheet_id: str, sheet_name: str, values: List[List[Any]]):
    """Append rows to a Google Sheet"""
    try:
        service = build('sheets', 'v4', credentials=creds)
        body = {"values": values}
        result = await asyncio.to_thread(
            lambda: service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=f"{sheet_name}!A:Z",
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body=body
            ).execute()
        )
        return {"success": True, "updates": result.get('updates', {})}
    except Exception as e:
        logger.error(f"Failed to append to sheet: {e}")
        return {"success": False, "error": str(e)}
async def sync_registration_to_sheet(registration: Dict, campaign: Dict, config: Dict, user_id: str, db):
    """Sync a single registration to Google Sheet"""
    if not config.get('spreadsheet_id') or not config.get('auto_sync', True):
        return
    creds = await get_sheets_credentials(user_id, db)
    if not creds:
        logger.warning(f"No sheets credentials for user {user_id}")
        return
    user_data = registration.get('user_data', {})
    # Build row data
    row = [
        registration.get('id', '')[:8],
        datetime.fromisoformat(registration.get('created_at', datetime.now(timezone.utc).isoformat())).strftime('%Y-%m-%d %H:%M'),
        user_data.get('name', user_data.get('full_name', '')),
        user_data.get('email', ''),
        user_data.get('phone', user_data.get('mobile', '')),
    ]
    # Add custom fields
    for key, value in user_data.items():
        if key not in ['name', 'full_name', 'email', 'phone', 'mobile']:
            row.append(str(value) if value else '')
    # Add payment info if enabled
    if config.get('include_payment_info', True):
        row.extend([
            registration.get('payment_status', 'pending'),
            str(registration.get('payment_amount', 0)),
            registration.get('payment_id', '')
        ])
    result = await append_to_sheet(
        creds,
        config['spreadsheet_id'],
        config.get('sheet_name', 'Registrations'),
        [row]
    )
    if result['success']:
        logger.info(f"Synced registration {registration.get('id')} to sheet")
    else:
        logger.error(f"Failed to sync registration: {result.get('error')}")
# ==================== ROUTES ====================
@router.get("/auth/login")
async def sheets_login(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Initiate Google Sheets OAuth flow"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400, 
            detail="Google Sheets not configured. Add GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET to .env"
        )
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token"
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )
    auth_url, state = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        include_granted_scopes='true'
    )
    # Store state with user_id and campaign_id
    await db.oauth_states.insert_one({
        "state": state,
        "user_id": current_user.id,
        "campaign_id": campaign_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": datetime.now(timezone.utc).isoformat()  # Add TTL
    })
    return {"auth_url": auth_url}
@router.get("/callback")
async def sheets_callback(code: str, state: str):
    """Handle Google OAuth callback"""
    # Verify state
    state_doc = await db.oauth_states.find_one({"state": state})
    if not state_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    user_id = state_doc["user_id"]
    campaign_id = state_doc.get("campaign_id")
    # Delete used state
    await db.oauth_states.delete_one({"state": state})
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token"
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            flow.fetch_token(code=code)
        creds = flow.credentials
        # Verify required scopes
        required_scopes = {"https://www.googleapis.com/auth/spreadsheets"}
        granted_scopes = set(creds.scopes or [])
        if not required_scopes.issubset(granted_scopes):
            missing = required_scopes - granted_scopes
            raise HTTPException(status_code=400, detail=f"Missing required scopes: {', '.join(missing)}")
        # Store tokens
        await db.sheets_tokens.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "access_token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "expires_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        # Redirect back to campaign settings
        redirect_url = f"/campaigns/{campaign_id}?sheets_connected=true" if campaign_id else "/campaigns"
        return RedirectResponse(url=redirect_url)
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
@router.get("/status")
async def get_sheets_status(current_user: UserInDB = Depends(get_current_user)):
    """Check if Google Sheets is connected for the current user"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    token_doc = await db.sheets_tokens.find_one({"user_id": current_user.id}, {"_id": 0, "access_token": 0, "refresh_token": 0, "client_secret": 0})
    return {
        "connected": token_doc is not None,
        "updated_at": token_doc.get("updated_at") if token_doc else None
    }
@router.delete("/disconnect")
async def disconnect_sheets(current_user: UserInDB = Depends(get_current_user)):
    """Disconnect Google Sheets integration"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    await db.sheets_tokens.delete_one({"user_id": current_user.id})
    return {"message": "Google Sheets disconnected"}
@router.get("/config/{campaign_id}")
async def get_sheets_config(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get Google Sheets configuration for a campaign"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    config = await db.sheets_config.find_one(
        {"campaign_id": campaign_id},
        {"_id": 0}
    )
    if not config:
        return {
            "campaign_id": campaign_id,
            "spreadsheet_id": None,
            "sheet_name": "Registrations",
            "auto_sync": True,
            "include_payment_info": True
        }
    return config
@router.put("/config/{campaign_id}")
async def update_sheets_config(
    campaign_id: str,
    config: SheetsConfig,
    current_user: UserInDB = Depends(get_current_user)
):
    """Update Google Sheets configuration for a campaign"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    # Verify campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    config_dict = config.model_dump()
    config_dict["user_id"] = current_user.id
    config_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.sheets_config.update_one(
        {"campaign_id": campaign_id},
        {"$set": config_dict},
        upsert=True
    )
    return {"message": "Sheets configuration updated"}
@router.post("/sync")
async def sync_to_sheets(
    request: SheetsSyncRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """Manually sync all registrations to Google Sheet"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    # Get credentials
    creds = await get_sheets_credentials(current_user.id, db)
    if not creds:
        raise HTTPException(status_code=400, detail="Google Sheets not connected. Please connect first.")
    # Get config
    config = await db.sheets_config.find_one(
        {"campaign_id": request.campaign_id},
        {"_id": 0}
    )
    if not config or not config.get('spreadsheet_id'):
        raise HTTPException(status_code=400, detail="Spreadsheet ID not configured")
    # Get all registrations
    registrations = await db.registrations.find(
        {"campaign_id": request.campaign_id},
        {"_id": 0}
    ).to_list(10000)
    if not registrations:
        return {"message": "No registrations to sync", "count": 0}
    # Build header row
    header = ["ID", "Date", "Name", "Email", "Phone"]
    # Get all unique fields from registrations
    all_fields = set()
    for reg in registrations:
        user_data = reg.get('user_data', {})
        for key in user_data.keys():
            if key not in ['name', 'full_name', 'email', 'phone', 'mobile']:
                all_fields.add(key)
    header.extend(sorted(all_fields))
    if config.get('include_payment_info', True):
        header.extend(["Payment Status", "Amount", "Payment ID"])
    # Build data rows
    rows = [header]
    for reg in registrations:
        user_data = reg.get('user_data', {})
        row = [
            reg.get('id', '')[:8],
            datetime.fromisoformat(reg.get('created_at', datetime.now(timezone.utc).isoformat())).strftime('%Y-%m-%d %H:%M'),
            user_data.get('name', user_data.get('full_name', '')),
            user_data.get('email', ''),
            user_data.get('phone', user_data.get('mobile', '')),
        ]
        # Add custom fields in order
        for field in sorted(all_fields):
            row.append(str(user_data.get(field, '')))
        if config.get('include_payment_info', True):
            row.extend([
                reg.get('payment_status', 'pending'),
                str(reg.get('payment_amount', 0)),
                reg.get('payment_id', '')
            ])
        rows.append(row)
    # Clear existing data and write new data
    try:
        service = build('sheets', 'v4', credentials=creds)
        sheet_name = config.get('sheet_name', 'Registrations')
        # Clear existing data
        await asyncio.to_thread(
            lambda: service.spreadsheets().values().clear(
                spreadsheetId=config['spreadsheet_id'],
                range=f"{sheet_name}!A:Z"
            ).execute()
        )
        # Write new data
        body = {"values": rows}
        result = await asyncio.to_thread(
            lambda: service.spreadsheets().values().update(
                spreadsheetId=config['spreadsheet_id'],
                range=f"{sheet_name}!A1",
                valueInputOption="RAW",
                body=body
            ).execute()
        )
        return {
            "message": "Sync completed successfully",
            "count": len(registrations),
            "updates": result.get('updatedCells', 0)
        }
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/spreadsheets")
async def list_spreadsheets(current_user: UserInDB = Depends(get_current_user)):
    """List user's Google Spreadsheets"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    creds = await get_sheets_credentials(current_user.id, db)
    if not creds:
        raise HTTPException(status_code=400, detail="Google Sheets not connected")
    try:
        # Use Drive API to list spreadsheets
        from googleapiclient.discovery import build
        drive_service = build('drive', 'v3', credentials=creds)
        results = await asyncio.to_thread(
            lambda: drive_service.files().list(
                q="mimeType='application/vnd.google-apps.spreadsheet'",
                spaces='drive',
                fields='files(id, name, modifiedTime)',
                orderBy='modifiedTime desc',
                pageSize=20
            ).execute()
        )
        return results.get('files', [])
    except Exception as e:
        logger.error(f"Failed to list spreadsheets: {e}")
        raise HTTPException(status_code=500, detail=str(e))
