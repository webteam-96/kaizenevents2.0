# Kaizen Events - Local Setup Guide

## Prerequisites

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | v18+ | https://nodejs.org/ |
| **Python** | 3.11+ | https://python.org/ |
| **MongoDB** | 7.0+ | https://mongodb.com/try/download/community |
| **Git** | Latest | https://git-scm.com/ |
| **Yarn** | Latest | `npm install -g yarn` |

---

## Quick Start (5 minutes)

### 1. Clone & Setup Backend
```bash
# Clone repository
git clone <your-repo-url>
cd kaizen-events

# Setup backend
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create environment file
cp .env.example .env
```

### 2. Generate Security Keys
```bash
python3 -c "
import secrets
print('Add these to your .env file:')
print()
print('JWT_SECRET_KEY=\"' + secrets.token_urlsafe(64) + '\"')
print('JWT_REFRESH_SECRET=\"' + secrets.token_urlsafe(64) + '\"')
print('ENCRYPTION_KEY=\"' + secrets.token_urlsafe(32) + '\"')
print('REQUEST_SIGNING_KEY=\"' + secrets.token_urlsafe(32) + '\"')
"
```

### 3. Edit .env File
Open `backend/.env` and update:
```bash
MONGO_URL="mongodb://127.0.0.1:27017"
DB_NAME="kaizen_events"
JWT_SECRET_KEY="<paste generated key>"
JWT_REFRESH_SECRET="<paste generated key>"
ENCRYPTION_KEY="<paste generated key>"
REQUEST_SIGNING_KEY="<paste generated key>"
CORS_ORIGINS="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
```

### 4. Start MongoDB
```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 5. Create Admin User
```bash
cd backend
python3 << 'EOF'
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone
import uuid

async def create_admin():
    client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    db = client["kaizen_events"]
    pwd = CryptContext(schemes=["bcrypt"], bcrypt__rounds=12)
    
    admin = {
        "id": str(uuid.uuid4()),
        "email": "admin@localhost.com",
        "name": "Admin",
        "role": "super_admin",
        "hashed_password": pwd.hash("Admin@123456!"),
        "campaign_access": [],
        "can_approve_transfers": True,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing = await db.users.find_one({"email": admin["email"]})
    if existing:
        print(f"Admin exists: {admin['email']}")
    else:
        await db.users.insert_one(admin)
        print(f"✅ Created: {admin['email']} / Admin@123456!")
    client.close()

asyncio.run(create_admin())
EOF
```

### 6. Start Backend
```bash
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 7. Setup Frontend (new terminal)
```bash
cd frontend
yarn install
cp .env.example .env
yarn start
```

### 8. Open Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Docs**: http://localhost:8001/docs

**Default Login:**
- Email: `admin@localhost.com`
- Password: `Admin@123456!`

---

## Common Issues & Solutions

### Issue: MongoDB connection failed
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Make sure MongoDB is running:
```bash
# Check MongoDB status
# Windows
sc query MongoDB

# macOS
brew services list

# Linux
sudo systemctl status mongod
```

### Issue: CORS errors in browser
```
Access to fetch has been blocked by CORS policy
```
**Solution**: Ensure `CORS_ORIGINS` in backend `.env` includes your frontend URL:
```
CORS_ORIGINS="http://localhost:3000"
```

### Issue: Module not found (Python)
```
ModuleNotFoundError: No module named 'xxx'
```
**Solution**: Make sure virtual environment is activated and install requirements:
```bash
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Issue: Node modules issues
```
Module not found: Can't resolve 'xxx'
```
**Solution**: Delete node_modules and reinstall:
```bash
rm -rf node_modules
yarn install
```

### Issue: Port already in use
```
Error: listen EADDRINUSE: address already in use :::8001
```
**Solution**: Kill the process using the port:
```bash
# Windows
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :8001
kill -9 <PID>
```

---

## Running in Production Mode

### Backend (with Gunicorn)
```bash
pip install gunicorn
gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8001
```

### Frontend (build static files)
```bash
yarn build
# Serve with nginx or any static file server
```

---

## Project Structure

```
kaizen-events/
├── backend/
│   ├── .env                 # Environment variables (create this)
│   ├── server.py            # Main FastAPI application
│   ├── auth.py              # Authentication logic
│   ├── security.py          # Security utilities
│   ├── models.py            # Pydantic models
│   ├── *_routes.py          # API route handlers
│   ├── requirements.txt     # Python dependencies
│   └── uploads/             # Uploaded files
│
├── frontend/
│   ├── .env                 # Environment variables (create this)
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom hooks
│   │   └── App.js           # Main App component
│   ├── package.json         # Node dependencies
│   └── public/              # Static files
│
└── memory/
    ├── PRD.md               # Product requirements
    └── SECURITY_ROADMAP.md  # Security documentation
```

---

## API Documentation

Once backend is running, access API docs at:
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

---

## Security Notes

1. **Never commit `.env` files** to version control
2. **Generate unique keys** for each environment (dev, staging, prod)
3. **Use HTTPS** in production
4. **Enable MongoDB authentication** in production
5. **Set strong passwords** (12+ chars, special characters)

---

## Support

For issues or questions:
- Check `/memory/SECURITY_ROADMAP.md` for security configuration
- Check `/memory/PRD.md` for feature documentation
- Review backend logs: `tail -f backend.log`

---

## Quick Start (TL;DR)

```bash
# Terminal 1 - Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Create .env file with your settings
uvicorn server:app --port 8001 --reload

# Terminal 2 - Frontend
cd frontend
yarn install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn start
```

Open http://localhost:3000 and login!
