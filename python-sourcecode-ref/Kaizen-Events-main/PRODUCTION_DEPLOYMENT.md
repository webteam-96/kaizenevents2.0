# Production Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Variables

#### Backend (.env)
```bash
cd backend
cp .env.example .env
```

**Required Variables:**
| Variable | How to Get |
|----------|------------|
| `MONGO_URL` | Your MongoDB connection string |
| `DB_NAME` | Database name (e.g., `kaizen_events`) |
| `JWT_SECRET_KEY` | Run: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `JWT_REFRESH_SECRET` | Run: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `ENCRYPTION_KEY` | Run: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `REQUEST_SIGNING_KEY` | Run: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `CORS_ORIGINS` | Your frontend URL(s), comma-separated |
| `FRONTEND_URL` | Your frontend URL |

**Optional Variables (enable features):**
| Variable | Purpose |
|----------|---------|
| `RAZORPAY_KEY_ID` | Razorpay payments |
| `RAZORPAY_KEY_SECRET` | Razorpay payments |
| `INSTAMOJO_CLIENT_ID` | Instamojo payments |
| `INSTAMOJO_CLIENT_SECRET` | Instamojo payments |
| `BREVO_API_KEY` | Email notifications |
| `INTERAKT_SECRET_KEY` | WhatsApp notifications |

#### Frontend (.env)
```bash
cd frontend
cp .env.example .env
```

| Variable | Value |
|----------|-------|
| `REACT_APP_BACKEND_URL` | Your backend URL (e.g., `http://localhost:8001`) |

---

### 2. Security Checklist

- [ ] Generated unique JWT_SECRET_KEY (64+ chars)
- [ ] Generated unique JWT_REFRESH_SECRET (64+ chars)
- [ ] Generated unique ENCRYPTION_KEY (32+ chars)
- [ ] Generated unique REQUEST_SIGNING_KEY (32+ chars)
- [ ] CORS_ORIGINS set to specific domains (no wildcards)
- [ ] MongoDB authentication enabled
- [ ] MongoDB bound to localhost or private IP only
- [ ] HTTPS enabled (for production domain)
- [ ] `.env` files NOT committed to git

---

### 3. Database Setup

```bash
# Start MongoDB
mongod --dbpath /path/to/data --bind_ip 127.0.0.1

# Create admin user (run once)
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
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
    
    # Check if admin exists
    existing = await db.users.find_one({"role": "super_admin"})
    if existing:
        print(f"Admin already exists: {existing['email']}")
        client.close()
        return
    
    admin = {
        "id": str(uuid.uuid4()),
        "email": "admin@yourdomain.com",  # CHANGE THIS
        "name": "Administrator",
        "role": "super_admin",
        "hashed_password": pwd_context.hash("YourSecureP@ssw0rd!"),  # CHANGE THIS (12+ chars, special chars)
        "campaign_access": [],
        "can_approve_transfers": True,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(admin)
    print(f"✅ Admin created: {admin['email']}")
    
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.campaigns.create_index("id", unique=True)
    await db.campaigns.create_index("slug", unique=True)
    await db.registrations.create_index("id", unique=True)
    await db.registrations.create_index("campaign_id")
    print("✅ Database indexes created")
    
    client.close()

asyncio.run(create_admin())
EOF
```

---

### 4. Start Services

#### Development Mode
```bash
# Terminal 1 - Backend
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 - Frontend
cd frontend
yarn start
```

#### Production Mode
```bash
# Backend with Gunicorn (Linux/macOS)
cd backend
source venv/bin/activate
gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8001

# Frontend - Build static files
cd frontend
yarn build
# Serve 'build' folder with nginx or any static server
```

---

### 5. Verify Deployment

```bash
# Check backend health
curl http://localhost:8001/health

# Check login works
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"YourSecureP@ssw0rd!"}'
```

---

### 6. Production Server Setup (Linux)

#### Systemd Service for Backend
Create `/etc/systemd/system/kaizen-backend.service`:
```ini
[Unit]
Description=Kaizen Events Backend
After=network.target mongodb.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/backend
Environment="PATH=/path/to/backend/venv/bin"
EnvironmentFile=/path/to/backend/.env
ExecStart=/path/to/backend/venv/bin/gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable kaizen-backend
sudo systemctl start kaizen-backend
```

#### Nginx Configuration
Create `/etc/nginx/sites-available/kaizen`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Frontend (static files)
    location / {
        root /path/to/frontend/build;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8001;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kaizen /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### 7. SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

### 8. Firewall Setup

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

### 9. Backup Strategy

```bash
# Daily MongoDB backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/mongodb"
mkdir -p $BACKUP_DIR
mongodump --db kaizen_events --out $BACKUP_DIR/$DATE
# Keep only last 30 days
find $BACKUP_DIR -type d -mtime +30 -exec rm -rf {} +
```

---

## Post-Deployment Verification

- [ ] Can access frontend at https://yourdomain.com
- [ ] Can login with admin credentials
- [ ] API health check returns OK
- [ ] HTTPS certificate is valid
- [ ] Security headers are present (check with securityheaders.com)
- [ ] MongoDB is not exposed to internet
- [ ] Logs are being written
- [ ] Backups are scheduled

---

## Troubleshooting

### Backend won't start
```bash
# Check logs
journalctl -u kaizen-backend -f

# Check if port is in use
lsof -i :8001
```

### MongoDB connection failed
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

### CORS errors
- Verify `CORS_ORIGINS` includes your frontend URL
- No trailing slashes in URLs
- Check browser console for specific error

### 502 Bad Gateway
- Backend might have crashed - check logs
- Verify backend is running: `curl http://localhost:8001/health`
