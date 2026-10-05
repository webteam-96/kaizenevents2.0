# Database Backup & Restore Guide

## Backup File Information

| Property | Value |
|----------|-------|
| **File** | `database_backup.json` |
| **Database** | `kaizen_events` |
| **Format** | JSON (MongoDB Extended JSON) |

### Collections Included
- `users` - User accounts
- `campaigns` - Campaign configurations
- `registrations` - Registration records
- `payments` - Payment records
- `audit_logs` - Activity logs
- `campaign_members` - Closed group members
- `coupon_codes` - Discount coupons
- `notification_settings` - Notification configs
- `integration_settings` - Third-party integrations
- `payment_accounts` - Payment gateway accounts
- `campaign_bank_accounts` - Bank account details
- `sheets_config` - Google Sheets configs
- `contact_inquiries` - Contact form submissions
- `change_requests` - Change request records
- `short_urls` - URL shortener records

---

## Restore Instructions

### Prerequisites
- MongoDB 7.0+ installed and running
- Python 3.11+ installed

### Method 1: Using Python Script (Recommended)

1. **Place the backup file** in your `backend` folder:
   ```bash
   cp database_backup.json backend/
   cd backend
   ```

2. **Run the restore script**:
   ```bash
   python3 << 'EOF'
   import json
   from pymongo import MongoClient
   from bson import json_util

   # Configuration
   MONGO_URL = "mongodb://127.0.0.1:27017"
   DB_NAME = "kaizen_events"
   BACKUP_FILE = "database_backup.json"

   # Connect to MongoDB
   client = MongoClient(MONGO_URL)
   db = client[DB_NAME]

   # Load backup file
   print(f"Loading {BACKUP_FILE}...")
   with open(BACKUP_FILE, 'r') as f:
       backup = json.load(f)

   print(f"Backup from: {backup['metadata']['exported_at']}")
   print(f"Collections: {len(backup['data'])}")
   print()

   # Restore each collection
   for collection_name, documents in backup['data'].items():
       if not documents:
           print(f"  ⏭ {collection_name}: empty, skipping")
           continue
       
       # Convert from JSON to BSON-compatible format
       docs = json.loads(json.dumps(documents), object_hook=json_util.object_hook)
       
       # Drop existing collection and insert new data
       db[collection_name].drop()
       db[collection_name].insert_many(docs)
       print(f"  ✓ {collection_name}: {len(docs)} documents restored")

   # Create indexes
   print()
   print("Creating indexes...")
   db.users.create_index("email", unique=True)
   db.users.create_index("id", unique=True)
   db.campaigns.create_index("id", unique=True)
   db.campaigns.create_index("slug", unique=True)
   db.registrations.create_index("id", unique=True)
   db.registrations.create_index("campaign_id")
   db.audit_logs.create_index("timestamp")
   db.audit_logs.create_index("user_id")
   print("  ✓ Indexes created")

   print()
   print("✅ Database restore complete!")
   client.close()
   EOF
   ```

3. **Verify the restore**:
   ```bash
   python3 -c "
   from pymongo import MongoClient
   client = MongoClient('mongodb://127.0.0.1:27017')
   db = client['kaizen_events']
   print('Users:', db.users.count_documents({}))
   print('Campaigns:', db.campaigns.count_documents({}))
   print('Registrations:', db.registrations.count_documents({}))
   client.close()
   "
   ```

---

### Method 2: Using mongoimport (Alternative)

If you prefer using MongoDB's native tools:

1. **Extract collections from JSON** (requires jq):
   ```bash
   # Extract each collection to separate file
   jq -c '.data.users[]' database_backup.json > users.json
   jq -c '.data.campaigns[]' database_backup.json > campaigns.json
   jq -c '.data.registrations[]' database_backup.json > registrations.json
   # ... repeat for other collections
   ```

2. **Import each collection**:
   ```bash
   mongoimport --db kaizen_events --collection users --file users.json
   mongoimport --db kaizen_events --collection campaigns --file campaigns.json
   mongoimport --db kaizen_events --collection registrations --file registrations.json
   ```

---

## Default Login Credentials

After restoring, you can login with:

| Email | Password | Role |
|-------|----------|------|
| `pranav@kaizeninfotech.com` | `Kaizentest1234` | Super Admin |

⚠️ **Security Note**: Change these credentials immediately after first login in production!

---

## Troubleshooting

### Error: "Connection refused"
MongoDB is not running. Start it:
```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB
```

### Error: "Database already exists"
The restore script drops existing collections before importing. If you want to preserve existing data, modify the script to skip the `drop()` call.

### Error: "Invalid JSON"
Ensure the backup file is not corrupted:
```bash
python3 -c "import json; json.load(open('database_backup.json')); print('✓ Valid JSON')"
```

---

## Creating Your Own Backup

To create a new backup from your database:

```python
import json
from pymongo import MongoClient
from bson import json_util
from datetime import datetime

client = MongoClient("mongodb://127.0.0.1:27017")
db = client["kaizen_events"]

export_data = {
    "metadata": {
        "exported_at": datetime.utcnow().isoformat(),
        "database": "kaizen_events",
        "collections": db.list_collection_names()
    },
    "data": {}
}

for collection in db.list_collection_names():
    docs = list(db[collection].find())
    export_data["data"][collection] = json.loads(json_util.dumps(docs))

with open('my_backup.json', 'w') as f:
    json.dump(export_data, f, indent=2)

print("Backup created: my_backup.json")
client.close()
```

---

## Scheduled Backups (Production)

For production, set up automated backups:

```bash
# Add to crontab (daily at 2 AM)
0 2 * * * cd /path/to/backend && python3 backup_script.py >> /var/log/backup.log 2>&1
```
