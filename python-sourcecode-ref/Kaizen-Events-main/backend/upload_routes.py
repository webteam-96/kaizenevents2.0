from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import os
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import List
import mimetypes
import logging

from models import UserInDB, UserRole
from security import sanitize_filename

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
security = HTTPBearer()
logger = logging.getLogger(__name__)

# Create uploads directory
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", str(Path(__file__).parent / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Allowed image types with magic bytes verification
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# Magic bytes for file type verification
MAGIC_BYTES = {
    b'\xff\xd8\xff': 'image/jpeg',
    b'\x89PNG\r\n\x1a\n': 'image/png',
    b'GIF87a': 'image/gif',
    b'GIF89a': 'image/gif',
    b'RIFF': 'image/webp',  # WebP starts with RIFF
    b'<?xml': 'image/svg+xml',
    b'<svg': 'image/svg+xml',
}


def verify_file_type(content: bytes, claimed_type: str) -> bool:
    """
    Verify file type using magic bytes to prevent content type spoofing.
    Returns True if the file content matches the claimed type.
    """
    if claimed_type == 'image/svg+xml':
        # SVG is text-based, check for XML or SVG tags
        try:
            text_start = content[:100].decode('utf-8', errors='ignore').lower()
            return '<?xml' in text_start or '<svg' in text_start
        except (UnicodeDecodeError, AttributeError):
            return False
    
    if claimed_type == 'image/webp':
        # WebP has RIFF header followed by WEBP
        return content[:4] == b'RIFF' and content[8:12] == b'WEBP'
    
    # Check other magic bytes
    for magic, mime_type in MAGIC_BYTES.items():
        if mime_type == claimed_type and content.startswith(magic):
            return True
    
    return False

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import get_current_user_with_db
    return await get_current_user_with_db(credentials)


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user)
):
    """Upload an image file with security validation"""
    
    # Validate file type from content-type header
    content_type = file.content_type
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{content_type}' not allowed. Allowed types: JPEG, PNG, GIF, WebP, SVG"
        )
    
    # Read file and check size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Verify file content matches claimed type (magic byte check)
    if not verify_file_type(contents, content_type):
        logger.warning(f"File type mismatch: claimed {content_type} but magic bytes don't match")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match declared type"
        )
    
    # Generate unique filename (never use user-provided filename)
    ext = mimetypes.guess_extension(content_type) or '.jpg'
    if ext == '.jpe':
        ext = '.jpg'
    filename = f"{uuid.uuid4().hex}{ext}"
    
    # Create date-based subdirectory
    date_dir = datetime.now().strftime("%Y/%m")
    save_dir = UPLOAD_DIR / date_dir
    save_dir.mkdir(parents=True, exist_ok=True)
    
    # Save file
    file_path = save_dir / filename
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # Return the URL path
    relative_path = f"{date_dir}/{filename}"
    
    logger.info(f"File uploaded by user {current_user.id}: {relative_path}")
    
    return {
        "success": True,
        "filename": filename,
        "path": relative_path,
        "url": f"/api/uploads/images/{relative_path}",
        "size": len(contents),
        "content_type": content_type
    }


@router.post("/images")
async def upload_multiple_images(
    files: List[UploadFile] = File(...),
    current_user: UserInDB = Depends(get_current_user)
):
    """Upload multiple image files"""
    results = []
    errors = []
    
    for file in files:
        try:
            # Validate file type
            content_type = file.content_type
            if content_type not in ALLOWED_TYPES:
                errors.append({"filename": file.filename, "error": f"File type '{content_type}' not allowed"})
                continue
            
            # Read file and check size
            contents = await file.read()
            if len(contents) > MAX_FILE_SIZE:
                errors.append({"filename": file.filename, "error": "File too large"})
                continue
            
            # Generate unique filename
            ext = mimetypes.guess_extension(content_type) or '.jpg'
            if ext == '.jpe':
                ext = '.jpg'
            filename = f"{uuid.uuid4().hex}{ext}"
            
            # Create date-based subdirectory
            date_dir = datetime.now().strftime("%Y/%m")
            save_dir = UPLOAD_DIR / date_dir
            save_dir.mkdir(parents=True, exist_ok=True)
            
            # Save file
            file_path = save_dir / filename
            with open(file_path, "wb") as f:
                f.write(contents)
            
            relative_path = f"{date_dir}/{filename}"
            results.append({
                "original_filename": file.filename,
                "filename": filename,
                "path": relative_path,
                "url": f"/api/uploads/images/{relative_path}",
                "size": len(contents)
            })
            
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})
    
    return {
        "success": len(results) > 0,
        "uploaded": results,
        "errors": errors
    }


@router.get("/images/{date_path:path}")
async def get_image(date_path: str):
    """Serve an uploaded image"""
    file_path = UPLOAD_DIR / date_path
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    # Security: ensure path is within UPLOAD_DIR
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return FileResponse(
        file_path,
        media_type=mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    )


@router.delete("/images/{date_path:path}")
async def delete_image(
    date_path: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Delete an uploaded image (requires authentication)"""
    file_path = UPLOAD_DIR / date_path
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    # Security: ensure path is within UPLOAD_DIR
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    os.remove(file_path)
    
    return {"success": True, "message": "Image deleted successfully"}
