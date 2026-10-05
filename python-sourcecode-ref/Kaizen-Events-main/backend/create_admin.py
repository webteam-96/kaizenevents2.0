import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from auth import hash_password
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def create_admin_user():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Check if admin already exists
    existing_admin = await db.users.find_one({"email": "admin@kaizen.com"})
    
    if existing_admin:
        print("Admin user already exists!")
        client.close()
        return
    
    # Create admin user
    admin_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    admin_doc = {
        "id": admin_id,
        "email": "admin@kaizen.com",
        "name": "Super Admin",
        "role": "super_admin",
        "hashed_password": hash_password("admin123"),
        "campaign_access": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "is_active": True
    }
    
    await db.users.insert_one(admin_doc)
    print("Super admin user created successfully!")
    print("Email: admin@kaizen.com")
    print("Password: admin123")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_admin_user())
