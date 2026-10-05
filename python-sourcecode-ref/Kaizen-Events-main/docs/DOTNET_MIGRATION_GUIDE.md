# Kaizen Events: Python/FastAPI + MongoDB to .NET 8 + MySQL Migration Guide

> **Purpose**: This document provides Claude Code (AI) with complete, precise details of the existing Python backend so it can rebuild it in .NET 8 + MySQL 8. Every route, model, service, business rule, and database schema is documented from the actual source code.

---

## Table of Contents

1. [Migration Overview](#section-1-migration-overview)
2. [Project Structure Mapping](#section-2-project-structure-mapping)
3. [Authentication & Authorization](#section-3-authentication--authorization)
4. [Security Layer](#section-4-security-layer)
5. [Database Schema: MongoDB to MySQL](#section-5-database-schema--mongodb-to-mysql)
6. [API Routes: Complete Reference](#section-6-api-routes--complete-reference)
7. [Pydantic Models to C# DTOs](#section-7-pydantic-models--c-dtos)
8. [Services Layer](#section-8-services-layer)
9. [Middleware Stack](#section-9-middleware-stack)
10. [Business Logic Rules](#section-10-business-logic-rules)
11. [External Service Integrations](#section-11-external-service-integrations)
12. [Environment Variables](#section-12-environment-variables)
13. [Frontend Integration Points](#section-13-frontend-integration-points)
14. [Deployment & Infrastructure](#section-14-deployment--infrastructure)
15. [Data Migration Plan](#section-15-data-migration-plan)
16. [NuGet Package Mapping](#section-16-nuget-package-mapping)
17. [Appendices](#section-17-appendices)

---

## Section 1: Migration Overview

### Source Stack
- **Language**: Python 3.11
- **Web Framework**: FastAPI 0.128.0 with Uvicorn 0.25.0
- **Database**: MongoDB (async via Motor 3.7.1 / PyMongo 4.10.1)
- **Models**: Pydantic v2.12.5
- **Auth**: PyJWT 2.10.1 + python-jose 3.5.0 + passlib 1.7.4 (bcrypt)
- **Architecture**: 41 flat Python files in `/backend/` directory (no nested packages)

### Target Stack
- **Language**: C# 12 / .NET 8
- **Web Framework**: ASP.NET Core 8 Web API
- **Database**: MySQL 8 via Entity Framework Core 8 + Pomelo.EntityFrameworkCore.MySql
- **Models**: C# records/classes + FluentValidation
- **Auth**: Microsoft.AspNetCore.Authentication.JwtBearer + BCrypt.Net-Next

### Key Architectural Shifts

| Aspect | Python/FastAPI | .NET 8 |
|--------|---------------|--------|
| Database | Document DB (schemaless) | Relational DB (schema-enforced) |
| Models | Pydantic models | C# DTOs + EF Core entities |
| Routing | FastAPI APIRouter | ASP.NET Controllers |
| Async DB | Motor async driver | EF Core async |
| Data format | Python dict/JSON docs | Normalized MySQL tables + JSON columns |
| File layout | 41 flat .py files | Layered solution (API, Core, Infrastructure) |
| DI | Manual (import singletons) | Built-in DI container |
| Middleware | Starlette BaseHTTPMiddleware | ASP.NET Middleware pipeline |
| Serialization | Pydantic model_dump | System.Text.Json |

### What Stays Unchanged
- **Frontend**: React 19 app stays unchanged -- only the backend migrates
- **API contracts**: All endpoint paths, request/response JSON shapes, and status codes must be preserved exactly
- **External integrations**: Same Razorpay, Instamojo, Brevo, Interakt, Google Sheets APIs

---

## Section 2: Project Structure Mapping

### Current Python Structure
All 41 files are flat in `/backend/`:

```
backend/
  server.py                      # Main FastAPI app, middleware, auth routes, campaign CRUD, dashboard, startup
  models.py                      # Core Pydantic models (User, Campaign, enums)
  auth.py                        # JWT creation/validation, password hashing, RBAC functions
  security.py                    # Encryption, token blacklist, CSRF, rate limiting, sanitization, middleware
  audit_log.py                   # AuditLogger with hash-chain integrity, 30+ event types
  formula_engine.py              # Secure AST-based expression parser for pricing formulas
  payment_service.py             # Razorpay order/refund (singleton)
  instamojo_oauth_service.py     # Instamojo OAuth 2.0 client credentials flow
  settlement_service.py          # Fetch settlement data from Razorpay/Instamojo APIs
  invoice_service.py             # PDF invoice generation with ReportLab
  integration_service.py         # InteraktService, BrevoService, GoogleSheetsService
  registration_routes.py         # Registration submit, payment initiate/callback, invoice, refund
  registration_models.py         # PaymentStatus, RegistrationStatus, submission/response models
  form_routes.py                 # Form CRUD, coupon CRUD, pricing calculation, field rules evaluation
  form_models.py                 # Basic form field types and config
  form_models_advanced.py        # Advanced form: field rules, page breaks, themes, integrations
  landing_page_routes.py         # Landing page CRUD, public campaign/events endpoints, contact sales
  landing_page_models.py         # Section types, theme, landing page config
  payment_routes.py              # Payment create (Razorpay/Instamojo), verify, webhooks, external webhooks
  payment_accounts_routes.py     # Payment account CRUD, stats
  payment_accounts_models.py     # PaymentGatewayType, account base/create/response models
  analytics_routes.py            # Campaign analytics, CSV export, resend receipt
  analytics_models.py            # RegistrationAnalytics, EmailSendRequest, ExportRequest
  fund_transfer_routes.py        # Bank accounts, fund transfers, approvals, change requests, settlements
  fund_transfer_models.py        # TransferStatus, ChangeRequestType, bank account/transfer models
  campaign_member_routes.py      # Closed group: upload preview, upload members, CRUD, reminders, verify
  campaign_member_models.py      # MemberStatus, upload/reminder models, ClosedGroupConfig
  notification_routes.py         # Email/WhatsApp notification send, settings, logs
  sheets_routes.py               # Google Sheets OAuth login, callback, config, sync
  dkim_routes.py                 # DKIM domain registration/verification, email sender management
  integration_routes.py          # Integration status, WhatsApp/email/sheets configure/test/sync
  activity_log_routes.py         # Activity log listing, entity history, event types, stats
  offline_payment_routes.py      # Offline registration, OTP verify, confirm cash payment, no-show
  whatsapp_routes.py             # WhatsApp template guide, send invites, invite status
  kiosk_routes.py                # Kiosk mode: campaign info, search, register, confirm, check-in, stats
  kiosk_volunteer_routes.py      # Kiosk volunteer CRUD, campaign assignment, password reset
  url_shortener_routes.py        # Short URL create, redirect, list by campaign
  user_routes.py                 # User CRUD (enhanced, separate from server.py)
  upload_routes.py               # Image upload (single/multi), serve, delete
  .env                           # Environment variables
  requirements.txt               # Python dependencies
```

### Recommended .NET Structure

```
KaizenEvents.sln
├── KaizenEvents.API/                          # ASP.NET Web API project
│   ├── Controllers/
│   │   ├── AuthController.cs                  # server.py auth routes
│   │   ├── CampaignController.cs              # server.py campaign routes
│   │   ├── DashboardController.cs             # server.py dashboard routes
│   │   ├── UserController.cs                  # user_routes.py + server.py user routes
│   │   ├── RegistrationController.cs          # registration_routes.py
│   │   ├── FormController.cs                  # form_routes.py
│   │   ├── LandingPageController.cs           # landing_page_routes.py
│   │   ├── PaymentController.cs               # payment_routes.py
│   │   ├── PaymentAccountController.cs        # payment_accounts_routes.py
│   │   ├── AnalyticsController.cs             # analytics_routes.py
│   │   ├── FundTransferController.cs          # fund_transfer_routes.py
│   │   ├── CampaignMemberController.cs        # campaign_member_routes.py
│   │   ├── NotificationController.cs          # notification_routes.py
│   │   ├── IntegrationController.cs           # integration_routes.py + sheets_routes.py
│   │   ├── DkimController.cs                  # dkim_routes.py
│   │   ├── ActivityLogController.cs           # activity_log_routes.py
│   │   ├── OfflinePaymentController.cs        # offline_payment_routes.py
│   │   ├── WhatsAppController.cs              # whatsapp_routes.py
│   │   ├── KioskController.cs                 # kiosk_routes.py
│   │   ├── KioskVolunteerController.cs        # kiosk_volunteer_routes.py
│   │   ├── UrlShortenerController.cs          # url_shortener_routes.py
│   │   ├── UploadController.cs                # upload_routes.py
│   │   └── HealthController.cs                # health check
│   ├── Middleware/
│   │   ├── SecurityHeadersMiddleware.cs       # security.py SecurityHeadersMiddleware
│   │   ├── RateLimitMiddleware.cs             # security.py RateLimitMiddleware
│   │   ├── SuspiciousActivityMiddleware.cs    # security.py SuspiciousActivityMiddleware
│   │   └── GlobalExceptionMiddleware.cs       # server.py exception handlers
│   ├── Filters/
│   │   └── CampaignAccessFilter.cs            # auth.py require_campaign_access
│   └── Program.cs
│
├── KaizenEvents.Core/                         # Domain/Business Logic
│   ├── Entities/                              # EF Core entities (DB models)
│   │   ├── User.cs
│   │   ├── Campaign.cs
│   │   ├── Registration.cs
│   │   ├── Payment.cs
│   │   ├── PaymentAccount.cs
│   │   ├── CampaignMember.cs
│   │   ├── FundTransfer.cs
│   │   ├── ChangeRequest.cs
│   │   ├── BankAccount.cs
│   │   ├── CouponCode.cs
│   │   ├── AuditLog.cs
│   │   ├── ActivityLog.cs (same collection)
│   │   ├── NotificationLog.cs
│   │   ├── NotificationSetting.cs
│   │   ├── SheetsConfig.cs
│   │   ├── DkimDomain.cs
│   │   ├── EmailSender.cs
│   │   ├── KioskVolunteer.cs
│   │   ├── UrlShortcut.cs
│   │   ├── PasswordReset.cs
│   │   ├── ContactInquiry.cs
│   │   ├── OrphanPayment.cs
│   │   └── Refund.cs
│   ├── DTOs/                                  # Request/Response models
│   │   ├── Auth/
│   │   ├── Campaign/
│   │   ├── Registration/
│   │   ├── Form/
│   │   ├── Payment/
│   │   ├── FundTransfer/
│   │   ├── CampaignMember/
│   │   ├── Analytics/
│   │   ├── LandingPage/
│   │   ├── Notification/
│   │   └── Integration/
│   ├── Enums/
│   │   ├── UserRole.cs
│   │   ├── CampaignStatus.cs
│   │   ├── CampaignType.cs
│   │   ├── PaymentGateway.cs
│   │   ├── PaymentStatus.cs
│   │   ├── RegistrationStatus.cs
│   │   ├── FundCollectionMode.cs
│   │   ├── TransferStatus.cs
│   │   ├── ChangeRequestType.cs
│   │   ├── ChangeRequestStatus.cs
│   │   ├── MemberStatus.cs
│   │   ├── FieldType.cs
│   │   ├── SectionType.cs
│   │   └── PaymentGatewayType.cs
│   └── Interfaces/
│       ├── IPaymentService.cs
│       ├── IInstamojoService.cs
│       ├── ISettlementService.cs
│       ├── IInvoiceService.cs
│       ├── IFormulaEngine.cs
│       ├── IAuditLogger.cs
│       ├── IBrevoService.cs
│       ├── IInteraktService.cs
│       ├── IGoogleSheetsService.cs
│       └── IEncryptionService.cs
│
├── KaizenEvents.Infrastructure/               # Data Access + External Services
│   ├── Data/
│   │   ├── AppDbContext.cs
│   │   └── Migrations/
│   ├── Repositories/
│   ├── Services/
│   │   ├── JwtService.cs                      # auth.py
│   │   ├── EncryptionService.cs               # security.py DataEncryption
│   │   ├── TokenBlacklistService.cs           # security.py TokenBlacklist
│   │   ├── RateLimiterService.cs              # security.py RateLimiter + LoginRateLimiter
│   │   ├── SuspiciousActivityService.cs       # security.py SuspiciousActivityDetector
│   │   ├── PaymentService.cs                  # payment_service.py
│   │   ├── InstamojoOAuthService.cs           # instamojo_oauth_service.py
│   │   ├── SettlementService.cs               # settlement_service.py
│   │   ├── InvoiceService.cs                  # invoice_service.py
│   │   ├── FormulaEngine.cs                   # formula_engine.py
│   │   ├── AuditLogger.cs                     # audit_log.py
│   │   ├── BrevoService.cs                    # integration_service.py BrevoService
│   │   ├── InteraktService.cs                 # integration_service.py InteraktService
│   │   ├── GoogleSheetsService.cs             # integration_service.py GoogleSheetsService
│   │   └── SecurityAuditLogger.cs             # security.py SecurityAuditLogger
│   └── ExternalServices/
│
└── KaizenEvents.Shared/                       # Shared Utilities
    ├── Helpers/
    │   ├── SanitizationHelper.cs              # security.py sanitize_* functions
    │   ├── ValidationHelper.cs                # security.py validate_* functions
    │   └── SlugHelper.cs                      # server.py create_slug
    └── Constants/
```

---

## Section 3: Authentication & Authorization

### JWT Implementation (from `auth.py`)

**Configuration:**
- Algorithm: HS256
- Access token expiry: 30 minutes
- Refresh token expiry: 7 days
- Secret keys: `JWT_SECRET_KEY` and `JWT_REFRESH_SECRET` from environment (auto-generated if missing with warning)

**Access Token Claims:**
```json
{
  "sub": "<user_id (UUID string)>",
  "exp": "<expiry timestamp>",
  "iat": "<issued at timestamp>",
  "nbf": "<not before timestamp>",
  "jti": "<unique token ID (secrets.token_urlsafe(16))>",
  "type": "access"
}
```

**Refresh Token Claims:**
```json
{
  "sub": "<user_id>",
  "exp": "<expiry timestamp>",
  "iat": "<issued at timestamp>",
  "jti": "<unique token ID>",
  "type": "refresh"
}
```

**Token Validation** (`decode_access_token`):
1. Decode with HS256 and verify: exp, iat, nbf
2. Require claims: exp, sub, iat
3. Check `type` == "access"
4. Return payload

**Password Hashing:**
- Library: passlib with bcrypt scheme
- Rounds: 12 (increased from default 10)
- `hash_password(password: str) -> str`: Returns bcrypt hash
- `verify_password(plain, hashed) -> bool`: Constant-time comparison, catches all exceptions returning False

**Password Strength Rules** (from both `auth.py` and `security.py`):
1. Minimum 12 characters
2. Maximum 128 characters
3. Must contain at least one uppercase letter (`[A-Z]`)
4. Must contain at least one lowercase letter (`[a-z]`)
5. Must contain at least one digit (`\d`)
6. Must contain at least one special character (`[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;\'` + backtick + `~]`)
7. No more than 2 consecutive repeated characters (regex: `(.)\1{2,}`)
8. No sequential numbers: `012, 123, 234, ..., 890`
9. No sequential letters: `abc, bcd, cde, ..., xyz`
10. Not in common weak password list: `password, 12345678, qwerty123, admin123, letmein, welcome1, monkey123, dragon123, master123, login123, password1, password123`
11. Must not contain common words: `password, admin, user, login, welcome, test`

### Token Blacklist (from `security.py`)
- In-memory dict: `token_hash -> expiry_time`
- User-level revocation: `user_id -> revocation_time`
- Cleanup every 5 minutes
- Token hashed with SHA-256 before storage
- `blacklist_token(token, expiry_seconds=86400)`: Blacklists single token
- `revoke_all_user_tokens(user_id)`: Revokes all tokens for a user
- `is_blacklisted(token, user_id, token_issued_at) -> bool`: Checks both token-level and user-level revocation

### Dependency Injection Functions (from `auth.py` and `server.py`)

| Function | Description |
|----------|-------------|
| `get_current_user(credentials, db)` | Decode token, check blacklist, fetch user from DB, check is_active |
| `get_current_user_with_db(credentials)` | Same as above but uses global `db` instance from server.py |
| `require_super_admin(current_user)` | Checks `role == SUPER_ADMIN`, raises 403 |
| `require_authenticated(current_user)` | Returns current_user (any authenticated user) |
| `require_write_access(current_user)` | Checks `role == SUPER_ADMIN` for write ops |
| `require_campaign_access(campaign_id)` | Returns async closure; super_admin/director pass, org_admin must have campaign_id in campaign_access list |
| `require_admin_role(current_user)` | Checks role in [SUPER_ADMIN, ORG_ADMIN] |

### Auth Endpoints (from `server.py`)

**POST /api/auth/register** (UserCreate -> UserResponse, 201)
- Validates password strength
- Checks email uniqueness
- Org admins must have at least one campaign in campaign_access
- Creates user doc with UUID id, bcrypt hashed password, timestamps as ISO strings
- Fields: id, email, name, role, hashed_password, campaign_access, can_approve_transfers, created_at, updated_at, is_active

**POST /api/auth/login** (UserLogin -> TokenResponse)
- Validates email format
- Checks IP blocklist
- Checks login rate limit (returns remaining time if blocked)
- Sanitizes email with `sanitize_mongo_query`
- Verifies password; on failure: records failed attempt, records suspicious activity, logs audit event
- On success: clears failed attempts, creates access token with `{"sub": user_id}`, logs success
- Response: `{ access_token, token_type: "bearer", user: UserResponse }`

**POST /api/auth/logout** (Authenticated)
- Blacklists current token for 24 hours
- Logs admin action

**POST /api/auth/logout-all** (Authenticated)
- Revokes all tokens for user (user-level revocation)

**GET /api/auth/me** (Authenticated -> UserResponse)
- Returns current user info

**POST /api/auth/password-reset-request** (PasswordResetRequest)
- Always returns `{"message": "If the email exists, a reset code has been sent"}` (no email leak)
- Generates 32-byte URL-safe reset code
- Stores in `password_resets` collection: email, reset_code, created_at, used=False

**POST /api/auth/password-reset-confirm** (PasswordResetConfirm)
- Looks up reset code matching email + code + used=False
- Updates user password with new bcrypt hash
- Marks reset code as used

### .NET Equivalent
- Use `System.IdentityModel.Tokens.Jwt` + `Microsoft.AspNetCore.Authentication.JwtBearer`
- Custom `JwtService` class for token creation/validation
- `BCrypt.Net-Next` for password hashing (work factor 12)
- In-memory `ConcurrentDictionary` for token blacklist (or Redis for production)
- Custom authorization policies via `[Authorize(Policy = "SuperAdmin")]` etc.
- Custom `IAuthorizationHandler` for campaign-level access

---

## Section 4: Security Layer

### DataEncryption Class (from `security.py`)
- **Algorithm**: AES-256 via Fernet (symmetric encryption)
- **Key Derivation**: PBKDF2-HMAC-SHA256 with 480,000 iterations
- **Salt**: Static `b'kaizen_security_salt_v1'`
- **Key Material**: From `ENCRYPTION_KEY` env var
- **Methods**:
  - `encrypt(data: str) -> str`: Fernet encrypt
  - `decrypt(encrypted_data: str) -> str`: Fernet decrypt, returns `[ENCRYPTED]` on failure
  - `encrypt_dict_fields(data, fields) -> dict`: Encrypt specific fields
  - `decrypt_dict_fields(data, fields) -> dict`: Decrypt specific fields
- **Global instance**: `data_encryption`

**.NET Equivalent**: `System.Security.Cryptography` with AES + PBKDF2:
```csharp
// Use Rfc2898DeriveBytes for PBKDF2, then AES-256-CBC or AES-256-GCM
// Fernet is AES-128-CBC with HMAC-SHA256; for exact compatibility, use a .NET Fernet library
// Or use AES-256-GCM natively
```

### TokenBlacklist Class
See Section 3 above.

### CSRFProtection Class
- Double-submit cookie pattern
- Token lifetime: 1 hour (3600 seconds)
- `generate_token(session_id) -> str`: Creates `secrets.token_urlsafe(32)`, stores `session_id:token -> expiry`
- `validate_token(session_id, token) -> bool`: Checks combined key exists and not expired
- `cleanup()`: Removes expired tokens

### SuspiciousActivityDetector Class
- Per-IP tracking with score-based blocking
- **Patterns checked** (compiled regex):
  - SQL injection: `union\s+select|drop\s+table|delete\s+from`
  - XSS: `<script|javascript:|onerror=|onload=`
  - Path traversal: `\.\.\/|\.\.\\`
  - NoSQL injection: `\$ne|\$gt|\$lt|\$regex|\$where`
  - Code injection: `exec\(|system\(|eval\(`
- **Score system**:
  - malicious_path/query/body: 50 points
  - suspicious_ua: 10 points
  - failed_auth: 20 points
  - rate_limit_hit: 15 points
- **Block threshold**: Score >= 100 triggers 1-hour block
- **Methods**: `check_request(request, body)`, `record_failed_auth(ip)`, `record_rate_limit(ip)`

### RateLimiter Class
- IP+User-Agent based client identification (SHA-256 hash)
- `check_rate_limit(request, max_requests=100, window_seconds=60, block_duration=300) -> bool`
- Sliding window: keeps timestamps of requests, removes expired ones
- `check_user_rate_limit(user_id, max_requests=50, window_seconds=60) -> bool`

### LoginRateLimiter Class
- Key: SHA-256 hash of `email:ip` and separate `email:` key
- Progressive lockout durations: `[60, 300, 900, 3600, 86400]` seconds
- **Per email+IP**: Lockout after 3 failed attempts within 30 minutes
- **Per email (any IP)**: Account lockout after 10 failed attempts (1 hour block)
- `record_failed_attempt(email, ip)`: Increments counters
- `is_blocked(email, ip) -> (bool, remaining_seconds)`
- `clear_attempts(email, ip)`: Called on successful login
- `get_remaining_attempts(email, ip) -> int`: Returns max(0, 3 - attempts)

### SecurityHeadersMiddleware
Adds to every response:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://js.instamojo.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https:; frame-src https://checkout.razorpay.com https://js.instamojo.com https://test.instamojo.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests;`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(self), ...`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- For `/api/` paths: `Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0`
- Removes: `X-Powered-By`, `Server`

### SuspiciousActivityMiddleware
- Skips `/health` endpoint
- Calls `suspicious_activity.check_request(request)`
- Returns 403 if suspicious

### RateLimitMiddleware
- Skips `/health` endpoint
- **Endpoint-specific rate limits**:
  - `/api/auth/login`: 5 per minute, 10 min block
  - `/api/auth/register`: 3 per minute, 15 min block
  - `/api/auth/reset`: 3 per 5 min, 30 min block
  - `/api/payments`: 20 per minute, 5 min block
  - `/api/registrations`: 30 per minute, 5 min block
  - Default: 100 per minute, 5 min block
- Returns 429 with `Retry-After` header

### Input Sanitization Functions
- `sanitize_html(text)`: HTML-escapes, removes javascript:, data:text/html, vbscript:, event handlers (on\w+=), expression(), url() with javascript
- `sanitize_dict(data, fields_to_sanitize=None)`: Recursively sanitizes string values; sanitizes all if fields_to_sanitize is None
- `sanitize_filename(filename)`: Removes path separators, null bytes, special chars, limits to 255 chars
- `sanitize_mongo_query(query_value)`: Removes `$`, `{`, `}`, `.prototype`, `__proto__`, `constructor`

### Validation Functions
- `is_valid_uuid(value)`: Regex `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
- `validate_email(email)`: Max 254 chars, regex `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
- `validate_phone(phone)`: Strips separators, then `^\+?[0-9]{10,15}$`

### RequestValidator Class
- `MAX_BODY_SIZE`: 10 MB
- `MAX_URL_LENGTH`: 2048
- **Blocked user agents**: sqlmap, nikto, nmap, masscan, nessus, openvas, burpsuite, havij
- Checks: URL length, user agent patterns, null bytes in path, Content-Length

### SecurityAuditLogger Class
- File-based logger: `backend/logs/security_audit.log`
- Methods: `log_auth_success`, `log_auth_failure`, `log_suspicious_activity`, `log_access_denied`, `log_data_access`, `log_admin_action`

### IPAccessControl Class
- In-memory blocklist/allowlist/admin_allowlist sets
- `is_blocked(ip)`, `is_allowed(ip)`, `is_ip_in_range(ip, cidr)`

### RequestSigner Class
- HMAC-SHA256 signing: `method:path:body:timestamp`
- Secret from `REQUEST_SIGNING_KEY` env var
- Timestamp validation: within 5 minutes

---

## Section 5: Database Schema -- MongoDB to MySQL

### Design Principles
- MongoDB `_id` fields are excluded; all documents use a `id` field containing a UUID string
- Timestamps are stored as ISO 8601 strings in MongoDB; use `DATETIME(6)` in MySQL
- Dynamic/nested JSON data (form_data, form_config, landing_page_config) stays as `JSON` columns
- All UUID strings become `CHAR(36)` in MySQL
- Foreign keys are added where MongoDB had implicit references

### Table 1: users

```sql
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'org_admin', 'kiosk_volunteer') NOT NULL DEFAULT 'org_admin',
    hashed_password VARCHAR(255) NOT NULL,
    can_approve_transfers BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    INDEX idx_users_email (email),
    INDEX idx_users_role (role),
    INDEX idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 2: user_campaign_access (junction table)

```sql
CREATE TABLE user_campaign_access (
    user_id CHAR(36) NOT NULL,
    campaign_id CHAR(36) NOT NULL,
    PRIMARY KEY (user_id, campaign_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Migration note**: In MongoDB, `campaign_access` is a `List[str]` on the user document. Extract to this junction table.

### Table 3: campaigns

```sql
CREATE TABLE campaigns (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    organization_name VARCHAR(255) NOT NULL,
    campaign_type ENUM('open', 'closed_group') NOT NULL DEFAULT 'open',
    fund_collection_mode ENUM('kaizen_managed', 'organizer_direct') NULL,
    payment_collection_method VARCHAR(20) DEFAULT 'online',  -- 'online' or 'offline'
    kiosk_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
    event_logo TEXT NULL,
    logo_url TEXT NULL,
    has_landing_page BOOLEAN NOT NULL DEFAULT TRUE,
    registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    use_external_form BOOLEAN NOT NULL DEFAULT FALSE,
    external_form_url TEXT NULL,
    status ENUM('draft', 'active', 'closed', 'archived') NOT NULL DEFAULT 'draft',
    start_date DATETIME(6) NULL,
    end_date DATETIME(6) NULL,
    registration_start_date DATETIME(6) NULL,
    registration_end_date DATETIME(6) NULL,
    payment_gateway ENUM('razorpay', 'instamojo') NOT NULL DEFAULT 'razorpay',
    payment_account_id CHAR(36) NULL,
    payment_purpose VARCHAR(255) NULL,
    max_registrations INT NULL,
    current_registrations INT NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_transferred DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    description TEXT NULL,
    form_config JSON NULL,
    landing_page_config JSON NULL,
    payment_config JSON NULL,
    closed_group_config JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    archived_at DATETIME(6) NULL,
    FOREIGN KEY (payment_account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_campaigns_slug (slug),
    INDEX idx_campaigns_status (status),
    INDEX idx_campaigns_created_by (created_by),
    INDEX idx_campaigns_type (campaign_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 4: registrations

```sql
CREATE TABLE registrations (
    id CHAR(36) PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL,
    form_data JSON NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    payment_status ENUM('pending', 'completed', 'failed', 'refunded', 'partial_refund', 'no_show') NOT NULL DEFAULT 'pending',
    registration_status ENUM('draft', 'submitted', 'confirmed', 'cancelled', 'no_show') NOT NULL DEFAULT 'submitted',
    payment_id CHAR(36) NULL,
    gateway_payment_id VARCHAR(255) NULL,
    invoice_number VARCHAR(50) NULL,
    coupon_code VARCHAR(100) NULL,
    member_id CHAR(36) NULL,
    source VARCHAR(50) NULL,  -- 'external', 'external_manual', null (built-in)
    payment_gateway VARCHAR(50) NULL,
    -- Additional payment adjustment fields
    additional_payment_required BOOLEAN DEFAULT FALSE,
    additional_payment_amount DECIMAL(12,2) NULL,
    additional_payment_link TEXT NULL,
    additional_payment_gateway VARCHAR(50) NULL,
    additional_payment_request_id VARCHAR(255) NULL,
    additional_payment_link_id VARCHAR(255) NULL,
    refund_pending BOOLEAN DEFAULT FALSE,
    refund_amount DECIMAL(12,2) NULL,
    refund_confirmed BOOLEAN DEFAULT FALSE,
    refund_confirmed_at DATETIME(6) NULL,
    refund_confirmed_by CHAR(36) NULL,
    -- Offline payment fields
    otp_code VARCHAR(10) NULL,
    otp_expires_at DATETIME(6) NULL,
    otp_verified BOOLEAN DEFAULT FALSE,
    cash_collected BOOLEAN DEFAULT FALSE,
    cash_collected_by CHAR(36) NULL,
    cash_collected_at DATETIME(6) NULL,
    receipt_number VARCHAR(50) NULL,
    check_in_at DATETIME(6) NULL,
    checked_in_by CHAR(36) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    INDEX idx_registrations_campaign (campaign_id),
    INDEX idx_registrations_payment_status (payment_status),
    INDEX idx_registrations_invoice (invoice_number),
    INDEX idx_registrations_member (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 5: payments

```sql
CREATE TABLE payments (
    id CHAR(36) PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL,
    registration_id CHAR(36) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    gateway VARCHAR(20) NOT NULL,  -- 'razorpay' or 'instamojo'
    payment_account_id CHAR(36) NULL,
    buyer_name VARCHAR(255) NOT NULL,
    buyer_email VARCHAR(254) NOT NULL,
    buyer_phone VARCHAR(20) NOT NULL,
    purpose VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, completed, failed
    gateway_order_id VARCHAR(255) NULL,  -- Razorpay order ID
    gateway_payment_id VARCHAR(255) NULL,  -- Gateway-specific payment ID
    gateway_payment_request_id VARCHAR(255) NULL,  -- Instamojo request ID
    source VARCHAR(50) NULL,  -- 'external', 'external_manual', null
    -- Settlement fields
    gateway_fee DECIMAL(12,4) NULL,
    gateway_tax DECIMAL(12,4) NULL,
    settlement_amount DECIMAL(12,2) NULL,
    settlement_status VARCHAR(20) NULL,  -- 'pending' or 'settled'
    settlement_synced_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    paid_at DATETIME(6) NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (registration_id) REFERENCES registrations(id),
    FOREIGN KEY (payment_account_id) REFERENCES payment_accounts(id),
    INDEX idx_payments_campaign (campaign_id),
    INDEX idx_payments_registration (registration_id),
    INDEX idx_payments_gateway_request (gateway_payment_request_id),
    INDEX idx_payments_gateway_payment (gateway_payment_id),
    INDEX idx_payments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 6: payment_accounts

```sql
CREATE TABLE payment_accounts (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    gateway_type ENUM('instamojo', 'razorpay') NOT NULL,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Instamojo credentials (encrypted)
    instamojo_api_key TEXT NULL,
    instamojo_auth_token TEXT NULL,
    instamojo_salt VARCHAR(255) NULL,
    instamojo_mode VARCHAR(20) DEFAULT 'sandbox',
    -- Razorpay credentials (encrypted)
    razorpay_key_id VARCHAR(255) NULL,
    razorpay_key_secret TEXT NULL,
    razorpay_mode VARCHAR(20) DEFAULT 'test',
    -- Stats
    total_transactions INT NOT NULL DEFAULT 0,
    total_amount_collected DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    last_transaction_at DATETIME(6) NULL,
    -- Metadata
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_payment_accounts_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 7: campaign_members

```sql
CREATE TABLE campaign_members (
    id CHAR(36) PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    email VARCHAR(254) NULL,
    custom_fields JSON DEFAULT '{}',
    status ENUM('unregistered', 'registered') NOT NULL DEFAULT 'unregistered',
    registration_id CHAR(36) NULL,
    registered_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_members_campaign (campaign_id),
    INDEX idx_members_mobile (mobile),
    INDEX idx_members_status (status),
    UNIQUE KEY uk_members_campaign_mobile (campaign_id, mobile)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 8: fund_transfers

```sql
CREATE TABLE fund_transfers (
    id CHAR(36) PRIMARY KEY,
    request_number VARCHAR(50) NOT NULL UNIQUE,
    campaign_id CHAR(36) NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('pending_approval', 'approved', 'rejected', 'completed') NOT NULL DEFAULT 'pending_approval',
    bank_account_id CHAR(36) NULL,
    bank_account_snapshot JSON NULL,
    created_by CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    notes TEXT NULL,
    approved_by CHAR(36) NULL,
    approved_at DATETIME(6) NULL,
    approval_notes TEXT NULL,
    rejected_by CHAR(36) NULL,
    rejected_at DATETIME(6) NULL,
    rejection_reason TEXT NULL,
    completed_by CHAR(36) NULL,
    completed_at DATETIME(6) NULL,
    transaction_reference VARCHAR(255) NULL,
    transfer_date VARCHAR(50) NULL,
    notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notification_sent_at DATETIME(6) NULL,
    notification_email VARCHAR(254) NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_transfers_campaign (campaign_id),
    INDEX idx_transfers_status (status),
    INDEX idx_transfers_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 9: bank_accounts

```sql
CREATE TABLE bank_accounts (
    id CHAR(36) PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL UNIQUE,
    account_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(255) NOT NULL,  -- Encrypted
    account_number_masked VARCHAR(20) NOT NULL,
    ifsc_code VARCHAR(20) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    notification_email VARCHAR(254) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 10: change_requests

```sql
CREATE TABLE change_requests (
    id CHAR(36) PRIMARY KEY,
    request_number VARCHAR(50) NOT NULL UNIQUE,
    campaign_id CHAR(36) NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    request_type ENUM('fund_transfer', 'bank_account', 'payment_gateway', 'fund_collection_mode') NOT NULL,
    current_value JSON NULL,
    new_value JSON NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_by CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    approved_by CHAR(36) NULL,
    approved_at DATETIME(6) NULL,
    approval_notes TEXT NULL,
    rejected_by CHAR(36) NULL,
    rejected_at DATETIME(6) NULL,
    rejection_reason TEXT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_change_requests_status (status),
    INDEX idx_change_requests_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 11: coupon_codes

```sql
CREATE TABLE coupon_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL,
    code VARCHAR(100) NOT NULL,
    discount_type VARCHAR(20) NOT NULL,  -- 'percentage', 'fixed', 'formula'
    discount_value DECIMAL(12,2) NOT NULL,
    formula TEXT NULL,
    valid_from DATETIME(6) NULL,
    valid_until DATETIME(6) NULL,
    usage_limit INT NULL,
    current_usage INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    conditions JSON NULL,
    created_at DATETIME(6) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    UNIQUE KEY uk_coupon_campaign_code (campaign_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 12: audit_logs

```sql
CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME(6) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    user_id CHAR(36) NULL,
    user_email VARCHAR(254) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    resource_type VARCHAR(50) NULL,
    resource_id CHAR(36) NULL,
    action_details JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    error_message TEXT NULL,
    integrity_hash CHAR(64) NOT NULL,
    INDEX idx_audit_event_type (event_type, timestamp),
    INDEX idx_audit_user (user_id, timestamp),
    INDEX idx_audit_resource (resource_type, resource_id),
    INDEX idx_audit_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Note**: MongoDB had a TTL index to auto-delete after 2 years. In MySQL, implement a scheduled job or event to purge old records.

### Table 13: notification_logs

```sql
CREATE TABLE notification_logs (
    id CHAR(36) PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL,
    registration_id CHAR(36) NULL,
    type VARCHAR(20) NOT NULL,  -- 'email', 'whatsapp'
    recipient VARCHAR(254) NOT NULL,
    subject VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL,  -- 'sent', 'failed'
    error TEXT NULL,
    created_at DATETIME(6) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    INDEX idx_notif_logs_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 14: notification_settings

```sql
CREATE TABLE notification_settings (
    id CHAR(36) PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL UNIQUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sender_email VARCHAR(254) NULL,
    sender_name VARCHAR(255) NULL,
    cc_emails JSON NULL,
    bcc_emails JSON NULL,
    email_template JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 15: sheets_configs

```sql
CREATE TABLE sheets_configs (
    id CHAR(36) PRIMARY KEY,
    campaign_id CHAR(36) NOT NULL,
    spreadsheet_id VARCHAR(255) NULL,
    spreadsheet_url TEXT NULL,
    sheet_name VARCHAR(255) DEFAULT 'Registrations',
    auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
    shared_with VARCHAR(254) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    INDEX idx_sheets_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 16: dkim_domains

```sql
CREATE TABLE dkim_domains (
    id CHAR(36) PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    brevo_domain_id BIGINT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, verified, failed
    dkim_records JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 17: email_senders

```sql
CREATE TABLE email_senders (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    domain_id CHAR(36) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    FOREIGN KEY (domain_id) REFERENCES dkim_domains(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 18: kiosk_volunteers

```sql
CREATE TABLE kiosk_volunteers (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(20) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    campaign_ids JSON NOT NULL DEFAULT '[]',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 19: url_shortcuts

```sql
CREATE TABLE url_shortcuts (
    id CHAR(36) PRIMARY KEY,
    short_code VARCHAR(20) NOT NULL UNIQUE,
    original_url TEXT NOT NULL,
    campaign_id CHAR(36) NULL,
    title VARCHAR(255) NULL,
    click_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL,
    created_by CHAR(36) NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_short_code (short_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 20: password_resets

```sql
CREATE TABLE password_resets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    reset_code VARCHAR(255) NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(6) NOT NULL,
    INDEX idx_pw_reset_email (email, used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 21: refunds

```sql
CREATE TABLE refunds (
    id CHAR(36) PRIMARY KEY,
    registration_id CHAR(36) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processed',
    refund_id VARCHAR(255) NULL,  -- Gateway refund ID
    created_at DATETIME(6) NOT NULL,
    FOREIGN KEY (registration_id) REFERENCES registrations(id),
    INDEX idx_refunds_registration (registration_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 22: orphan_payments

```sql
CREATE TABLE orphan_payments (
    id CHAR(36) PRIMARY KEY,
    type VARCHAR(50) NOT NULL DEFAULT 'orphan_external',
    gateway_payment_id VARCHAR(255) NULL,
    gateway_payment_request_id VARCHAR(255) NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    buyer_name VARCHAR(255) NULL,
    buyer_email VARCHAR(254) NULL,
    buyer_phone VARCHAR(20) NULL,
    purpose TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'needs_review',
    raw_payload JSON NULL,
    created_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 23: contact_inquiries

```sql
CREATE TABLE contact_inquiries (
    id CHAR(36) PRIMARY KEY,
    contact_name VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    email VARCHAR(254) NOT NULL,
    club_name VARCHAR(255) NOT NULL,
    district VARCHAR(255) NOT NULL,
    designation VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    estimated_registrants VARCHAR(50) NOT NULL,
    event_date VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    created_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table 24: integration_settings

```sql
CREATE TABLE integration_settings (
    id CHAR(36) PRIMARY KEY,
    type VARCHAR(50) NOT NULL UNIQUE,  -- 'google_sheets', etc.
    credentials_json TEXT NULL,
    config JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## Section 6: API Routes -- Complete Reference

### Module: server.py (prefix: /api)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | Public | Register new user |
| POST | /api/auth/login | Public | Login, returns JWT |
| POST | /api/auth/logout | Authenticated | Blacklist current token |
| POST | /api/auth/logout-all | Authenticated | Revoke all user tokens |
| GET | /api/auth/me | Authenticated | Get current user info |
| POST | /api/auth/password-reset-request | Public | Request password reset |
| POST | /api/auth/password-reset-confirm | Public | Confirm password reset |
| POST | /api/campaigns | Super Admin | Create campaign |
| GET | /api/campaigns | Authenticated | List campaigns (scoped by access) |
| GET | /api/campaigns/{campaign_id} | Authenticated + Access | Get campaign details |
| PUT | /api/campaigns/{campaign_id} | Super Admin | Update campaign |
| POST | /api/campaigns/{campaign_id}/archive | Super Admin | Archive active campaign |
| POST | /api/campaigns/{campaign_id}/unarchive | Super Admin | Restore archived campaign |
| DELETE | /api/campaigns/{campaign_id} | Super Admin | Delete campaign |
| GET | /api/campaigns/{campaign_id}/stats | Authenticated + Access | Get campaign statistics |
| GET | /api/users | Super Admin | List all users |
| PUT | /api/users/{user_id}/access | Super Admin | Update user campaign access |
| GET | /api/dashboard/stats | Authenticated | Dashboard statistics (scoped) |
| GET | /health | Public | Health check |

### Module: registration_routes.py (prefix: /api)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/registrations/submit | Public | Submit registration |
| POST | /api/registrations/payment/initiate | Public | Initiate payment for registration |
| POST | /api/registrations/payment/callback | Public | Handle payment callback |
| GET | /api/campaigns/{campaign_id}/registrations | Authenticated + Access | List campaign registrations |
| PUT | /api/registrations/{registration_id} | Authenticated + Access | Update registration (payment adjustment) |
| POST | /api/registrations/{registration_id}/confirm-refund | Super Admin / Director | Confirm refund processed |
| GET | /api/registrations/{registration_id}/invoice | Public | Download invoice PDF |
| POST | /api/registrations/refund | Super Admin | Create refund |

### Module: form_routes.py (prefix: /api)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/formula/validate | Authenticated | Validate a formula |
| GET | /api/campaigns/{campaign_id}/form | Authenticated + Access | Get form config |
| PUT | /api/campaigns/{campaign_id}/form | Super Admin | Update form config |
| DELETE | /api/campaigns/{campaign_id}/form | Super Admin | Delete form config |
| GET | /api/campaigns/{campaign_id}/coupons | Authenticated + Access | List coupons |
| POST | /api/campaigns/{campaign_id}/coupons | Super Admin | Create coupon |
| DELETE | /api/campaigns/{campaign_id}/coupons/{code} | Super Admin | Delete coupon |
| POST | /api/campaigns/{campaign_id}/calculate-price | Public | Calculate price with formulas |
| POST | /api/evaluate-field-rules | Public | Evaluate field visibility rules |
| POST | /api/campaigns/{campaign_id}/validate-coupon | Public | Validate a coupon code |

### Module: landing_page_routes.py (prefix: /api)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/campaigns/{campaign_id}/landing-page | Public | Get landing page config |
| PUT | /api/campaigns/{campaign_id}/landing-page | Super Admin | Update landing page |
| DELETE | /api/campaigns/{campaign_id}/landing-page | Super Admin | Delete landing page |
| GET | /api/public/campaigns/{slug}/landing-page | Public | Get public landing page by slug |
| GET | /api/public/campaigns/{slug} | Public | Get public campaign data by slug |
| GET | /api/public/events | Public | List all active public events |
| POST | /api/contact-sales | Public | Submit sales inquiry |

### Module: payment_routes.py (prefix: /api/payments)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/payments/create | Public | Create payment order (Razorpay/Instamojo) |
| POST | /api/payments/verify/razorpay | Public | Verify Razorpay payment signature |
| POST | /api/payments/webhook/instamojo | Public | Instamojo webhook (built-in form) |
| GET | /api/payments/callback/instamojo | Public | Instamojo redirect callback |
| GET | /api/payments/status/{payment_id} | Public | Get payment status |
| GET | /api/payments/registration/{registration_id} | Public | Get payment by registration |
| POST | /api/payments/webhook/instamojo/external/{campaign_slug} | Public | Instamojo webhook for specific campaign |
| POST | /api/payments/webhook/instamojo/external | Public | Instamojo webhook for external forms |
| GET | /api/payments/webhook-url/{campaign_slug} | Authenticated | Get webhook URL for campaign |
| GET | /api/payments/orphan-payments | Authenticated | List unmatched external payments |
| POST | /api/payments/orphan-payments/{payment_id}/assign | Authenticated | Assign orphan payment to campaign |

### Module: payment_accounts_routes.py (prefix: /api/payment-accounts)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/payment-accounts | Super Admin | Create payment account |
| GET | /api/payment-accounts | Super Admin | List all payment accounts |
| GET | /api/payment-accounts/list | Authenticated | List active accounts (dropdown) |
| GET | /api/payment-accounts/{account_id} | Super Admin | Get account details |
| PUT | /api/payment-accounts/{account_id} | Super Admin | Update account |
| DELETE | /api/payment-accounts/{account_id} | Super Admin | Delete account |
| GET | /api/payment-accounts/{account_id}/stats | Super Admin | Get account stats |

### Module: analytics_routes.py (prefix: /api)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/campaigns/{campaign_id}/analytics | Authenticated + Access | Campaign analytics |
| GET | /api/campaigns/{campaign_id}/export/csv | Authenticated + Access | Export registrations CSV |
| POST | /api/registrations/{registration_id}/resend-receipt | Authenticated | Resend receipt email |
| POST | /api/registrations/{registration_id}/send-whatsapp | Authenticated | Send WhatsApp notification |

### Module: fund_transfer_routes.py (prefix: /api/fund-transfers)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/fund-transfers/stats | Super Admin / Director | Fund transfer statistics |
| POST | /api/fund-transfers/sync-settlements/{campaign_id} | Super Admin | Sync settlements for campaign |
| POST | /api/fund-transfers/sync-all-settlements | Super Admin | Sync all campaign settlements |
| GET | /api/fund-transfers/campaigns-pending | Super Admin / Director | Campaigns with pending transfers |
| GET | /api/fund-transfers/campaign/{campaign_id}/summary | Authenticated + Access | Campaign fund summary |
| POST | /api/fund-transfers/campaign/{campaign_id}/bank-account | Super Admin | Create bank account |
| PUT | /api/fund-transfers/campaign/{campaign_id}/bank-account | Super Admin | Update bank account |
| GET | /api/fund-transfers/campaign/{campaign_id}/bank-account | Authenticated + Access | Get bank account |
| POST | /api/fund-transfers | Super Admin | Create transfer request |
| GET | /api/fund-transfers | Super Admin / Director | List all transfers |
| GET | /api/fund-transfers/campaign/{campaign_id}/transfers | Authenticated + Access | List campaign transfers |
| GET | /api/fund-transfers/pending-approvals | Director | Get pending approvals |
| PUT | /api/fund-transfers/{transfer_id}/approve | Director | Approve transfer |
| PUT | /api/fund-transfers/{transfer_id}/reject | Director | Reject transfer |
| PUT | /api/fund-transfers/{transfer_id}/resubmit | Super Admin | Resubmit rejected transfer |
| PUT | /api/fund-transfers/{transfer_id}/complete | Super Admin | Complete transfer |
| POST | /api/fund-transfers/{transfer_id}/send-notification | Super Admin | Send completion notification |
| GET | /api/fund-transfers/change-requests | Super Admin / Director | List change requests |
| POST | /api/fund-transfers/change-requests | Super Admin | Create change request |
| PUT | /api/fund-transfers/change-requests/{request_id}/approve | Director | Approve change request |
| PUT | /api/fund-transfers/change-requests/{request_id}/reject | Director | Reject change request |

### Module: campaign_member_routes.py (prefix: /api/campaigns)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/campaigns/{campaign_id}/members/upload/preview | Super Admin | Preview CSV/Excel upload |
| POST | /api/campaigns/{campaign_id}/members/upload | Super Admin | Upload members from file |
| GET | /api/campaigns/{campaign_id}/members/upload/errors | Super Admin | Get upload error history |
| GET | /api/campaigns/{campaign_id}/members | Authenticated + Access | List members (paginated) |
| POST | /api/campaigns/{campaign_id}/members | Super Admin | Add single member |
| PUT | /api/campaigns/{campaign_id}/members/{member_id} | Super Admin | Update member |
| DELETE | /api/campaigns/{campaign_id}/members/{member_id} | Super Admin | Delete member |
| POST | /api/campaigns/{campaign_id}/members/reminders | Authenticated + Access | Send bulk reminders |
| POST | /api/campaigns/{campaign_id}/members/{member_id}/reminder | Authenticated + Access | Send single reminder |
| GET | /api/campaigns/{campaign_id}/members/public | Public | Public member list (for verification) |
| GET | /api/campaigns/{campaign_id}/members/{member_id}/verify | Public | Verify member by phone |

### Module: notification_routes.py (prefix: /api/notifications)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/notifications/settings/{campaign_id} | Authenticated | Get notification settings |
| PUT | /api/notifications/settings/{campaign_id} | Super Admin | Update notification settings |
| GET | /api/notifications/logs/{campaign_id} | Authenticated | Get notification logs |
| POST | /api/notifications/send | Authenticated | Send notification |
| POST | /api/notifications/test-email | Authenticated | Send test email |

### Module: integration_routes.py (prefix: /api/integrations)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/integrations/status | Super Admin | Get integration status |
| POST | /api/integrations/whatsapp/test | Super Admin | Test WhatsApp |
| POST | /api/integrations/whatsapp/send-registration-confirmation | Authenticated | Send WhatsApp confirmation |
| POST | /api/integrations/email/configure | Super Admin | Configure Brevo |
| POST | /api/integrations/email/test | Super Admin | Test email |
| POST | /api/integrations/email/send-registration-confirmation | Authenticated | Send email confirmation |
| POST | /api/integrations/sheets/configure | Super Admin | Configure Google Sheets |
| POST | /api/integrations/sheets/create-campaign-sheet | Authenticated | Create campaign spreadsheet |
| DELETE | /api/integrations/sheets/campaign/{campaign_id} | Super Admin | Disable campaign sheet |
| GET | /api/integrations/sheets/service-email | Super Admin | Get service account email |
| POST | /api/integrations/sheets/sync | Authenticated | Sync campaign to sheets |
| GET | /api/integrations/sheets/config/{campaign_id} | Authenticated | Get sheets config |
| GET | /api/integrations/logs/{campaign_id} | Authenticated | Get integration logs |

### Module: sheets_routes.py (prefix: /api/sheets)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/sheets/auth/login | Authenticated | Google Sheets OAuth login |
| GET | /api/sheets/callback | Public | OAuth callback |
| GET | /api/sheets/status | Authenticated | Get sheets connection status |
| DELETE | /api/sheets/disconnect | Authenticated | Disconnect sheets |
| GET | /api/sheets/config/{campaign_id} | Authenticated | Get sheets config |
| PUT | /api/sheets/config/{campaign_id} | Authenticated | Update sheets config |
| POST | /api/sheets/sync | Authenticated | Sync registrations to sheets |
| GET | /api/sheets/spreadsheets | Authenticated | List spreadsheets |

### Module: dkim_routes.py (prefix: /api/dkim)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/dkim/test | Public | Test endpoint |
| POST | /api/dkim/domains | Super Admin | Register DKIM domain |
| GET | /api/dkim/domains | Authenticated | List DKIM domains |
| GET | /api/dkim/domains/{domain_id} | Authenticated | Get domain details |
| POST | /api/dkim/domains/{domain_id}/verify | Super Admin | Verify DKIM domain |
| DELETE | /api/dkim/domains/{domain_id} | Super Admin | Delete domain |
| POST | /api/dkim/senders | Super Admin | Create email sender |
| GET | /api/dkim/senders | Authenticated | List email senders |
| PUT | /api/dkim/senders/{sender_id} | Super Admin | Update sender |
| DELETE | /api/dkim/senders/{sender_id} | Super Admin | Delete sender |

### Module: activity_log_routes.py (prefix: /api/activity-logs)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/activity-logs | Super Admin | List activity logs (paginated/filtered) |
| GET | /api/activity-logs/entity/{entity_type}/{entity_id} | Super Admin | Get entity history |
| GET | /api/activity-logs/event-types | Super Admin | List available event types |
| GET | /api/activity-logs/stats | Super Admin | Activity log statistics |

### Module: offline_payment_routes.py (prefix: /api)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/registrations/offline/submit | Public | Submit offline registration (OTP sent) |
| POST | /api/registrations/offline/verify-otp | Public | Verify OTP for offline registration |
| POST | /api/registrations/offline/confirm-payment | Authenticated (Kiosk/Organizer) | Confirm cash payment |
| GET | /api/campaigns/{campaign_id}/offline-payments/pending | Authenticated | List pending offline payments |
| POST | /api/registrations/{registration_id}/mark-no-show | Authenticated (Organizer) | Mark as no-show |
| GET | /api/registrations/{registration_id}/resend-otp | Public | Resend OTP |
| POST | /api/verify-otp | Public | Verify OTP by registration |

### Module: whatsapp_routes.py (prefix: /api/whatsapp)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/whatsapp/template-guide | Authenticated | Get WhatsApp template setup guide |
| POST | /api/whatsapp/campaigns/{campaign_id}/send-invites | Authenticated + Access | Send WhatsApp invites to members |
| GET | /api/whatsapp/campaigns/{campaign_id}/invite-status | Authenticated + Access | Get invite send status |

### Module: kiosk_routes.py (prefix: /api/kiosk)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/kiosk/campaigns/{campaign_id}/info | Kiosk/Admin | Get kiosk campaign info |
| POST | /api/kiosk/search | Kiosk/Admin | Search registrants |
| POST | /api/kiosk/register | Kiosk/Admin | Create kiosk registration |
| POST | /api/kiosk/confirm-payment | Kiosk/Admin | Confirm kiosk cash payment |
| POST | /api/kiosk/check-in | Kiosk/Admin | Check in registrant |
| GET | /api/kiosk/campaigns/{campaign_id}/stats | Kiosk/Admin | Kiosk statistics |
| POST | /api/kiosk/verify-otp | Kiosk/Admin | Verify OTP at kiosk |

### Module: kiosk_volunteer_routes.py (prefix: /api/kiosk-volunteers)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/kiosk-volunteers | Super Admin / Org Admin | List volunteers |
| POST | /api/kiosk-volunteers | Super Admin / Org Admin | Create volunteer |
| GET | /api/kiosk-volunteers/{volunteer_id} | Super Admin / Org Admin | Get volunteer |
| PUT | /api/kiosk-volunteers/{volunteer_id} | Super Admin / Org Admin | Update volunteer |
| DELETE | /api/kiosk-volunteers/{volunteer_id} | Super Admin / Org Admin | Delete volunteer |
| POST | /api/kiosk-volunteers/{volunteer_id}/assign-campaigns | Super Admin / Org Admin | Assign campaigns |
| POST | /api/kiosk-volunteers/{volunteer_id}/reset-password | Super Admin / Org Admin | Reset password |
| GET | /api/kiosk-volunteers/campaigns/{campaign_id}/volunteers | Super Admin / Org Admin | Get campaign volunteers |

### Module: url_shortener_routes.py (no prefix)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /s/{short_code} | Public | Redirect short URL |
| POST | /api/short-urls | Authenticated | Create short URL |
| GET | /api/short-urls/campaign/{campaign_id} | Authenticated | List campaign short URLs |

### Module: user_routes.py (prefix: /api)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/users | Super Admin | List all users (enhanced) |
| POST | /api/users | Super Admin | Create user (enhanced) |
| GET | /api/users/{user_id} | Super Admin | Get user details |
| PUT | /api/users/{user_id} | Super Admin | Update user |
| DELETE | /api/users/{user_id} | Super Admin | Delete user |

### Module: upload_routes.py (prefix: /api/uploads)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/uploads/image | Authenticated | Upload single image |
| POST | /api/uploads/images | Authenticated | Upload multiple images |
| GET | /api/uploads/images/{date_path} | Public | Serve image |
| DELETE | /api/uploads/images/{date_path} | Authenticated | Delete image |

---

## Section 7: Pydantic Models to C# DTOs

### Enums

```csharp
// From models.py
public enum UserRole { SuperAdmin, OrgAdmin, KioskVolunteer }
public enum CampaignStatus { Draft, Active, Closed, Archived }
public enum CampaignType { Open, ClosedGroup }
public enum PaymentGateway { Razorpay, Instamojo }
public enum FundCollectionMode { KaizenManaged, OrganizerDirect }
public enum PaymentCollectionMethod { Online, Offline }

// From registration_models.py
public enum PaymentStatus { Pending, Completed, Failed, Refunded, PartialRefund, NoShow }
public enum RegistrationStatus { Draft, Submitted, Confirmed, Cancelled, NoShow }

// From form_models_advanced.py
public enum FieldType { Text, Email, Phone, Number, Date, Time, DateTime, Dropdown, Radio, 
    Checkbox, FileUpload, Textarea, SectionHeader, TermsCheckbox, Rating, Slider, Matrix, 
    Name, Address, Currency, Percentage, Calculated }

// From landing_page_models.py
public enum SectionType { Hero, About, Pricing, Speakers, Schedule, Gallery, Faq, Contact }

// From payment_accounts_models.py
public enum PaymentGatewayType { Instamojo, Razorpay }

// From campaign_member_models.py
public enum MemberStatus { Unregistered, Registered }

// From fund_transfer_models.py
public enum TransferStatus { PendingApproval, Approved, Rejected, Completed }
public enum ChangeRequestType { FundTransfer, BankAccount, PaymentGateway, FundCollectionMode }
public enum ChangeRequestStatus { Pending, Approved, Rejected }
```

### Core DTOs (from models.py)

```csharp
public record UserCreateDto(string Email, string Password, string Name, 
    UserRole Role = UserRole.OrgAdmin, List<string>? CampaignAccess = null,
    bool CanApproveTransfers = false);

public record UserLoginDto(string Email, string Password);

public record UserResponseDto(string Id, string Email, string Name, UserRole Role,
    List<string> CampaignAccess, bool CanApproveTransfers, DateTime CreatedAt, bool IsActive);

public record TokenResponseDto(string AccessToken, string TokenType, UserResponseDto User);

public record CampaignCreateDto(string Name, string Slug, string OrganizationName,
    CampaignType CampaignType = CampaignType.Open, FundCollectionMode? FundCollectionMode = null,
    string PaymentCollectionMethod = "online", bool KioskEnabled = false, bool ShowOnHomepage = true,
    string? EventLogo = null, string? LogoUrl = null, bool HasLandingPage = true,
    CampaignStatus Status = CampaignStatus.Draft, DateTime? StartDate = null, DateTime? EndDate = null,
    DateTime? RegistrationStartDate = null, DateTime? RegistrationEndDate = null,
    PaymentGateway PaymentGateway = PaymentGateway.Razorpay, string? PaymentAccountId = null,
    string? PaymentPurpose = null, int? MaxRegistrations = null, string? Description = null);

public record CampaignUpdateDto(/* all fields optional, same as CampaignCreateDto */);

public record CampaignResponseDto(string Id, string Name, string Slug, string OrganizationName,
    CampaignType? CampaignType, FundCollectionMode? FundCollectionMode, string PaymentCollectionMethod,
    bool KioskEnabled, bool ShowOnHomepage, string? EventLogo, string? LogoUrl, bool HasLandingPage,
    bool RegistrationEnabled, bool UseExternalForm, string? ExternalFormUrl, CampaignStatus Status,
    DateTime? StartDate, DateTime? EndDate, DateTime? RegistrationStartDate, DateTime? RegistrationEndDate,
    PaymentGateway PaymentGateway, string? PaymentAccountId, string? PaymentPurpose,
    int? MaxRegistrations, int CurrentRegistrations, double TotalRevenue, double TotalTransferred,
    string? Description, object? FormConfig, object? PaymentConfig, object? ClosedGroupConfig,
    DateTime? CreatedAt, DateTime? UpdatedAt, string? CreatedBy, DateTime? ArchivedAt);

public record CampaignStatsDto(int TotalRegistrations, double TotalRevenue, 
    int PaidRegistrations, double RegistrationRate);

public record PasswordResetRequestDto(string Email);
public record PasswordResetConfirmDto(string Email, string ResetCode, string NewPassword);
public record UserAccessUpdateDto(string UserId, List<string> CampaignIds);
```

### Registration DTOs (from registration_models.py)

```csharp
public record RegistrationSubmissionDto(string CampaignId, Dictionary<string, object> FormData,
    double TotalAmount, string? CouponCode = null, string? MemberId = null);

public record PaymentInitiationDto(string RegistrationId, string PaymentGateway, string ReturnUrl);

public record PaymentCallbackDto(string RegistrationId, string PaymentId, string PaymentGateway,
    string Status, double Amount, Dictionary<string, object>? Metadata = null);

public record RegistrationResponseDto(string Id, string CampaignId, Dictionary<string, object> FormData,
    double TotalAmount, PaymentStatus PaymentStatus, RegistrationStatus RegistrationStatus,
    string? PaymentId, string? InvoiceNumber, DateTime CreatedAt, DateTime UpdatedAt);

public record RefundRequestDto(string RegistrationId, double Amount, string Reason);
public record RefundResponseDto(string Id, string RegistrationId, double Amount, string Status,
    string? RefundId, DateTime CreatedAt);
```

### Form DTOs (from form_models_advanced.py)

```csharp
public record FormFieldOptionDto(string Label, string Value, double? PriceModifier = 0.0,
    string? ImageUrl = null, List<string>? ConditionalFields = null);

public record NameFieldConfigDto(bool ShowFirstName = true, bool ShowMiddleName = false,
    bool ShowLastName = true, string FirstNameLabel = "First Name", /* ...etc */);

public record ValidationRuleDto(string Type, object Value, string? Message = null, string? Formula = null);
public record ConditionalLogicDto(string FieldId, string Operator, object Value, string Action,
    string? TargetFieldId = null, object? TargetValue = null);
public record RuleConditionDto(string FieldId, string Operator, object? Value = null);
public record RuleActionDto(string Action, string TargetFieldId, object? TargetValue = null);
public record FieldRuleDto(string? Id, string Name, List<RuleConditionDto> Conditions,
    string MatchType = "all", List<RuleActionDto> Actions);
public record PricingRuleDto(string Id, string Name, string Formula,
    List<ConditionalLogicDto>? Conditions = null, int Priority = 0, string? Description = null);
public record FormThemeDto(string PrimaryColor = "#7c3aed", string SecondaryColor = "#14b8a6",
    string BackgroundColor = "#ffffff", string TextColor = "#1e293b", string AccentColor = "#7c3aed",
    string ButtonStyle = "rounded", string FontFamily = "Plus Jakarta Sans",
    string CardStyle = "solid", string? Gradient = null, string PageBackground = "#f8fafc");
public record FormSettingsDto(bool AllowMultipleSubmissions = false, bool RequireLogin = false,
    bool SaveAndContinue = true, bool ShowProgressBar = true, bool ShowSubmissionNumber = true,
    bool CaptchaEnabled = false, string? RedirectUrl = null,
    string SuccessMessage = "Thank you for your submission!", bool CollectLocation = false,
    bool CollectDeviceInfo = false);

public record FormFieldDto(string Id, FieldType Type, string Label, string? Placeholder = null,
    string? HelpText = null, bool Required = false, List<FormFieldOptionDto>? Options = null,
    List<ValidationRuleDto>? ValidationRules = null, List<ConditionalLogicDto>? ConditionalLogic = null,
    List<FieldRuleDto>? FieldRules = null, object? DefaultValue = null, int Order = 0,
    string Width = "full", int Page = 1, bool IsCalculated = false, string? CalculationFormula = null,
    bool Hidden = false, bool ReadOnly = false, bool Unique = false,
    double? MinValue = null, double? MaxValue = null, string? Prefix = null, string? Suffix = null,
    NameFieldConfigDto? NameConfig = null);

public record FormConfigDto(List<FormFieldDto> Fields, double BasePrice = 0.0,
    List<PricingRuleDto>? PricingRules = null, string? PricingFormula = null,
    bool EarlyBirdEnabled = false, double? EarlyBirdPrice = null, string? EarlyBirdEndDate = null,
    bool CouponCodesEnabled = false, /* page_breaks, page_rules, field_rules, integrations,
    notifications, theme, settings, header_image, form_template_id */);

public record CouponCodeDto(string Code, string DiscountType, double DiscountValue,
    string? Formula = null, string? ValidFrom = null, string? ValidUntil = null,
    int? UsageLimit = null, int CurrentUsage = 0, bool IsActive = true,
    List<ConditionalLogicDto>? Conditions = null);
```

### Other DTOs

See the model files in Section 2 -- each Pydantic model maps directly to a C# record or class. The JSON field names must remain in camelCase for API compatibility.

---

## Section 8: Services Layer

### PaymentService (payment_service.py)

- **Razorpay Client**: Initialized with `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` env vars
- **create_razorpay_order(amount, currency="INR", receipt=None)**: Amount converted to paise (x100). Returns `{id, amount, currency, receipt, status}`
- **verify_razorpay_signature(order_id, payment_id, signature)**: Uses Razorpay SDK `utility.verify_payment_signature`
- **create_refund(payment_id, amount)**: Amount in paise. Returns `{id, payment_id, amount, status}`
- **create_instamojo_payment(amount, purpose, buyer_name, email)**: Mock implementation returning longurl
- **.NET**: Use `HttpClient` to call Razorpay REST API (or unofficial .NET SDK). Signature verification: `HMAC-SHA256(key_secret, order_id|payment_id)` compared to signature.

### InstamojoOAuthService (instamojo_oauth_service.py)

- **OAuth 2.0 Client Credentials Flow**
- **Config**: `INSTAMOJO_CLIENT_ID`, `INSTAMOJO_CLIENT_SECRET`, `INSTAMOJO_MODE` (sandbox/production)
- **URLs**: sandbox=`test.instamojo.com`, production=`api.instamojo.com`
- **Token caching**: In-memory `_access_token`, `_refresh_token`, `_token_expires_at`. Refreshes 5 min before expiry.
- **create_payment_request(amount, purpose, buyer_name, email, phone, redirect_url, webhook_url, ...)**: POST to `/v2/payment_requests/`. Returns `{success, payment_request_id, longurl, shorturl, status, amount, purpose}`
- **get_payment_request_status(payment_request_id)**: GET `/v2/payment_requests/{id}/`
- **get_payment_details(payment_id)**: GET `/v2/payments/{id}/`
- **create_refund(payment_id, refund_type="TNR", body)**: POST `/v2/payments/{id}/refund/`. Refund types: TNR, QFL, QNR, EWN, TAN, PTH
- **Phone normalization**: Strip spaces, dashes, +91 prefix, leading zeros; take last 10 digits

### SettlementService (settlement_service.py)

- **get_instamojo_payment_details(api_key, auth_token, payment_id, mode)**: Legacy API key auth. GET `/api/1.1/payments/{id}/`. Returns `{payment_id, amount, fees, settlement_amount, status, settled}`. Settled when status=="Credit".
- **get_razorpay_payment_details(key_id, key_secret, payment_id)**: Razorpay SDK `payment.fetch()`. Amounts in paise divided by 100. Returns `{payment_id, amount, fees, tax, settlement_amount, status, settled, method, bank, wallet, vpa}`
- **get_razorpay_settlements(key_id, key_secret, from_date, to_date, count)**: Razorpay SDK `settlement.all()`. Returns list of `{settlement_id, amount, status, fees, tax, utr, created_at}`
- **sync_payment_settlement_data(db, payment_id)**: Fetches from gateway, updates payment record with `gateway_fee, gateway_tax, settlement_amount, settlement_status, settlement_synced_at`
- **sync_campaign_settlements(db, campaign_id)**: Syncs all completed payments for a campaign
- **get_campaign_settlement_summary(db, campaign_id)**: Returns `{total_collected, gateway_fees, gateway_settled, gateway_pending}`. Estimates 2% fee if not synced.

### InvoiceService (invoice_service.py)

- **generate_invoice_pdf(registration_data, campaign_data) -> bytes**: Uses ReportLab
- **Page size**: A4
- **Layout**:
  1. Title: "TAX INVOICE" (24pt, purple #7c3aed, centered)
  2. Details table: Invoice Number, Invoice Date, Campaign
  3. "Billing Details" heading
  4. Items table: Description ("Registration Fee"), Amount (INR with rupee symbol). Purple header row, beige data row.
  5. Total: Bold purple right-aligned
  6. Footer: "Thank you for your registration!" + organization name
- **.NET**: Use QuestPDF to replicate this layout

### FormulaEngine (formula_engine.py)

- **SecureExpressionParser**: AST-based, no `eval()`. Python `ast.parse(expression, mode='eval')` then recursive evaluation.
- **Operators**: +, -, *, /, //, %, ** (and unary +, -)
- **Comparisons**: ==, !=, <, <=, >, >=
- **Functions**: sum, avg, min, max, abs, round, ceil, floor, sqrt, pow
- **If syntax**: `if(condition, true_val, false_val)` converted to Python ternary before parsing. Supports nesting (max 10 iterations).
- **Field references**: `${field_id}` replaced with numeric values from `field_values` dict
- **Safety limits**: Max 1000 chars, max depth 20, safe character whitelist regex
- **Division by zero**: Returns 0
- **Key methods**:
  - `parse_formula(formula, field_values) -> float`
  - `validate_formula(formula, available_fields) -> {valid, test_result, fields_used, error}`
  - `evaluate_condition(condition, field_values) -> bool` -- Supports: equals, not_equals, contains, not_contains, greater_than, less_than, greater_equal, less_equal, between, is_empty, is_not_empty, starts_with, ends_with
  - `apply_pricing_rules(base_price, field_values, pricing_rules, pricing_formula) -> {base_price, total_price, applied_rules}`
  - `calculate_field_value(field, field_values) -> value`
- **.NET**: Use NCalc or write a custom expression parser. The AST approach can be replicated with `System.Linq.Expressions` or Roslyn scripting.

### AuditLogger (audit_log.py)

- **Dual logging**: File (`audit.log`) + MongoDB (`audit_logs` collection)
- **Hash chain integrity**: Each log entry has `integrity_hash = SHA-256(entry + previous_hash)`
- **Email masking**: `john.doe@example.com` -> `j******e@example.com`
- **Field redaction**: Keys containing `password, token, secret, key, credential, card_number, cvv, pin, account_number` are replaced with `[REDACTED]`
- **30+ event types** -- see `AuditEventType` class in Appendix A
- **Convenience methods**: `log_login_success`, `log_login_failed`, `log_payment`, `log_fund_transfer`, `log_security_event`

### Integration Services (integration_service.py)

**InteraktService (WhatsApp)**:
- API: `https://api.interakt.ai/v1/public`
- Auth: `Authorization: Basic {INTERAKT_SECRET_KEY}`
- `send_template_message(phone, country_code, template_name, body_values, header_values, button_values)`: POST to `/message/` with template payload
- Templates used: `event_registration_confirmation` (body: name, event_name, amount, registration_id), `payment_reminder` (body: name, event_name, amount)
- Phone normalization: strip leading zeros, spaces, dashes, +; remove country code prefix

**BrevoService (Email)**:
- API: `https://api.brevo.com/v3`
- Auth: `api-key: {BREVO_API_KEY}`
- `send_email(to_email, to_name, subject, html_content, sender_email, sender_name, cc, bcc, reply_to)`: POST to `/smtp/email`
- `send_registration_confirmation(...)`: Generates HTML email template with gradient header (#7c3aed to #14b8a6), registration details box

**GoogleSheetsService**:
- Auth: Service account with domain-wide delegation (`google.oauth2.service_account`)
- Scopes: `spreadsheets`, `drive`
- `create_spreadsheet(title, sheet_name, delegate_email)`: Creates in delegate user's Drive
- `share_spreadsheet(spreadsheet_id, email, role)`: Via Drive API permissions
- `setup_campaign_sheet(sheet_name, owner_email, campaign_name)`: Create + headers in owner's Drive
- `append_row(spreadsheet_id, sheet_name, values, delegate_email)`: Sheets API values.append
- `sync_registration(...)`: Builds row: [Registration ID (8 chars uppercase), Date, Name, Email, Phone, Payment Status, Amount, Payment ID, Campaign]
- Headers: Registration ID, Date, Name, Email, Phone, Payment Status, Amount, Payment ID, Campaign

---

## Section 9: Middleware Stack

### Execution Order (FastAPI/Starlette)
Middleware is added bottom-to-top in `server.py`, so execution order is:

1. **CORSMiddleware** (outermost -- first to process request, last to process response)
   - `allow_credentials=True`
   - `allow_origins`: From `CORS_ORIGINS` env var (comma-separated), fallback to `["https://kioskflow.preview.emergentagent.com", "http://localhost:3000", "http://127.0.0.1:3000"]`
   - `allow_methods`: GET, POST, PUT, DELETE, OPTIONS
   - `allow_headers`: Authorization, Content-Type, Accept, X-CSRF-Token, X-Request-Timestamp, X-Request-Signature
   - `expose_headers`: X-Request-Id
   - `max_age`: 600 (10 min preflight cache)

2. **RateLimitMiddleware** -- See Section 4

3. **SuspiciousActivityMiddleware** -- See Section 4

4. **SecurityHeadersMiddleware** (innermost -- closest to route handler)

### .NET Equivalent

```csharp
// In Program.cs, order matters (first added = outermost):
app.UseCors("AllowSpecificOrigins");
app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<RateLimitMiddleware>();
app.UseMiddleware<SuspiciousActivityMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
```

---

## Section 10: Business Logic Rules

### Campaign Lifecycle
1. Only Super Admin can create campaigns
2. Status transitions: Draft -> Active -> Archived (via archive). Archived -> Active (via unarchive). Only active campaigns can be archived.
3. Registration is allowed when: `status == active` AND `registration_enabled == true` AND within registration date window (if set) AND `current_registrations < max_registrations` (if set)
4. Slug must be lowercase alphanumeric + hyphens only, unique

### Registration + Payment Flow
1. **Submit**: Validate campaign active + not full. For closed_group, verify member exists + not already registered. Apply coupon if provided (percentage or fixed discount). Create registration with status=SUBMITTED, payment_status=PENDING. Auto-sync to Google Sheets if configured. Update member status for closed_group.
2. **Payment Initiate**: Create gateway order (Razorpay) or payment request (Instamojo). Store payment record.
3. **Payment Verify/Callback**: Verify signature (Razorpay: HMAC-SHA256, Instamojo: HMAC-SHA1 MAC). Update payment + registration status. Increment campaign `current_registrations` and `total_revenue`. Update payment account stats. Fetch gateway fees in background.
4. **Invoice**: Generated on demand as PDF for completed payments only.
5. **Registration Update**: If amount increased, generate additional payment link via campaign's gateway. If decreased, flag refund_pending and email Super Admins + Directors.

### Pricing Calculation
1. Start with `base_price` from form config
2. Apply pricing rules (sorted by priority descending): each rule has conditions and a formula. If all conditions met, evaluate formula and add to total.
3. Apply master `pricing_formula` if set (receives base_price and current_total as variables)
4. Apply coupon: percentage discount = `subtotal * (value/100)`, fixed discount = `min(value, subtotal)`
5. Final price = `max(0, subtotal - discount)`, rounded to 2 decimal places
6. Server-side validation: total_amount in submission should match server calculation

### Fund Transfer Workflow
1. **Platform fee**: 2.95% of (total_collected - gateway_charges)
2. **net_payable** = gateway_settled - platform_fee
3. **pending_transfer** = net_payable - total_transferred
4. **Create transfer request**: Cannot exceed pending_transfer. Status = pending_approval. Snapshots bank account details.
5. **Director approval**: Director (can_approve_transfers=True) reviews and approves/rejects
6. **Completion**: Super Admin marks as completed with transaction reference and date. Optionally sends email notification to organizer's bank notification_email.
7. **Change requests**: For bank account, payment gateway, or fund collection mode changes. Same approval workflow.

### Closed Group Rules
1. Members uploaded via CSV/Excel with column mapping (name, mobile required; email, custom fields optional)
2. Mobile number is normalized and used for duplicate detection
3. Members can be individually added, updated, deleted
4. Registration: member found by member_id, verified to exist and not already registered
5. Status tracking: unregistered -> registered (with registration_id and registered_at)
6. Bulk/single reminders via email and/or WhatsApp to unregistered members
7. Public member lookup by phone for self-service registration

### Kiosk Rules
1. Kiosk mode enabled per-campaign via `kiosk_enabled` flag (for online payment campaigns) or `payment_collection_method == "offline"`
2. Kiosk volunteer role: can only access assigned campaigns in kiosk mode
3. Search by name/email/phone across campaign registrations
4. Register: submit form data, generate OTP, send via WhatsApp/email
5. OTP verification: 6-digit code, expires in 10 minutes
6. Cash confirmation: mark payment as collected by volunteer
7. Check-in: mark attendance for already-registered participants

### Access Control Matrix

| Role | Capabilities |
|------|-------------|
| Super Admin | Full access to everything: all campaigns, all users, all settings, create/update/delete anything |
| Org Admin | View/manage assigned campaigns only. Cannot create campaigns or manage users/settings |
| Director | Same as Org Admin + can approve/reject fund transfers and change requests (identified by `can_approve_transfers=True`) |
| Kiosk Volunteer | Kiosk mode only: search, register, confirm payment, check-in for assigned campaigns |

---

## Section 11: External Service Integrations

### Razorpay
- **SDK**: `razorpay` Python package (v1.4.2)
- **Auth**: Key ID + Key Secret (basic auth)
- **Order creation**: POST with amount in paise (INR x 100), currency, receipt, notes
- **Signature verification**: HMAC-SHA256 of `{order_id}|{payment_id}` with key_secret
- **Refund**: `payment.refund(payment_id, amount_paise)`
- **Payment details**: `payment.fetch(payment_id)` -- returns amount, fee, tax in paise
- **Settlements**: `settlement.all(params)` -- returns items with amount, fees, tax, utr
- **Payment Links**: `payment_link.create(data)` -- used for additional payments
- **.NET**: Use `HttpClient` with Basic Auth header, or unofficial Razorpay .NET SDK

### Instamojo
- **Two auth modes**:
  1. OAuth 2.0 (preferred): Client credentials flow via `/oauth2/token/`. Bearer token auth for API calls.
  2. Legacy: API Key + Auth Token headers (`X-Api-Key`, `X-Auth-Token`)
- **Payment request**: POST to `/v2/payment_requests/` (OAuth) or `/api/1.1/payment-requests/` (legacy)
- **Webhook verification**: HMAC-SHA1 of sorted payload values joined by `|`, using salt as key
- **Webhook payload fields**: payment_request_id, payment_id, status (Credit=success), amount, buyer, buyer_name, buyer_phone, purpose, mac
- **Redirect callback**: Query params: payment_id, payment_request_id, payment_status
- **Refund types**: TNR (Transaction Not Required), QFL (Quality Issue), QNR, EWN, TAN, PTH
- **.NET**: Use `HttpClient` for all Instamojo API calls

### Brevo (Email)
- **API**: `https://api.brevo.com/v3/smtp/email`
- **Auth**: `api-key` header
- **Payload**: `{sender: {name, email}, to: [{email, name}], subject, htmlContent, cc?, bcc?, replyTo?}`
- **DKIM**: Via Brevo Senders API (`/v3/senders/domains`) for custom domain verification
- **.NET**: Use `HttpClient`. No official .NET SDK needed.

### Interakt (WhatsApp)
- **API**: `https://api.interakt.ai/v1/public/message/`
- **Auth**: `Authorization: Basic {api_key}`
- **Payload**: `{countryCode, phoneNumber, type: "Template", template: {name, languageCode, bodyValues, headerValues, buttonValues}}`
- **Templates**: Pre-approved in Interakt dashboard. Used: `event_registration_confirmation`, `payment_reminder`
- **.NET**: Use `HttpClient`

### Google Sheets + Drive
- **Auth**: Service account JSON credentials with domain-wide delegation
- **Scopes**: `spreadsheets`, `drive`
- **Operations**: Create spreadsheet (via Sheets API), share (via Drive API), append rows, setup headers
- **Domain-wide delegation**: `credentials.with_subject(delegate_email)` to impersonate users
- **.NET**: `Google.Apis.Sheets.v4`, `Google.Apis.Drive.v3`, `Google.Apis.Auth` NuGet packages

---

## Section 12: Environment Variables

### Current Backend (.env)

| Variable | Description |
|----------|-------------|
| MONGO_URL | MongoDB connection string |
| DB_NAME | MongoDB database name |
| JWT_SECRET_KEY | JWT signing secret for access tokens |
| JWT_REFRESH_SECRET | JWT signing secret for refresh tokens |
| ENCRYPTION_KEY | AES encryption key material |
| REQUEST_SIGNING_KEY | HMAC key for request signing |
| CORS_ORIGINS | Comma-separated allowed origins |
| FRONTEND_URL | Frontend base URL |
| REACT_APP_BACKEND_URL | Backend URL (used for redirect calculations) |
| DISABLE_DOCS | Set to disable Swagger/ReDoc |
| RAZORPAY_KEY_ID | Razorpay API key ID |
| RAZORPAY_KEY_SECRET | Razorpay API key secret |
| INSTAMOJO_CLIENT_ID | Instamojo OAuth client ID |
| INSTAMOJO_CLIENT_SECRET | Instamojo OAuth client secret |
| INSTAMOJO_MODE | "sandbox" or "production" |
| BREVO_API_KEY | Brevo (Sendinblue) API key |
| INTERAKT_SECRET_KEY | Interakt WhatsApp API key |
| GOOGLE_SHEETS_CREDENTIALS | Google service account JSON (stringified) |
| AUDIT_LOG_PATH | Path for audit log file (default: /var/log/supervisor/audit.log) |

### .NET appsettings.json Mapping

```json
{
  "ConnectionStrings": {
    "MySQL": "Server=localhost;Port=3306;Database=kaizen_events;User=root;Password=..."
  },
  "Jwt": {
    "SecretKey": "<JWT_SECRET_KEY>",
    "RefreshSecret": "<JWT_REFRESH_SECRET>",
    "AccessTokenMinutes": 30,
    "RefreshTokenDays": 7,
    "Algorithm": "HS256"
  },
  "Encryption": {
    "Key": "<ENCRYPTION_KEY>",
    "Salt": "kaizen_security_salt_v1",
    "Iterations": 480000
  },
  "RequestSigning": {
    "Key": "<REQUEST_SIGNING_KEY>"
  },
  "Razorpay": {
    "KeyId": "<RAZORPAY_KEY_ID>",
    "KeySecret": "<RAZORPAY_KEY_SECRET>"
  },
  "Instamojo": {
    "ClientId": "<INSTAMOJO_CLIENT_ID>",
    "ClientSecret": "<INSTAMOJO_CLIENT_SECRET>",
    "Mode": "sandbox"
  },
  "Brevo": {
    "ApiKey": "<BREVO_API_KEY>"
  },
  "Interakt": {
    "SecretKey": "<INTERAKT_SECRET_KEY>"
  },
  "Google": {
    "ServiceAccountJson": "<GOOGLE_SHEETS_CREDENTIALS>"
  },
  "Cors": {
    "Origins": ["http://localhost:3000", "https://yourdomain.com"]
  },
  "App": {
    "FrontendUrl": "https://yourdomain.com",
    "DisableDocs": false
  },
  "Logging": {
    "AuditLogPath": "logs/audit.log"
  }
}
```

---

## Section 13: Frontend Integration Points

### API Configuration
- **Base URL**: `REACT_APP_BACKEND_URL` + `/api` (e.g., `https://example.com/api`)
- **Auth**: Axios interceptor attaches `Authorization: Bearer <token>` to all requests
- **401 handling**: Auto-redirects to `/login` on 401 response
- **Token storage**: `localStorage` (access_token + user object)

### Critical Response Format Preservation
The frontend expects exact JSON field names (camelCase in JavaScript). The Python backend returns snake_case from Pydantic models. FastAPI auto-converts to camelCase in many cases, but the actual response uses the Pydantic field names.

**IMPORTANT**: The .NET backend must return the same field names as the Python backend. Configure `System.Text.Json` with `PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower` or use `[JsonPropertyName]` attributes to match exactly.

### Key Frontend API Calls by Page

**Login Page**: `POST /api/auth/login`
**Dashboard**: `GET /api/dashboard/stats`, `GET /api/campaigns`
**Campaign Detail**: `GET /api/campaigns/{id}`, `GET /api/campaigns/{id}/stats`, `GET /api/campaigns/{id}/registrations`
**Form Builder**: `GET /api/campaigns/{id}/form`, `PUT /api/campaigns/{id}/form`, `POST /api/formula/validate`
**Landing Page Builder**: `GET /api/campaigns/{id}/landing-page`, `PUT /api/campaigns/{id}/landing-page`
**Public Registration**: `GET /api/public/campaigns/{slug}`, `POST /api/campaigns/{id}/calculate-price`, `POST /api/registrations/submit`, `POST /api/payments/create`, `POST /api/payments/verify/razorpay`
**Payment Accounts**: `GET /api/payment-accounts`, `POST /api/payment-accounts`, etc.
**Fund Transfers**: `GET /api/fund-transfers/stats`, `GET /api/fund-transfers/campaign/{id}/summary`, etc.
**Analytics**: `GET /api/campaigns/{id}/analytics`, `GET /api/campaigns/{id}/export/csv`
**Notifications**: `POST /api/notifications/send`, `GET /api/notifications/settings/{id}`
**Google Sheets**: `POST /api/integrations/sheets/create-campaign-sheet`, `POST /api/integrations/sheets/sync`
**Public Events**: `GET /api/public/events`

---

## Section 14: Deployment & Infrastructure

### Current Docker Setup

**docker-compose.dev.yml**: MongoDB (port 27017) + Mongo Express (port 8081)

**docker-compose.yml (production)**:
- MongoDB container
- Backend container (FastAPI/Uvicorn on port 8001)
- Frontend container (React build served by Nginx)
- Nginx reverse proxy (ports 80/443)
- Certbot for SSL

### .NET Migration

Replace the backend container:

```dockerfile
# Backend Dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8001

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish "KaizenEvents.API/KaizenEvents.API.csproj" -c Release -o /app/publish

FROM base AS final
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "KaizenEvents.API.dll"]
```

Add MySQL container replacing MongoDB:

```yaml
mysql:
  image: mysql:8.0
  environment:
    MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    MYSQL_DATABASE: kaizen_events
  ports:
    - "3306:3306"
  volumes:
    - mysql_data:/var/lib/mysql
```

### Nginx Config
- `proxy_pass http://backend:8001;` stays the same (or adjust port)
- Backend serves on Kestrel port 8001: `"Kestrel": { "Endpoints": { "Http": { "Url": "http://0.0.0.0:8001" } } }`

### Health Check
- `GET /health` must return: `{"status": "healthy", "service": "Kaizen Events API"}`

### Startup Tasks
1. Run EF Core migrations (`dotnet ef database update`)
2. Seed admin user if not exists
3. Create database indexes (handled by EF Core migrations)

---

## Section 15: Data Migration Plan

### Step 1: Export MongoDB Collections
```bash
mongoexport --db kaizen_events --collection users --out users.json --jsonArray
# Repeat for all collections
```

### Step 2: Transform Data
For each collection:
1. **ObjectId to UUID**: MongoDB `_id` fields are discarded; the `id` field (already UUID string) becomes the primary key
2. **Flatten embedded arrays**: `campaign_access` list on users -> `user_campaign_access` junction table
3. **ISO strings to DateTime**: Parse all ISO 8601 timestamp strings
4. **JSON columns**: `form_data`, `form_config`, `landing_page_config`, `payment_config`, `closed_group_config`, `custom_fields`, `bank_account_snapshot`, `current_value`, `new_value`, `action_details`, `raw_payload` stay as JSON
5. **Encrypt sensitive fields**: Re-encrypt using .NET encryption (payment credentials, account numbers)
6. **Enum conversion**: String enum values map directly (snake_case)

### Step 3: Load into MySQL
Use a migration script (C# console app or Python script) that:
1. Creates all tables via EF Core migrations
2. Reads JSON exports
3. Transforms and inserts data with proper foreign key ordering:
   - users first
   - campaigns (depends on users via created_by)
   - payment_accounts (depends on users)
   - registrations (depends on campaigns)
   - payments (depends on campaigns, registrations, payment_accounts)
   - All other tables

### Step 4: Verification
- Count comparison: documents in MongoDB vs rows in MySQL per table
- Spot-check data integrity: random sampling of records
- Verify JSON columns parse correctly
- Test all API endpoints against migrated data

### Step 5: Rollback Strategy
- Keep MongoDB running in parallel during transition
- Feature flag to switch between backends
- Point frontend to old backend URL to rollback

---

## Section 16: NuGet Package Mapping

| Python Package | .NET Equivalent |
|---------------|-----------------|
| fastapi 0.128.0 + uvicorn 0.25.0 | ASP.NET Core 8 (built-in) |
| motor 3.7.1 + pymongo 4.10.1 | Pomelo.EntityFrameworkCore.MySql 8.x |
| pydantic 2.12.5 | FluentValidation + System.ComponentModel.DataAnnotations |
| python-jose 3.5.0 + PyJWT 2.10.1 | System.IdentityModel.Tokens.Jwt + Microsoft.AspNetCore.Authentication.JwtBearer |
| passlib 1.7.4 (bcrypt) | BCrypt.Net-Next |
| cryptography 46.0.3 (Fernet) | System.Security.Cryptography (AES + PBKDF2) or Fernet.Net |
| razorpay 1.4.2 | HttpClient (REST calls) or Razorpay.NET (unofficial) |
| instamojo-wrapper 1.2.0 | HttpClient |
| sib-api-v3-sdk 7.6.0 | HttpClient (Brevo REST API) |
| google-auth 2.41.1 + google-api-python-client 2.187.0 | Google.Apis.Sheets.v4 + Google.Apis.Drive.v3 + Google.Apis.Auth |
| reportlab 4.0.7 | QuestPDF |
| pillow 12.1.0 | SixLabors.ImageSharp |
| pandas 2.3.3 + openpyxl 3.1.5 | CsvHelper + ClosedXML |
| httpx 0.28.1 | HttpClient (built-in) |
| requests 2.32.5 | HttpClient (built-in) |
| python-multipart 0.0.21 | ASP.NET Core file handling (built-in) |
| aiofiles 23.2.1 | System.IO async (built-in) |
| python-dotenv 1.2.1 | ASP.NET Core configuration (built-in) |
| starlette 0.50.0 | ASP.NET Core middleware (built-in) |
| email-validator 2.3.0 | System.ComponentModel.DataAnnotations.EmailAddressAttribute |
| boto3 1.42.16 | AWSSDK.S3 (if S3 storage is used) |
| Authlib 1.6.6 | No direct equivalent; use HttpClient for OAuth flows |

---

## Section 17: Appendices

### Appendix A: Complete Enum Reference

**AuditEventType (30+ events)**:
```
LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT,
PASSWORD_RESET_REQUEST, PASSWORD_RESET_COMPLETE,
USER_CREATED, USER_UPDATED, USER_DELETED, USER_ROLE_CHANGED,
CAMPAIGN_CREATED, CAMPAIGN_UPDATED, CAMPAIGN_DELETED, CAMPAIGN_ARCHIVED,
LANDING_PAGE_CREATED, LANDING_PAGE_UPDATED, LANDING_PAGE_PUBLISHED, LANDING_PAGE_DELETED,
REGISTRATION_CREATED, REGISTRATION_UPDATED, REGISTRATION_DELETED,
PAYMENT_INITIATED, PAYMENT_VERIFIED, PAYMENT_FAILED, PAYMENT_REFUNDED, PAYMENT_RECEIVED,
REFUND_INITIATED, REFUND_COMPLETED,
TRANSFER_CREATED, TRANSFER_APPROVED, TRANSFER_REJECTED, TRANSFER_COMPLETED,
BANK_ACCOUNT_CREATED, BANK_ACCOUNT_UPDATED, BANK_ACCOUNT_DELETED,
FORM_UPDATED, SETTINGS_UPDATED,
DATA_EXPORT, DATA_IMPORT, SENSITIVE_DATA_ACCESS,
RATE_LIMIT_EXCEEDED, UNAUTHORIZED_ACCESS, SUSPICIOUS_ACTIVITY
```

**UserRole**: `super_admin`, `org_admin`, `kiosk_volunteer`

**CampaignStatus**: `draft`, `active`, `closed`, `archived`

**CampaignType**: `open`, `closed_group`

**PaymentGateway**: `razorpay`, `instamojo`

**FundCollectionMode**: `kaizen_managed`, `organizer_direct`

**PaymentCollectionMethod**: `online`, `offline`

**PaymentStatus**: `pending`, `completed`, `failed`, `refunded`, `partial_refund`, `no_show`

**RegistrationStatus**: `draft`, `submitted`, `confirmed`, `cancelled`, `no_show`

**FieldType (advanced)**: `text`, `email`, `phone`, `number`, `date`, `time`, `datetime`, `dropdown`, `radio`, `checkbox`, `file_upload`, `textarea`, `section_header`, `terms_checkbox`, `rating`, `slider`, `matrix`, `name`, `address`, `currency`, `percentage`, `calculated`

**SectionType**: `hero`, `about`, `pricing`, `speakers`, `schedule`, `gallery`, `faq`, `contact`

**PaymentGatewayType**: `instamojo`, `razorpay`

**MemberStatus**: `unregistered`, `registered`

**TransferStatus**: `pending_approval`, `approved`, `rejected`, `completed`

**ChangeRequestType**: `fund_transfer`, `bank_account`, `payment_gateway`, `fund_collection_mode`

**ChangeRequestStatus**: `pending`, `approved`, `rejected`

### Appendix B: MongoDB to MySQL Index Mapping

| MongoDB Collection | MongoDB Index | MySQL Equivalent |
|-------------------|---------------|------------------|
| audit_logs | TTL on timestamp (2 years) | Scheduled event: DELETE WHERE timestamp < NOW() - INTERVAL 2 YEAR |
| audit_logs | (event_type, timestamp) | INDEX idx_audit_event_type |
| audit_logs | (user_id, timestamp) | INDEX idx_audit_user |
| audit_logs | (resource_type, resource_id) | INDEX idx_audit_resource |
| users | email (unique) | UNIQUE KEY on email column |
| campaigns | slug (unique) | UNIQUE KEY on slug column |
| campaigns | id | PRIMARY KEY |
| registrations | campaign_id | INDEX idx_registrations_campaign |
| payments | gateway_payment_request_id | INDEX idx_payments_gateway_request |
| payments | campaign_id + status | Composite INDEX |
| campaign_members | (campaign_id, mobile) | UNIQUE KEY uk_members_campaign_mobile |

### Appendix C: Formula Engine Syntax Reference

**Grammar** (informal):
```
expression := term (('+' | '-') term)*
term       := factor (('*' | '/' | '//' | '%') factor)*
factor     := base ('**' factor)?
base       := NUMBER | '-' base | '+' base | '(' expression ')' | function_call | if_expr
function_call := FUNC_NAME '(' expression (',' expression)* ')'
if_expr    := 'if' '(' expression ',' expression ',' expression ')'

FUNC_NAME  := 'sum' | 'avg' | 'min' | 'max' | 'abs' | 'round' | 'ceil' | 'floor' | 'sqrt' | 'pow'
NUMBER     := integer | float

Field references: ${field_id} -- replaced before parsing
Special fields: ${base_price}, ${current_total}
```

**Examples**:
- `${field_1} * ${field_2} + 100`
- `if(${field_1} > 1000, ${field_1} * 0.9, ${field_1})`
- `sum(${field_1}, ${field_2}, ${field_3})`
- `round(${base_price} * 1.18, 2)` (add 18% GST)
- `if(${quantity} >= 10, ${base_price} * 0.85, if(${quantity} >= 5, ${base_price} * 0.9, ${base_price}))`

**Condition operators**: equals, not_equals, contains, not_contains, greater_than, less_than, greater_equal, less_equal, between (takes [min, max] array), is_empty, is_not_empty, starts_with, ends_with

### Appendix D: Webhook Payload Formats

**Razorpay Payment Verification** (POST /api/payments/verify/razorpay):
```json
{
  "razorpay_payment_id": "pay_xxxxxxxxxxxxx",
  "razorpay_order_id": "order_xxxxxxxxxxxxx",
  "razorpay_signature": "hex_hmac_sha256_signature",
  "payment_id": "our-internal-uuid"
}
```

Signature: `HMAC-SHA256(key_secret, "order_id|payment_id")`

**Instamojo Webhook** (POST /api/payments/webhook/instamojo, form-encoded):
```
payment_request_id=<instamojo_request_id>
payment_id=<instamojo_payment_id>
status=Credit  (or Failed)
amount=1000.00
buyer=buyer@email.com
buyer_name=John Doe
buyer_phone=9876543210
purpose=Event Registration
mac=<hmac_sha1_hex>
```

MAC verification: Sort payload keys (excluding mac), join values with `|`, HMAC-SHA1 with salt.

**Instamojo Redirect Callback** (GET /api/payments/callback/instamojo):
Query params: `payment_id`, `payment_request_id`, `payment_status`

### Appendix E: Invoice PDF Layout Specification

**Page**: A4 (210mm x 297mm)
**Font**: Helvetica (built-in ReportLab font)
**Brand Color**: #7c3aed (purple)

**Layout top to bottom**:
1. **Title**: "TAX INVOICE" -- 24pt, #7c3aed, centered, 30pt space after
2. **Details section** (left-aligned table, 2 columns: label 2in, value 4in):
   - "Invoice Number:" | INV-YYYYMMDD-XXXXXXXX
   - "Invoice Date:" | DD Month YYYY
   - "Campaign:" | campaign name
3. **Spacer** (0.4in)
4. **"Billing Details"** heading (Heading2 style)
5. **Items table** (2 columns: Description 4in, Amount 2in):
   - Header row: purple background (#7c3aed), white text, bold 12pt
   - Data row: beige background, black grid lines
   - Row: "Registration Fee" | "INR X,XXX.XX" (with rupee symbol)
6. **Spacer** (0.3in)
7. **Total line**: "Total Amount: INR X,XXX.XX" -- 14pt, bold, #7c3aed, right-aligned
8. **Spacer** (0.5in)
9. **Footer** (centered, 9pt, grey):
   - "Thank you for your registration!"
   - "Kaizen Events - {organization_name}"

---

*End of Migration Guide*
