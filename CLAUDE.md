# CLAUDE.md — Kaizen Events: .NET 8 + MySQL 8 Backend

> This file is read automatically by Claude Code at the start of every session.
> It provides full project context so you never need to re-explain the stack, architecture, or rules.

---

## 1. Project Overview

**Kaizen Events** is a self-hosted event registration and management platform (alternative to Zoho Forms).
It is a **live, in-production** application. The backend was originally migrated from a Python/FastAPI +
MongoDB backend to **.NET 8 + MySQL 8**; that migration is complete and the app has since grown new
modules (Cashfree gateway + vendor splits, Razorpay Route, per-campaign email templates, Instamojo finance
archive). The **React 19 frontend is actively edited** — it lives at
`python-sourcecode-ref/Kaizen-Events-main/frontend/` and, despite the "read-only reference" label some older
notes use, is the live app the team ships (see Section 17).

### Non-Negotiable Constraints
- **All API endpoint paths must match exactly** (the React frontend is hardcoded to these paths)
- **All JSON response field names must be snake_case** (frontend expects Python-style naming)
  - Configure `JsonNamingPolicy.SnakeCaseLower` globally in `Program.cs`
- **All HTTP status codes must match** the original Python routes
- **Business logic and validation rules must be preserved exactly** — see Section 8

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | C# 12 / .NET 8 |
| Web Framework | ASP.NET Core 8 Web API (not Minimal API) |
| Database | MySQL 8 via Entity Framework Core 8 |
| EF Provider | Pomelo.EntityFrameworkCore.MySql |
| Auth | Microsoft.AspNetCore.Authentication.JwtBearer + BCrypt.Net-Next |
| Validation | FluentValidation |
| PDF Generation | QuestPDF |
| CSV/Excel | CsvHelper + ClosedXML |
| Image Processing | SixLabors.ImageSharp |
| Google APIs | Google.Apis.Sheets.v4 + Google.Apis.Drive.v3 + Google.Apis.Auth |
| Serialization | System.Text.Json (snake_case policy) |
| HTTP Clients | Built-in HttpClient (for Razorpay, Instamojo, Brevo, Interakt) |

---

## 3. Solution Structure

```
KaizenEvents.sln
├── KaizenEvents.API/                   # ASP.NET Web API — controllers, middleware, Program.cs
│   ├── Controllers/                    # One controller per domain module (see Section 5)
│   │   └── ApiControllerBase.cs        # Base class — auth helpers (CurrentUserId, IsSuperAdmin, IsAdminRole, Forbidden(), GetBearerToken()); authorization is done in-controller via these, NOT an MVC filter
│   ├── Middleware/                     # Security, exception handling, request signing (see Section 10)
│   ├── Helpers/                        # CampaignNumberSequence, RegistrantUploadNaming
│   └── Program.cs                      # App bootstrap, DI registration, middleware pipeline
│
├── KaizenEvents.Core/                  # Domain layer — no infrastructure dependencies
│   ├── Entities/                       # EF Core entity classes (DB models)
│   ├── DTOs/                           # Request/Response classes, grouped by domain
│   ├── Enums/                          # All enums (see Section 6)
│   └── Interfaces/                     # Service and repository contracts
│
├── KaizenEvents.Infrastructure/        # Data access + external service implementations
│   ├── Data/
│   │   ├── AppDbContext.cs
│   │   └── Migrations/
│   ├── Repositories/
│   └── Services/                       # JWT, encryption, payment, audit, email, etc.
│
└── KaizenEvents.Shared/                # Pure utilities, no DI dependencies
    ├── Helpers/                        # Sanitization, validation, slug generation
    └── Constants/
```

---

## 4. Database: MySQL 8

### Key Design Rules
- All IDs are `CHAR(36)` UUIDs (not auto-increment, except `audit_logs` which is `BIGINT AUTO_INCREMENT`)
- All timestamps use `DATETIME(6)` (microsecond precision)
- Dynamic/nested data stays as `JSON` columns: `form_data`, `form_config`, `landing_page_config`, `payment_config`, `closed_group_config`, `custom_fields`, `action_details`, `raw_payload`
- Sensitive fields (payment credentials, account numbers) are **AES-encrypted** before storage
- All string enums stored as MySQL `ENUM(...)` types
- Charset: `utf8mb4` on all tables

### All 24 Tables (in dependency order for migrations)
1. `users`
2. `payment_accounts`
3. `campaigns` (FK → users, payment_accounts)
4. `user_campaign_access` (junction: users ↔ campaigns)
5. `registrations` (FK → campaigns)
6. `payments` (FK → campaigns, registrations, payment_accounts)
7. `campaign_members` (FK → campaigns, registrations, users)
8. `fund_transfers` (FK → campaigns, users)
9. `bank_accounts` (FK → campaigns, users)
10. `change_requests` (FK → campaigns, users)
11. `coupon_codes` (FK → campaigns)
12. `audit_logs` (standalone, BIGINT PK) — also read by `ActivityLogController` (no separate activity_logs table)
13. `notification_logs` (FK → campaigns)
14. `notification_settings` (FK → campaigns) — includes `resend_api_key TEXT NULL` and `sender_email VARCHAR(254) NULL` (encrypted)
15. `sheets_configs` (FK → campaigns)
16. `dkim_domains` — includes `resend_api_key TEXT NULL` (encrypted, never returned in API responses)
17. `email_senders`
18. `kiosk_volunteers` (FK → users) — `campaign_ids JSON NOT NULL DEFAULT '[]'` (no separate junction table)
19. `url_shortcuts` (FK → campaigns) — includes `url_type VARCHAR(20)` ("registration"|"kiosk"), `last_clicked DATETIME(6) NULL`, field is `clicks` not `click_count`
20. `password_resets`
21. `refunds` (FK → registrations)
22. `orphan_payments`
23. `contact_inquiries`
24. `integration_settings`

### Critical Index: Audit Log TTL
MySQL has no TTL index. Implement a hosted service (`IHostedService`) to delete audit_logs records older than 2 years, running on a daily schedule.

---

## 5. Controllers → Python File Mapping

| Controller | Source Python File |
|------------|-------------------|
| `AuthController` | `server.py` (auth routes) |
| `CampaignController` | `server.py` (campaign routes) |
| `DashboardController` | `server.py` (dashboard routes) |
| `UserController` | `user_routes.py` + `server.py` (user routes) |
| `RegistrationController` | `registration_routes.py` |
| `FormController` | `form_routes.py` |
| `LandingPageController` | `landing_page_routes.py` |
| `PaymentController` | `payment_routes.py` |
| `PaymentAccountController` | `payment_accounts_routes.py` |
| `AnalyticsController` | `analytics_routes.py` |
| `FundTransferController` | `fund_transfer_routes.py` |
| `CampaignMemberController` | `campaign_member_routes.py` |
| `NotificationController` | `notification_routes.py` |
| `IntegrationController` | `integration_routes.py` + `sheets_routes.py` |
| `DkimController` | `dkim_routes.py` |
| `ActivityLogController` | `activity_log_routes.py` |
| `OfflinePaymentController` | `offline_payment_routes.py` |
| `WhatsAppController` | `whatsapp_routes.py` |
| `KioskController` | `kiosk_routes.py` |
| `KioskVolunteerController` | `kiosk_volunteer_routes.py` |
| `UrlShortenerController` | `url_shortener_routes.py` |
| `UploadController` | `upload_routes.py` |
| `HealthController` | (new — `GET /health`) |
| `EmailTemplateController` | (new) per-campaign email templates: `api/campaigns/{id}/email-templates`. 4 templates seeded at campaign creation (`registration_confirmed`, `payment_received`, `payment_otp`, `registration_reminder`); admin edits subject/body/CC/BCC/attach-PDF |
| `CashfreeKycController` | (new) Cashfree vendor KYC: `api/cashfree-kyc`. Admin CRUD + a public token-protected `/onboard` for vendor self-onboarding |
| `RazorpayRouteController` | (new) Razorpay Route linked-account onboarding: `api/razorpay-route`. Calls Razorpay v2 `/accounts → /stakeholders → /products`, stores ids + activation status |
| `CampaignVendorSplitController` | (new) per-campaign payment splits (Cashfree + Razorpay Route): `api/campaigns/{id}/vendor-splits`. Each row has `split_type` = `percentage` \| `fixed` \| `residual`; exactly one residual per (campaign, gateway) absorbs the remainder |
| `InstamojoArchiveController` | (new) Instamojo finance archive: `api/instamojo-archive`. Ported from the Rotary India Instamojo*.aspx pages — read-only ops filters/list/export + restricted-write finance actions |
| `CaptchaController` | (new) CAPTCHA challenge/verify for public forms |
| `WhatsAppTemplateController`, `GlobalWhatsAppTemplateController` | (new) per-campaign and global WhatsApp message templates (Interakt) |

> All controllers derive from `ApiControllerBase` (`Controllers/ApiControllerBase.cs`) for the auth helper
> properties (`CurrentUserId`, `CurrentUserRole`, `IsSuperAdmin`, `IsAdminRole`) and `Forbidden()`.

---

## 6. All Enums (exact string values must match)

```csharp
UserRole:             super_admin | org_admin | kiosk_volunteer
CampaignStatus:       draft | active | closed | archived
CampaignType:         open | closed_group
PaymentGateway:       razorpay | instamojo | cashfree
FundCollectionMode:   kaizen_managed | organizer_direct
PaymentCollectionMethod: online | offline
PaymentStatus:        pending | completed | failed | refunded | partial_refund | no_show
RegistrationStatus:   draft | submitted | confirmed | cancelled | no_show
TransferStatus:       pending_approval | approved | rejected | completed
ChangeRequestType:    fund_transfer | bank_account | payment_gateway | fund_collection_mode
ChangeRequestStatus:  pending | approved | rejected
MemberStatus:         unregistered | registered
PaymentGatewayType:   instamojo | razorpay | cashfree
SectionType:          hero | about | pricing | speakers | schedule | gallery | faq | contact
FieldType:            text | email | phone | number | date | time | datetime | dropdown |
                      radio | checkbox | file_upload | textarea | section_header |
                      terms_checkbox | rating | slider | matrix | name | address |
                      currency | percentage | calculated
```

Store enums as lowercase strings in MySQL. Use `[JsonConverter(typeof(JsonStringEnumConverter))]` with snake_case values.

---

## 7. Authentication & Authorization

### JWT Configuration
- Algorithm: HS256
- Access token: 30 minutes, claim `type: "access"`
- Refresh token: 7 days, claim `type: "refresh"`
- Claims: `sub` (user_id UUID string), `exp`, `iat`, `nbf`, `jti` (random token ID), `type`

### Token Blacklist
- In-memory dictionary: `token_hash (SHA-256) → expiry_time`
- User-level revocation: `user_id → revocation_time`
- Cleanup every 5 minutes (background task)
- `is_blacklisted(token, user_id, token_iat)` checks both levels

### Authorization Levels (in order of privilege)
1. **Public** — no auth required
2. **Authenticated** — any valid JWT
3. **Campaign Access** — super_admin OR org_admin with campaign_id in their access list
4. **Admin Role** — super_admin OR org_admin
5. **Director** — authenticated + `can_approve_transfers == true`
6. **Super Admin** — role == super_admin only
7. **Kiosk** — role == kiosk_volunteer (for assigned campaigns only)

### Password Strength Rules (enforce on register + password reset)
1. Minimum 12 characters, maximum 128
2. Must contain: uppercase, lowercase, digit, special char (`!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'` + backtick + `~`)
3. No more than 2 consecutive repeated characters
4. No sequential numbers (`012`, `123`, ..., `890`)
5. No sequential letters (`abc`, `bcd`, ..., `xyz`)
6. Not in weak password list: `password, 12345678, qwerty123, admin123, letmein, welcome1, monkey123, dragon123, master123, login123, password1, password123`
7. Must not contain common words: `password, admin, user, login, welcome, test`

---

## 8. Business Logic Rules (MUST preserve exactly)

### Campaign Lifecycle
- Only Super Admin can create campaigns
- Status flow: `draft → active → archived`. Archived can be unarchived back to active.
- Registration allowed when: `status == active` AND `registration_enabled == true` AND within date window (if set) AND `current_registrations < max_registrations` (if set)
- Slug: auto-generated from campaign name, lowercase alphanumeric + hyphens, globally unique

### Registration + Payment Flow
1. **Submit**: Validate campaign open + not full → for `closed_group`, verify member exists and not already registered → apply coupon → create registration (`status=submitted`, `payment_status=pending`) → auto-sync to Google Sheets → update member status
2. **Payment Initiate**: Create gateway order (Razorpay) / payment request (Instamojo) → store payment record
3. **Payment Verify**: Verify signature → update payment + registration → increment `campaign.current_registrations` + `campaign.total_revenue` → update payment account stats → fetch gateway fees (background)
4. **Invoice**: PDF generated on-demand, only for `payment_status == completed`
5. **Registration Update**: If amount increased → generate additional payment link via campaign gateway. If decreased → set `refund_pending = true`, email Super Admins + Directors.

### Pricing Calculation
1. Start with `base_price` from form config
2. Apply pricing rules (sorted by `priority` descending): evaluate conditions → if met, evaluate rule formula → add to total
3. Apply master `pricing_formula` if set (variables: `base_price`, `current_total`)
4. Apply coupon: `percentage` = `subtotal * (value/100)`, `fixed` = `min(value, subtotal)`
5. Final = `max(0, subtotal - discount)`, rounded to 2 decimal places
6. **Server-side validate**: `total_amount` in registration submission must match server calculation

### Fund Transfer Workflow
- Applies only when `campaign.fund_collection_mode = kaizen_managed`
- `platform_fee = total_collected × 2.95%` (Kaizen's gross commission)
- `gateway_settled = total_collected − gateway_charges` (what Razorpay/Instamojo actually paid Kaizen after their fee)
- `kaizen_share = platform_fee − gateway_charges` (Kaizen's net profit — gateway charges are absorbed from the commission)
- `net_payable = total_collected − platform_fee` (organizer's share — unchanged regardless of gateway)
- `pending_transfer = net_payable − total_transferred`
- Identity check: `gateway_settled = kaizen_share + net_payable`
- Transfer request cannot exceed `pending_transfer`
- Flow: `pending_approval → approved (Director) → completed (Super Admin)` or `rejected`
- Completion: Super Admin adds transaction reference + date, optionally emails bank `notification_email`

### Closed Group Rules
- Members uploaded via CSV/Excel, column mapping: name + mobile required
- Mobile number normalized + deduplicated at `(campaign_id, mobile)` level
- Registration: lookup member by `member_id`, verify not already registered
- Status update: `unregistered → registered` with `registration_id` + `registered_at`

### Kiosk Rules
- Per-campaign `kiosk_enabled` flag
- Kiosk volunteer can only access assigned campaigns
- OTP: 6-digit code, expires in 10 minutes
- Search by name / email / phone across campaign registrations
- Cash confirmation: sets `cash_collected = true`, records `cash_collected_by` + `cash_collected_at`

### Formula Engine (implement exactly)
- **No `eval()`** — AST-based `SecureExpressionParser` only
- **Operators**: `+`, `-`, `*`, `/`, `//`, `%`, `**`, unary `-`/`+`
- **Comparisons**: `==`, `!=`, `<`, `<=`, `>`, `>=`
- **Functions**: `sum`, `avg`, `min`, `max`, `abs`, `round`, `ceil`, `floor`, `sqrt`, `pow`
- **Conditional**: `if(condition, true_val, false_val)` → converted to ternary before parsing; max 10 nesting levels
- **Field references**: `${field_id}` replaced with numeric values from submission
- **Built-in variables available in pricing formulas**: `base_price`, `current_total`
- **Safety limits**: max formula length 1000 chars; max AST depth 20
- **Division by zero**: returns `0`
- **Condition operators** (for field rules and pricing rule conditions):
  `equals`, `not_equals`, `contains`, `not_contains`, `greater_than`, `less_than`,
  `greater_equal`, `less_equal`, `between`, `is_empty`, `is_not_empty`, `starts_with`, `ends_with`

### Google Sheets Sync Row Format
Headers (written on sheet creation): `Registration ID, Date, Name, Email, Phone, Payment Status, Amount, Payment ID, Campaign`
Data row: `[registration_id[:8].upper(), created_at, name, email, phone, payment_status, total_amount, gateway_payment_id, campaign_name]`

### URL Shortener Response Format
`GET /api/short-urls/campaign/{campaign_id}` returns a **dict keyed by url_type**, not an array:
```json
{
  "registration": { "short_code": "abc123", "short_url": "...", "original_url": "...", "clicks": 5 },
  "kiosk": { "short_code": "xyz789", "short_url": "...", "original_url": "...", "clicks": 2 }
}
```
`url_type` values: `"registration"` or `"kiosk"`. The redirect endpoint `GET /s/{short_code}` is at root level — **not** under `/api`.

---

## 9. Audit Logger

Every significant action must be logged to `audit_logs` table:
- **Hash chain integrity**: `integrity_hash = SHA-256(JSON(entry) + previous_hash)`
- **Email masking**: `john.doe@example.com → j******e@example.com`
- **Field redaction**: keys containing `password, token, secret, key, credential, card_number, cvv, pin, account_number` → value replaced with `[REDACTED]`
- **30+ event types** — see `AuditEventType` enum (LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, PAYMENT_INITIATED, PAYMENT_VERIFIED, etc.)
- Dual write: file (`logs/audit.log`) + database

---

## 10. Middleware Pipeline (order matters)

```csharp
// Program.cs — current order (verify against Program.cs before changing):
app.UseCors();                                   // outermost — default policy, no name arg
app.UseMiddleware<GlobalExceptionMiddleware>();
// app.UseMiddleware<RateLimitMiddleware>();      // CURRENTLY COMMENTED OUT / disabled
app.UseMiddleware<SuspiciousActivityMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<RequestSigningMiddleware>();   // innermost custom middleware
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

> **NOTE:** `RateLimitMiddleware` exists in `Middleware/` but is **commented out** in the pipeline; the
> per-endpoint rate limits documented below are therefore not currently enforced by that middleware. The
> **login progressive lockout** is separate — it lives in `LoginRateLimiterService` (registered as a
> singleton and called from the auth flow) and *is* active.

### CORS Config
- `allow_credentials: true`
- Origins from `Cors:Origins` in appsettings
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Headers: Authorization, Content-Type, Accept, X-CSRF-Token, X-Request-Timestamp, X-Request-Signature
- Expose: X-Request-Id
- Max age: 600s

### Rate Limiting

Endpoint-specific limits (path prefix match, first match wins):

| Endpoint prefix | Max requests | Window | Block duration |
|---|---|---|---|
| `/api/auth/login` | 5 | 60s | 600s (10 min) |
| `/api/auth/register` | 3 | 60s | 900s (15 min) |
| `/api/auth/reset` | 3 | 300s (5 min) | 1800s (30 min) |
| `/api/payments` | 20 | 60s | 300s |
| `/api/registrations` | 30 | 60s | 300s |
| Default (all others) | 100 | 60s | 300s |

Key: SHA-256 hash of `IP:UserAgent`. Returns `429` with `Retry-After` header. Skips `/health`.

**Login progressive lockout** (separate from above, in addition to rate limit):
- Key: SHA-256(`email:ip`) and SHA-256(`email:`) separately
- After 3 failures (IP+email, within 30 min): block with progressive durations `[60, 300, 900, 3600, 86400]` seconds
- After 10 failures (any IP, within 30 min): account locked for 1 hour
- On success: clear all attempts for that email+IP
- Response includes remaining attempts: `max(0, 3 - attempts)`

**Request Signing** (HMAC-SHA256, `REQUEST_SIGNING_KEY` env var):
- Signs: `method:path:body:timestamp`, secret from `REQUEST_SIGNING_KEY`
- Timestamp must be within 5 minutes
- Headers: `X-Request-Timestamp`, `X-Request-Signature`
- Class `RequestSigner` instantiated in security service — implement even if frontend does not currently send signatures (future-proof)

**General cleanup**: in-memory rate limit state purged every 5 minutes (background task).

---

## 11. External Service Integrations

| Service | Auth | Base URL | Used by |
|---------|------|----------|---------|
| Razorpay | Basic Auth (Key ID + Secret) | `https://api.razorpay.com/v1` | PaymentController, SettlementService |
| Instamojo | OAuth 2.0 Bearer OR Legacy headers | `https://api.instamojo.com` | PaymentController |
| Cashfree | `x-client-id` + `x-client-secret` headers (`x-api-version`) | `https://api.cashfree.com/pg` (prod) / `https://sandbox.cashfree.com/pg` | CashfreeService, CashfreeKycController, CampaignVendorSplitController (Easy Split) |
| Razorpay Route | Basic Auth, Razorpay v2 API | `https://api.razorpay.com/v2` | RazorpayRouteController (Linked Accounts), CampaignVendorSplitController |
| Brevo (email) | `api-key` header | `https://api.brevo.com/v3` | BrevoService (batch/campaign emails) |
| Resend (email) | `Authorization: Bearer {api_key}` | `https://api.resend.com` | DkimController (domain mgmt), NotificationController (transactional emails) |
| Interakt (WhatsApp) | `Authorization: Basic {key}` | `https://api.interakt.ai/v1/public` | InteraktService |
| Google Sheets | Service account JSON + domain delegation | Sheets + Drive APIs | GoogleSheetsService |

### Resend Key Points
- **Two uses**: (1) DKIM domain registration/verification via `resend.Domains` API; (2) transactional notification emails via `resend.Emails` API
- The `resend_api_key` is **stored per-DKIM-domain** in `dkim_domains.resend_api_key` (encrypted, never returned in API responses)
- Also stored **per-campaign** in `notification_settings.resend_api_key` (fallback when no DKIM sender configured)
- Default sender when unconfigured: `onboarding@resend.dev`
- Resend SDK endpoints used: `POST /domains` (create), `POST /domains/{id}/verify`, `DELETE /domains/{id}`, `POST /emails` (send)

### Razorpay Key Points
- Amount in **paise** (INR × 100) for all API calls
- Signature verification: `HMAC-SHA256("{order_id}|{payment_id}", key_secret)`
- Use `HttpClient` (no official .NET SDK required)

### Instamojo Key Points
- Webhook: `HMAC-SHA1` of sorted payload values joined by `|`, using salt as key
- Webhook success: `status == "Credit"`
- Redirect callback via GET query params: `payment_id`, `payment_request_id`, `payment_status`

### Invoice PDF (QuestPDF)
- A4 page, brand color `#7c3aed` (purple)
- Title: "TAX INVOICE" — 24pt, centered
- Invoice number format: `INV-YYYYMMDD-XXXXXXXX`
- Amount format: `INR X,XXX.XX` (with rupee symbol)
- Footer: "Thank you for your registration!" + "Kaizen Events - {organization_name}"

---

## 12. Configuration (appsettings.json)

```json
{
  "ConnectionStrings": {
    "MySQL": "Server=localhost;Port=3306;Database=kaizen_events;User=root;Password=..."
  },
  "Jwt": {
    "SecretKey": "",
    "RefreshSecret": "",
    "AccessTokenMinutes": 30,
    "RefreshTokenDays": 7,
    "Algorithm": "HS256"
  },
  "Encryption": {
    "Key": "",
    "Salt": "kaizen_security_salt_v1",
    "Iterations": 480000
  },
  "Razorpay": { "KeyId": "", "KeySecret": "" },
  "Instamojo": { "ClientId": "", "ClientSecret": "", "Mode": "sandbox" },
  "Cashfree": { "AppId": "", "SecretKey": "", "Mode": "production", "WebhookPublicKey": "", "VendorBusinessType": "Education", "VendorAccountType": "CURRENT", "VendorScheduleOption": 0 },
  "KaizenGateway": { "ProjectKey": "", "ProjectSecret": "", "GatewayPayUrl": "", "GatewayVerifyUrl": "", "ReturnUrl": "" },
  "CashfreeVendorSplits": { "Enabled": true, "WebhookUrl": "" },
  "Brevo": { "ApiKey": "" },
  "Resend": { "ApiKey": "" },
  "Interakt": { "SecretKey": "" },
  "Google": { "ServiceAccountJson": "" },
  "Security": { "RequestSigningKey": "" },
  "Cors": { "Origins": ["http://localhost:3000"] },
  "App": { "FrontendUrl": "http://localhost:3000", "DisableDocs": false },
  "Logging": { "AuditLogPath": "logs/audit.log" }
}
```

---

## 13. Health Check

```
GET /health
Response 200: { "status": "healthy", "service": "Kaizen Events API" }
```

This endpoint must stay at `/health` (not `/api/health`) — Nginx/Docker uses it for health probes.

---

## 14. Startup Tasks (Program.cs)

On app start, in order:
1. Run EF Core migrations automatically (`dbContext.Database.MigrateAsync()`)
2. Seed default super_admin user if `users` table is empty
3. Start background services: token blacklist cleanup (every 5 min), audit log TTL purge (daily)

---

## 15. Development Workflow & Conventions

### Code Conventions
- Use `async/await` throughout — no blocking `.Result` or `.Wait()` calls
- Repository pattern: one repository interface + implementation per aggregate root
- Services in `KaizenEvents.Infrastructure/Services/` implement interfaces in `KaizenEvents.Core/Interfaces/`
- DTOs are immutable `record` types where possible
- Use `ILogger<T>` for all logging (not `Console.WriteLine`)
- All controller actions return `IActionResult` or `ActionResult<T>`

### Serialization
```csharp
// In Program.cs
builder.Services.AddControllers().AddJsonOptions(options => {
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
```

### Error Responses
Match Python/FastAPI error format exactly:
```json
{ "detail": "Error message here" }
```
Use `GlobalExceptionMiddleware` to catch unhandled exceptions and return `500` in this format.

### Prerequisites (not in the repo — install before first run)
- **.NET 8 SDK** (`dotnet --version` should print 8.x). If `dotnet` is not found, install it first — nothing below works without it.
- **MySQL 8** for a local throwaway DB (the repo assumes a local instance; never point at prod — see the DANGER note).
- **Node.js** (18+; a recent Node works) only if you also run the React frontend.

### Running Locally (READ THIS FIRST)

> **DANGER:** Every `appsettings*.json` (including base `appsettings.json`) points
> `ConnectionStrings:MySQL` at the **production** MySQL (`101.53.148.126`, db `kaizen_events`). Running the
> API with defaults **auto-migrates prod and can fire reminder emails to real registrants**. Never do it.
> Always override the connection string to the local throwaway DB and set gateway/email keys to disabled.

**Easiest path — one command (from the project root):**
```powershell
.\start-local.ps1
```
> **NOTE:** `start-local.ps1` is a **local, untracked convenience script — it is NOT in the repo** (a fresh
> clone will not have it, and neither are the `frontend/.env` / `frontend/.env.development.local` files it
> and the frontend notes below rely on; only `frontend/.env.example` is committed). Treat the **Manual
> build / run** block below as the source of truth for a clean checkout; recreate `start-local.ps1` from that
> block if you want the one-command flow. When present, it starts (each in its own window, skipping any port already in use):
- **local MySQL** (`C:\Kalpesh\bin\mysql\mysql9.1.0`, port 3306, root / no password) against throwaway db `kaizen_events_local`
- **backend** on `http://localhost:8888` — runs the **compiled exe** `KaizenEvents.API\bin\Debug\net8.0\KaizenEvents.API.exe`
  (not `dotnet run`, whose wrapper process dies when reaped), with `Brevo/Resend/Interakt/Razorpay/Instamojo`
  keys set to `DISABLED-LOCAL-TEST`
- **frontend** dev server on `http://localhost:3000` (`npx craco start`, `REACT_APP_BACKEND_URL=http://localhost:8888/api`)

Seeded logins (see `Program.cs` — these are the ONLY accounts on a fresh local DB):
`pranav@kaizeninfotech.com` / `Kaizentest1234` and `admin@kaizenevents.com` / `Admin@KaizenEvents1`
(both super_admin). Note: `web@kaizeninfotech.com` is **not** seeded despite older banners saying so.

> **Frontend → backend URL (important):** the committed `frontend/.env` points
> `REACT_APP_BACKEND_URL` at **production** (`https://events.yatrimitra.com/api`), so a plain
> `craco start` makes the local UI call prod. `frontend/.env.development.local` overrides it to
> `http://localhost:8888` (no `/api` — `src/services/api.js` appends `/api` itself). If the app still
> hits prod after changing this, delete `frontend/node_modules/.cache` and restart — webpack caches
> the inlined URL across rebuilds.

**Manual build / run:**
```powershell
dotnet build                             # build the whole solution
# backend against LOCAL db only (build first so the exe exists for start-local.ps1):
dotnet run --project KaizenEvents.API --no-build -- `
  --ConnectionStrings:MySQL="Server=127.0.0.1;Port=3306;Database=kaizen_events_local;User=root;Password=" `
  --urls "http://localhost:8888"
```

**Migrations:** the app auto-runs `Database.MigrateAsync()` on startup, so the local db builds itself. **Do
NOT use the `dotnet ef` CLI** — it reads `appsettings.json` and would connect to **prod**. When a migration
must change, hand-edit the migration + its `.Designer.cs` + `AppDbContextModelSnapshot.cs`, then DROP and
recreate `kaizen_events_local` (EF will not re-run an already-applied migration).

There are no automated test projects in the solution; verification is done by running the stack locally.

---

## 16. Migration Build Order (historical)

> **This migration is complete** — all layers below exist and the app is in production. This section is kept
> as a record of how the codebase was built and the dependency order between layers (still useful when adding
> a new entity/table or reasoning about DI). It is **not** a live to-do list.

The original build/verify sequence was:

1. **Enums** (`KaizenEvents.Core/Enums/`)
2. **Entities** (`KaizenEvents.Core/Entities/`) — all 24 tables
3. **AppDbContext** — configure all relationships and indexes
4. **EF Core Migration** — generate and run initial migration
5. **Repository Interfaces + Implementations** — one per aggregate
6. **Service Interfaces** (`KaizenEvents.Core/Interfaces/`)
7. **Infrastructure Services** — JWT, Encryption, TokenBlacklist, RateLimit
8. **Auth (AuthController)** — login, register, logout, me — test with Postman
9. **Campaign CRUD (CampaignController)** — create, list, get, update, archive
10. **Form + Pricing (FormController)** — form CRUD, price calculation, formula validation
11. **Registration Flow (RegistrationController)** — submit, payment initiate/verify
12. **Payment Webhooks (PaymentController)**
13. **Remaining controllers** — in any order after 1–12 are stable

---

## 17. Key Reference Documents

All in `/docs/` folder:

| File | What it contains |
|------|-----------------|
| `docs/DOTNET_MIGRATION_GUIDE.md` | **PRIMARY SOURCE OF TRUTH** for the original migration — all routes, models, DB schema, business rules, env vars, NuGet packages |
| `docs/COMPLETE_USER_GUIDE.md` | Business context, user workflows, feature descriptions — consult for UX/behavior questions |
| `docs/CashFree Payment SETUP_GUIDE.md`, `docs/CASHFREE_PROXY_AND_SPLITS.md` | Cashfree gateway, KYC onboarding, proxy, and vendor-split model (the newest payments work) |
| `docs/SECURITY.md`, `docs/payment-detail-tables.sql` | Security notes; payment/settlement table DDL |
| `python-sourcecode-ref/Kaizen-Events-main/backend/` | Original Python source — reference only, for how the migrated logic behaved |
| `python-sourcecode-ref/Kaizen-Events-main/frontend/` | **The live React 19 frontend the team actively edits** — CRA + Craco, `@` → `src/`. Make UI changes here. Key files: `src/pages/FormBuilder.js`, `src/pages/PublicRegistration.js`, `src/components/FormBuilder/FormPreview.js`. **Not** read-only, despite older wording. |

**When in doubt about a migrated API contract, business rule, or DB schema — read `DOTNET_MIGRATION_GUIDE.md`
first, then the Python source. For newer features (Cashfree/splits, email templates) the .NET code and the
Cashfree docs are the source of truth.**

---

*Last updated: September 2026 — Kaizen Events (.NET 8 + MySQL 8, in production; Cashfree/splits, email templates, Instamojo archive, WhatsApp templates + CAPTCHA added post-migration). Verified controllers/middleware/pipeline against source on this date.*
