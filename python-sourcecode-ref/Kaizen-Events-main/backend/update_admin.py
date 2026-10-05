import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from auth import hash_password
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def update_admin_credentials():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Update admin user credentials
    result = await db.users.update_one(
        {"email": "admin@kaizen.com"},
        {"$set": {
            "email": "pranav@kaizeninfotech.com",
            "hashed_password": hash_password("Kaizentest1234"),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count > 0:
        print("Admin credentials updated successfully!")
        print("New Email: pranav@kaizeninfotech.com")
        print("New Password: Kaizentest1234")
    else:
        print("Admin user not found or already updated")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_admin_credentials())
