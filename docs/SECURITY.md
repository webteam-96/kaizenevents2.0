# SECURITY.md — Kaizen Events

Living record of every security control implemented in the .NET 8 backend +
React 19 frontend. Update this file whenever a security-relevant change ships.

> **For future Claude / future contributors:** when you add, change, or
> remove a security control, add an entry to the Changelog at the bottom
> AND update the relevant section above.

---

## Changelog

| Date       | Area                          | Change                                                                                       |
|------------|-------------------------------|----------------------------------------------------------------------------------------------|
| 2026-05-11 | Instamojo Archive             | Constant-time password compare on all 4 callsites (Access / Profit / PaidToCustomer)         |
| 2026-05-11 | Instamojo Archive             | Server-validated session token via `X-Instamojo-Session` header + `IMemoryCache` store        |
| 2026-05-11 | OTP service                   | Brute-force guard — OTP invalidated after 3 wrong attempts (universal — affects all callers) |
| 2026-05-11 | Instamojo Archive             | `DevReturnOtpInResponse` flag now ignored when `IWebHostEnvironment.IsProduction()`           |
| 2026-05-11 | Audit logging                 | 6 new event types for Instamojo archive (access, profit reveal, OTP request/fail/delete, report export) |
| 2026-05-11 | CORS                          | Restored `AllowCredentials` + `WithExposedHeaders("X-Request-Id")` + `SetPreflightMaxAge(600s)` per spec |
| 2026-05-11 | Instamojo OTP delivery        | Wired Brevo email send to `InstamojoArchive:DeleteOtpRecipient` (mirrors Rotary's single-inbox model) |
| 2026-05-11 | Operational                   | Added "SQL dump / import safety" section — rules for `mysqldump` / Workbench export-import workflows (avoid `USE <db>;` re-routing) |
| 2026-05-11 | Auth — login UX               | Wrong-password message now reaches the toast (axios interceptor skips the auto-redirect when the 401 is from `/auth/login` itself); error includes the backend's `remaining_attempts` counter |
| 2026-05-11 | Auth — password inputs        | New shared `PasswordInput` component on Login / Forgot Password / Change Password. Default hidden, click-to-reveal, **auto-hides on blur**. Toggles `type` on the same input (no autofill break). |
| 2026-05-11 | Auth — change password        | New `POST /api/auth/change-password` (authenticated). Re-verifies current password, runs `PasswordValidator`, rejects reuse of current, revokes all of user's tokens on success. New `/change-password` page in the frontend. |
| 2026-05-11 | Auth — forgot password        | New `/forgot-password` page (two-step: request code → enter code + new password). Wraps existing `POST /auth/password-reset-request` + `POST /auth/password-reset-confirm`. |
| 2026-05-11 | Audit log — timestamp display | Backend now tags all `DateTime` columns as `DateTimeKind.Utc` via a global EF Core value converter, so JSON serialisation includes the `Z` suffix. Activity Logs page formats with `Intl.DateTimeFormat` + `timeZone: 'Asia/Kolkata'` so wall-clock IST shows regardless of viewer's browser timezone. |
| 2026-05-12 | Instamojo dashboard maths     | `/summary` (Phase 2 list page) now mirrors Rotary's `BindTableData` exactly — Instamojo Commission = SUM(Instamojo_Fees) + SUM(Total_Tax) from raw rows (not a 2.95% estimate); Receivable = total − commission; Received = settled-collection − settled-fees − settled-tax; Balance = receivable − received. Previously the estimates only happened to match when the actual gateway rate was exactly 2.95%. |
| 2026-05-12 | Instamojo Paid / Kaizen Balance | `Paid` (and downstream Kaizen Balance) now INNER JOIN `instamojo_payment_details` → `instamojo_paymenttitle` and exclude orphan rows whose `fk_title_id` is NULL / '0' / '' / points to a soft-deleted title — matches Rotary's stored proc behaviour. Applied to `BuildPaidSumSql` (raw SQL helper) and `PaymentsDashboard` (via active-title Contains filter). Without this filter the raw SUM was higher by the value of those orphan payments (~₹1.6 cr on the production dataset). |
| 2026-05-12 | Reports                       | New password-gated `POST /api/instamojo-archive/reports/paid-with-date` — port of Rotary's `ImageButton1_to_customer_Report_with_transaction_date_click`. Same access password as standard Paid report. Returns single-sheet .xlsx with Sr.No / Title / Amount / Payout Date / Customer Transaction Date / Bank Details / Remark. Frontend tile activated (previously a "(Pending)" placeholder). New audit event `INSTAMOJO_ARCHIVE_PAID_WITH_DATE_REPORT_EXPORTED`. |
| 2026-05-12 | Month-wise Refresh            | `POST /api/instamojo-archive/refresh-period` is now a real Instamojo sync (was a 501 stub). Direct port of Rotary's `btn_fetch_one_month_click` + `CallInstaDetails_update_one_month_Transaction`. Walks `/v2/payments/?page=N&limit=50` until rows go past the period cutoff, upserts each row into `instamojo_datadetails`, auto-creates `instamojo_paymenttitle` rows for new Titles, replicates Rotary's title/name parens-extraction. New audit event `INSTAMOJO_ARCHIVE_MONTH_WISE_REFRESH`. With this in place the manual Rotary→Kaizen `mysqldump --replace` drift sync is no longer required for ongoing operation. |
| 2026-05-15 | Password validator — **weakened** | `"admin"` removed from `PasswordValidator.CommonWords` block-list (other 5 words still blocked: `password`, `user`, `login`, `welcome`, `test`). Allows passwords containing the substring "admin" (e.g. for `admin@…` accounts to keep memorable passwords). Tradeoff: admin-account dictionary-attack surface increases marginally. `WeakPasswords` list (which includes `admin123`) is unchanged. |

---

## 1. Authentication

### JWT (HS256)
- **Access token**: 30 minutes, claim `type: "access"` (default; currently set to 1440 min in dev — see `appsettings.json:Jwt:AccessTokenMinutes`)
- **Refresh token**: 7 days, claim `type: "refresh"`
- **Claims**: `sub` (user_id UUID), `exp`, `iat`, `nbf`, `jti`, `type`
- **Algorithm**: HS256 with secrets from `Jwt:SecretKey` + `Jwt:RefreshSecret`

### Token blacklist
- In-memory dictionary keyed by `SHA-256(token)` → `expiry`
- User-level revocation: `user_id` → `revocation_time` (invalidates all tokens issued before)
- Background cleanup every 5 minutes
- `is_blacklisted(token, user_id, token_iat)` checks both levels

### Password hashing
- **BCrypt.Net-Next** with default work factor (10 rounds)
- Stored in `users.password_hash` (never returned in any API response)

---

## 2. Authorization

### Role hierarchy (least → most privileged)
1. **Public** — no auth
2. **Authenticated** — any valid JWT
3. **Campaign-scoped** — `super_admin` OR `org_admin` whose `user_campaign_access` contains the campaign
4. **Admin role** — `super_admin` OR `org_admin`
5. **Director** — authenticated + `users.can_approve_transfers = true`
6. **Super Admin** — `role == super_admin`
7. **Kiosk** — `role == kiosk_volunteer` (assigned campaigns only)

### Enforcement pattern
- Controller-level `[Authorize]` for any-authenticated endpoints
- Action-level `[Authorize(Roles="…")]` or in-method checks via `ApiControllerBase.IsSuperAdmin` / `IsAdminRole`
- For campaign-scoped endpoints: `CampaignAccessFilter` checks the route's `campaignId` against the user's access list

### Password strength rules (registration + reset)
Enforced in `KaizenEvents.Infrastructure.Services.PasswordValidator`:
1. 12–128 chars
2. Uppercase, lowercase, digit, special char required
3. No more than 2 consecutive repeated chars
4. No sequential digits (`012`, `123`, …)
5. No sequential letters (`abc`, `bcd`, …)
6. Not in weak password blocklist (12 hardcoded entries)
7. Must not contain common words: `password`, `user`, `login`, `welcome`, `test` (`admin` removed 2026-05-15 — see changelog)

### Login rate-limit + progressive lockout
Separate from generic rate limit:
- 3 failures (email+IP, 30-min window) → block with progressive `[60, 300, 900, 3600, 86400]` seconds
- 10 failures (any IP, same email, 30-min window) → account-wide 1-hour lock
- Success clears the counter

---

## 3. Sessions

### JWT lifetime
See Section 1. Refresh token is a long-lived credential — store securely client-side (currently `localStorage`; consider httpOnly cookie for production hardening).

### Instamojo Archive password gate (defense-in-depth)
Director-only sub-system with its own session layer in addition to JWT.

- `POST /api/instamojo-archive/verify-password` validates `InstamojoArchive:AccessPassword`
- On success: 32-char hex token issued, stored server-side in `IMemoryCache` with `InstamojoArchive:SessionTtlMinutes` TTL (default 60)
- Frontend stores token in `localStorage["instamojoArchiveSession"]`
- Axios interceptor attaches `X-Instamojo-Session: <token>` header to every `/api/instamojo-archive/*` call (except `/verify-password` itself)
- `CheckArchiveAccessAsync(requireSession: true)` validates: role check + cached-token lookup
- 403 with `detail: "Instamojo Archive session expired…"` triggers a redirect back to the gate

**Why this matters:** even if a Director's JWT is stolen, the archive subsystem stays protected until the attacker also obtains the recently-issued session token.

---

## 4. Rate limiting

`KaizenEvents.API.Middleware.RateLimitMiddleware` — keyed by `SHA-256(IP:UserAgent)`.

| Endpoint prefix      | Max | Window | Block      |
|----------------------|-----|--------|------------|
| `/api/auth/login`    | 5   | 60s    | 600s       |
| `/api/auth/register` | 3   | 60s    | 900s       |
| `/api/auth/reset`    | 3   | 300s   | 1800s      |
| `/api/payments`      | 20  | 60s    | 300s       |
| `/api/registrations` | 30  | 60s    | 300s       |
| Default              | 100 | 60s    | 300s       |

Responds with `429` + `Retry-After`. Skips `/health`. Background sweep every 5 minutes.

---

## 5. OTP service (`IOtpService` / `OtpService.cs`)

Generic 6-digit OTP store backed by `IMemoryCache`. Used by Cashfree KYC, vendor onboarding, and Instamojo archive delete.

- **Generator**: `RandomNumberGenerator.GetInt32(0, 1_000_000)` (cryptographic RNG), zero-padded to 6 digits
- **Lifetime**: 10 minutes sliding expiry
- **Verify**: constant-time (`CryptographicOperations.FixedTimeEquals`)
- **One-shot**: cleared on successful verify
- **Brute-force guard**: 3 wrong attempts invalidate the OTP and the attempts counter — caller must request a new one
- **Storage**: in-memory only (lost on app restart; deliberate — OTPs are short-lived)

---

## 6. Audit logging (`IAuditLoggerService`)

Tamper-evident hash chain — every entry includes `integrity_hash = SHA-256(JSON(entry) + previous_hash)`.

- **Dual write**: `logs/audit.log` (append-only file) + `audit_logs` table
- **PII protection**: emails masked (`john.doe@example.com → j*****e@example.com`)
- **Field redaction**: keys containing `password`, `token`, `secret`, `key`, `credential`, `card_number`, `cvv`, `pin`, `account_number` → `[REDACTED]`
- **Retention**: `AuditLogTtlService` (hosted background service) purges entries older than 2 years daily
- **Event types**: 30+ in `AuditEventType` static class

### Instamojo-archive-specific events
| Event type                                       | Trigger                                                              |
|--------------------------------------------------|----------------------------------------------------------------------|
| `INSTAMOJO_ARCHIVE_ACCESS_GRANTED`               | Successful `/verify-password`                                        |
| `INSTAMOJO_ARCHIVE_ACCESS_DENIED`                | Failed `/verify-password` (wrong access password)                    |
| `INSTAMOJO_ARCHIVE_PROFIT_REVEALED`              | Successful `/show-profit` with filter window in `actionDetails`      |
| `INSTAMOJO_ARCHIVE_DELETE_OTP_REQUESTED`         | OTP generated for payment delete (logs masked recipient, email-sent flag) |
| `INSTAMOJO_ARCHIVE_DELETE_OTP_FAILED`            | Wrong or exhausted OTP                                               |
| `INSTAMOJO_ARCHIVE_PAYMENT_DELETED`              | OTP confirmed + soft delete done                                     |
| `INSTAMOJO_ARCHIVE_PAID_REPORT_EXPORTED`         | Password-gated Excel report exported                                 |

---

## 7. CORS

`KaizenEvents.API/Program.cs` — `AddDefaultPolicy`.

- **Origins** (allowlist): `https://events.yatrimitra.com`, `http://localhost:5173`, `http://localhost:3000`
- `AllowAnyMethod()` + `AllowAnyHeader()`
- `AllowCredentials()` — required by CLAUDE.md §10. Allows cookie-based flows if added.
- `WithExposedHeaders("X-Request-Id")` — frontend can read request IDs for support tickets
- `SetPreflightMaxAge(600s)` — caches OPTIONS responses to cut chatter

Origins are hardcoded; update `Program.cs` directly when adding new deployments.

---

## 8. Request signing (HMAC-SHA256)

`RequestSigningMiddleware` — disabled by default; enabled when `Security:RequestSigningKey` is non-empty.

When enabled:
- Frontend signs `method:path:body:timestamp` with the shared key
- Sends `X-Request-Timestamp` + `X-Request-Signature` headers
- Server rejects requests older than 5 minutes (clock-skew window)
- Designed for high-value endpoints (payments, fund transfers); not currently rolled out

---

## 9. Data encryption at rest

`KaizenEvents.Infrastructure.Services.EncryptionService` — AES-256-GCM with key derived via PBKDF2 (`Encryption:Iterations` rounds, default 480k).

### Encrypted columns
- `payment_accounts`: Razorpay/Instamojo API keys, Cashfree credentials
- `bank_accounts`: account_number, IFSC (encrypted before insert; never returned plaintext)
- `dkim_domains.resend_api_key`
- `notification_settings.resend_api_key`, `notification_settings.sender_email`
- `cashfree_kyc`: PAN, GST, bank details

Key + salt come from `Encryption:Key` and `Encryption:Salt` in appsettings (env-var override in production — see Section 12).

---

## 10. Input validation / injection defenses

- **EF Core LINQ everywhere** — all queries parameterised
- **One raw-SQL location** (`InstamojoArchiveController.BuildPaidSumSql`) — concatenates only typed `DateTime` (formatted) and `int`. Type-safe; no string input concatenated.
- **FluentValidation** for all DTOs (Auth, Registration, Campaign create/update, etc.)
- **XSS sanitization** middleware on POST/PUT bodies (`SuspiciousActivityMiddleware`)
- **Formula engine**: AST-based parser; **no `eval()`**. Max length 1000, max depth 20.

---

## 11. Security headers

`SecurityHeadersMiddleware` adds:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy: default-src 'self'; …` (frame-ancestors none)

---

## 12. Secrets / config

### What's in `appsettings.json` today
- `Jwt:SecretKey`, `Jwt:RefreshSecret`
- `Encryption:Key`
- Payment gateway keys: `Razorpay:KeyId/KeySecret/WebhookSecret`, `Instamojo:ClientId/ClientSecret`, `Cashfree:AppId/SecretKey`
- `Brevo:ApiKey`, `Interakt:SecretKey`
- DB password in connection string
- **`InstamojoArchive` passwords**: `AccessPassword`, `ProfitPassword`, `PaidToCustomerReportPassword` — plaintext

### Production hygiene (REQUIRED before going live)
Override every one of these in `appsettings.Production.json`, environment variables, or a secrets manager (Azure Key Vault / AWS Secrets Manager / Doppler). The repo defaults are **not** production-safe.

- `InstamojoArchive:DevReturnOtpInResponse` MUST be `false` in production (additionally enforced at runtime via `IWebHostEnvironment.IsProduction()` — Section 13)
- `InstamojoArchive:DeleteOtpRecipient` set to the operational inbox that should receive delete OTPs
- `Cors:Origins` — review hardcoded list in `Program.cs`

---

## 13. Instamojo Archive — additional controls

The archive subsystem holds historical Instamojo payment data and Kaizen's outgoing payout records. Director or Super Admin role required.

### Layered access
1. JWT (controller `[Authorize]`)
2. Role check (`IsAdminRole` AND, for org_admin, `can_approve_transfers`)
3. **Archive session token** (Section 3) — required on every endpoint except `/verify-password`
4. **Show Profit password** — gates the single profit number on `/show-profit`
5. **OTP** — required to soft-delete any payment row
6. **Paid-to-customer Report password** — gates the most sensitive Excel export

### Constant-time password comparisons
`InstamojoArchiveController.ConstantTimeEquals` is the only password-equality primitive used in the controller. Used on:
- `/verify-password` (AccessPassword)
- `/verify-profit-password` (ProfitPassword)
- `/show-profit` (ProfitPassword again, with filters)
- `/reports/paid-to-customer` (PaidToCustomerReportPassword)

### Dev-OTP guard
```csharp
var devReturn = !_env.IsProduction()
    && _config.GetValue<bool>("InstamojoArchive:DevReturnOtpInResponse");
```
If `ASPNETCORE_ENVIRONMENT=Production`, the dev flag is ignored even if `true` in config — the OTP is never returned in the API response. Used purely for local testing without SMTP.

### OTP email
- Recipient: `InstamojoArchive:DeleteOtpRecipient` (single inbox, mirrors Rotary)
- Sender: existing `BrevoService` (`Brevo:SenderEmail`)
- Response masks the recipient as `i******s@kaizeninfotech.com`
- Audit log captures masked recipient + send-success flag

### Soft delete semantics
- `isdeleted = 1` + `deletedby` + `deleteddate` — physical row retained
- Original audit trail intact

---

## 14. Known gaps / not yet hardened

These are documented intentionally — open before someone tries to "fix" them surprise-style.

- **Plaintext Instamojo Archive passwords in `appsettings.json`** — `kaizen123` / `profit123` / `paid123`. Override in `appsettings.Production.json` or env vars. Long-term: store hashed and verify against the hash.
- **Brevo / DB / JWT keys in `appsettings.json`** — same story; checked into the repo for dev convenience.
- **No CSRF token system** — relies on JWT-in-Authorization-header model (cookies not used for auth, so CSRF surface is small). If cookie auth is ever added, add anti-forgery tokens.
- **Refresh token stored in `localStorage`** — vulnerable to XSS. Frameworks-wide hardening: move to httpOnly cookie + add CSRF protection.
- **Month-wise Refresh sync (Instamojo period sync)** not implemented — the endpoint returns 501. Once implemented, ensure the upsert into `instamojo_datadetails` rejects rows for purposes the caller doesn't have access to (currently archive access is all-or-nothing per Director).

---

## 15. Operational

### Database backups
- Take a `mysqldump` before every schema migration
- Specifically before mass imports (e.g. importing `instamojo_*` tables from local to server) — Workbench Data Import overwrites tables

### Log rotation
- `logs/audit.log` is append-only — rotate externally (logrotate or equivalent). Keep at least 90 days.

### Incident response checklist
1. Revoke all sessions for affected users (issue tokens with `iat` newer than current via password reset)
2. Rotate the relevant key (`InstamojoArchive:AccessPassword`, JWT secret, payment-gateway secret, etc.)
3. Pull audit log entries for the user (`SELECT * FROM audit_logs WHERE user_id = '…' ORDER BY created_at DESC`)
4. Check for `INSTAMOJO_ARCHIVE_*` events in particular for finance incidents
5. If JWT secret rotated: every active user is forced to re-login

---

## 16. SQL dump / import safety

Rules for any time you move tables between schemas or between servers via
`mysqldump` / Workbench Data Export. Read before every import.

### What to avoid

- **Workbench-generated `.sql` files always begin with two routing lines:**

  ```sql
  CREATE DATABASE IF NOT EXISTS `<source_db>` /*!40100 DEFAULT CHARACTER SET utf8mb4 ... */;
  USE `<source_db>`;
  ```

  These **override** the "Default Target Schema" dropdown in the Workbench
  Data Import wizard. Once MySQL parses the `USE …`, every subsequent
  statement runs against that database — the UI selection is ignored.
  Result: the import lands back in the source schema instead of the target
  you picked. Always check lines 1–30 of the dump before importing.

- **`SET FOREIGN_KEY_CHECKS=0`** is also in every Workbench dump. It means
  `DROP TABLE` will succeed even when other tables have FKs pointing in —
  so missing-target-schema mistakes don't even surface as errors.

- **`DROP TABLE` cascades drop triggers on that table.** If your source
  export didn't have the "Triggers" option ticked, they vanish on re-import.

- **`AUTO_INCREMENT` is reset to whatever the dump declares.** If rows have
  been added in the target between dump and import, new inserts may collide
  on PKs.

- **Indexes / column collations / engine settings** in the recreated tables
  reflect the dump only. Anything the export tool omitted is silently
  missing afterwards.

### Steps to follow

1. **Inspect the dump first.** Open the `.sql` file in a text editor and
   read lines 1–30. If you see `CREATE DATABASE` or `USE`, either:
   - Delete those lines and save before importing (the import will then
     honour Workbench's "Default Target Schema" dropdown), or
   - Regenerate the dump without them (see step 2).

2. **Prefer command-line `mysqldump` with `--no-create-db`** for any
   cross-environment move:

   ```bash
   mysqldump --no-create-db -u USER -p \
     <source_db> \
     instamojo_paymenttitle instamojo_paymenttitle_bank_details \
     instamojo_datadetails instamojo_payment_details \
     > clean_dump.sql
   ```

   Then:

   ```bash
   mysql -u USER -p <target_db> < clean_dump.sql
   ```

   `--no-create-db` is the safety pin — output contains no `CREATE DATABASE`
   or `USE` lines, so it's portable across schemas.

3. **Use a read-only MySQL user when browsing production from Workbench.**
   A user without `DROP` / `INSERT` privileges on prod can't accidentally
   re-apply a dump back to source. Reserve write-capable connections for
   intentional change windows.

4. **Test-import to a throwaway schema first** when crossing servers or
   environments. Create something like `kaizen_events_scratch`, run the
   import there, sanity-check row counts and structure, then run it for real.

5. **Keep the Workbench Import wizard tab open** until you've verified
   target counts and inspected the log panel. The in-Workbench log is
   lost when you close the tab — recovering import success/failure after
   that needs forensic queries (`AUTO_INCREMENT`, `create_time`).

6. **Verify after every import:**
   - Row counts: `SELECT COUNT(*) FROM <target>.<table>;`
   - Recreated tables: `SELECT create_time FROM information_schema.tables WHERE table_schema = '<target>' AND table_name LIKE '<pattern>';` — a fresh `create_time` means the table was dropped + recreated
   - Triggers preserved: `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE event_object_schema = '<target>';`
   - Inbound FKs intact: `SELECT * FROM information_schema.key_column_usage WHERE referenced_table_schema = '<target>';`

7. **Take a `mysqldump` of the target before every mass import.** Cheap
   insurance — restore is one command away if something goes wrong.

---

## 17. Where things live

| Concern              | Code path                                                                        |
|----------------------|----------------------------------------------------------------------------------|
| JWT issue / verify   | `KaizenEvents.Infrastructure/Services/JwtService.cs`                             |
| Token blacklist      | `KaizenEvents.Infrastructure/Services/TokenBlacklistService.cs`                  |
| Password hashing     | `KaizenEvents.Infrastructure/Services/PasswordHasher.cs` (BCrypt)                |
| Password validation  | `KaizenEvents.Infrastructure/Services/PasswordValidator.cs`                      |
| Rate limit           | `KaizenEvents.API/Middleware/RateLimitMiddleware.cs`                             |
| Login lockout        | `KaizenEvents.API/Middleware/RateLimitMiddleware.cs` (separate progressive flow) |
| Audit logger         | `KaizenEvents.Infrastructure/Services/AuditLoggerService.cs`                     |
| Audit log TTL purge  | `KaizenEvents.Infrastructure/Services/AuditLogTtlService.cs`                     |
| Security headers     | `KaizenEvents.API/Middleware/SecurityHeadersMiddleware.cs`                       |
| Request signing      | `KaizenEvents.API/Middleware/RequestSigningMiddleware.cs`                        |
| Suspicious activity  | `KaizenEvents.API/Middleware/SuspiciousActivityMiddleware.cs`                    |
| Global exceptions    | `KaizenEvents.API/Middleware/GlobalExceptionMiddleware.cs`                       |
| Encryption           | `KaizenEvents.Infrastructure/Services/EncryptionService.cs`                      |
| OTP                  | `KaizenEvents.Infrastructure/Services/OtpService.cs`                             |
| CORS / pipeline      | `KaizenEvents.API/Program.cs`                                                    |
| Instamojo archive    | `KaizenEvents.API/Controllers/InstamojoArchiveController.cs`                     |
| Frontend session     | `python-sourcecode-ref/Kaizen-Events-main/frontend/src/services/api.js`          |

---

*Generated by Claude on 2026-05-11. Update the Changelog and the relevant section whenever a security control is added, modified, or retired.*
