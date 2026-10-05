# Cashfree Proxy + Vendor Splits — Setup Guide

This is how the Kaizen-hosted Cashfree proxy and vendor splits integrate with Kaizen Events.

## Scope — What Routes Where

| Gateway   | Fund Mode         | Path                                                         |
| --------- | ----------------- | ------------------------------------------------------------ |
| Razorpay  | KaizenManaged     | Direct Razorpay (existing). 2.95% deducted at fund-transfer time. |
| Razorpay  | OrganizerDirect   | Direct Razorpay (existing). No fee.                          |
| Instamojo | KaizenManaged     | Direct Instamojo (existing). 2.95% deducted at fund-transfer time. |
| Instamojo | OrganizerDirect   | Direct Instamojo (existing). No fee.                         |
| **Cashfree** | **KaizenManaged** | **Kaizen proxy + Cashfree Easy Split (vendor splits)** |
| Cashfree  | OrganizerDirect   | Direct Cashfree (existing, per-payment-account credentials). |

**Vendor splits are Cashfree-only.** Razorpay's "Route" is paid; Instamojo has no native split. Both stick with the existing settlement-time deduction model.

## What You Need from Kaizen Infotech

Before vendor-split-enabled Cashfree payments will work, Kaizen Infotech must register Kaizen Events as a project on the proxy at `kaizeninfotech.com/cashfree-payment-gateway/`. Ask them for:

1. **`project_key`** — short identifier (e.g. `kaizen_events`)
2. **`project_secret`** — 64-char hex string (HMAC key)
3. **Confirmation** that `events.yatrimitra.com` and `localhost` are in the project's `allowed_domains`
4. **Webhook proxy URL** — on the whitelisted domain, forwards Cashfree webhooks to your backend (Part 4 of `cashfree-payment-gateway_reference/SETUP_GUIDE.md`)

## Old Flow — not used now

You also need **two Cashfree vendor IDs** — created in your own Cashfree dashboard → Easy Split → Vendors. Both can be Kaizen-owned bank accounts (commission + settlement), as in the reference setup.

Steps that were used historically:

1. Login to https://merchant.cashfree.com (Live or Test toggle)
2. Sidebar → **Easy Split** → **Vendors** → **+ Add Vendor**
3. Fill: Vendor Name, Email, Phone, PAN, GST (optional), Bank Account Number, IFSC, Account Holder Name
4. Submit → Cashfree triggers penny-drop verification → Pending → Active
5. Copy the generated **Vendor ID** (UUID or custom string)
6. Repeat for the second vendor (settlement / payout account)
7. Wait for both vendors' status = **Active**
8. Paste both Vendor IDs into [appsettings.json](../KaizenEvents.API/appsettings.json) → `CashfreeVendorSplits.Splits[].VendorId`. Percentages stay 2.95 / 97.05.

These global vendor IDs were then used by **all events** that routed through the proxy.

**Why not used now**: same vendor IDs were shared across all events → no per-event audit separation; admin had to do the Cashfree dashboard work manually for every onboarding.

The global `CashfreeVendorSplits.Splits[]` config still works as a **fallback** for events that don't have per-event vendors yet, but is no longer the preferred onboarding path for new events.

## New Flow — In-App Vendor Onboarding (April 2026)

Vendors are now created **per-event from inside the Kaizen Events app**. Vendor IDs auto-generate as `<eventSlug>_<role>` (e.g. `marathon-2026_commission`, `marathon-2026_settlement`).

### How It Works

1. **Admin** opens **Event Settings → Vendors tab**
2. Sees two cards: **Commission Vendor (2.95%)** and **Settlement Vendor (97.05%)**
3. Clicks **"Generate Share Link"** for each slot. Backend creates a `cashfree_kyc` row + a one-shot 64-char token, returns a URL like:
   ```
   https://events.yatrimitra.com/vendor-onboarding/<token>
   ```
4. **Admin shares the link** with the actual vendor (commission a/c holder for slot 1, settlement a/c holder for slot 2)
5. **Vendor opens the link**, fills the KYC form (name, email, phone, account holder, account number + confirm, IFSC, PAN, optional GST). Vendor never sees the auto-generated `vendor_id`.
6. Backend emails a **6-digit OTP** to the vendor's entered email
7. Vendor enters OTP → backend calls **Cashfree Vendor API** (`POST /pg/easy-split/vendors`) with `vendor_id = <eventSlug>_<role>`
8. Cashfree returns initial status (`PENDING` / `IN_VERIFICATION`), then runs penny-drop → flips to `ACTIVE` or `BANK_VALIDATION_FAILED`
9. Vendor sees: **"Submitted, pending verification"** (or success if already ACTIVE)
10. Admin's Vendors tab auto-shows status with a **Refresh** button to re-poll

### Storage (New Flow)

| Field | Stored where |
|---|---|
| `vendor_id` (auto-generated) | `cashfree_kyc.vendor_id` |
| `account_number` | `cashfree_kyc.account_number` (AES-encrypted) |
| `account_number_masked` (last 4) | `cashfree_kyc.account_number_masked` (display) |
| `pan`, `ifsc`, `gst` | `cashfree_kyc` (plaintext — non-sensitive identifiers) |
| Cashfree's raw response | `cashfree_kyc.cashfree_json` (audit / debug) |
| KYC status | `cashfree_kyc.status` (PENDING / ACTIVE / BANK_VALIDATION_FAILED / REJECTED) |

### Admin Endpoints (New Flow)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cashfree-kyc?campaign_id={id}` | List vendors (optionally filtered) |
| GET | `/api/cashfree-kyc/{id}` | Detail incl. raw Cashfree JSON |
| POST | `/api/cashfree-kyc/send-otp` | Email OTP to admin |
| POST | `/api/cashfree-kyc` | Verify OTP + save + create vendor in Cashfree |
| PATCH | `/api/cashfree-kyc/{id}/toggle-active` | Disable/enable |
| DELETE | `/api/cashfree-kyc/{id}` | Delete (only if inactive) |
| POST | `/api/cashfree-kyc/refresh-all` | Re-poll all PENDING |
| POST | `/api/cashfree-kyc/{id}/refresh` | Re-poll one |
| POST | `/api/cashfree-kyc/{id}/share-link` | Generate fresh onboarding token |

### Public Endpoints (token-based, no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cashfree-kyc/onboarding/{token}` | Fetch role + prefill |
| POST | `/api/cashfree-kyc/onboarding/{token}/send-otp` | Email OTP to vendor |
| POST | `/api/cashfree-kyc/onboarding/{token}/submit` | Verify OTP + Cashfree create |

### Resolution Order at Payment Time

When a customer pays for a `KaizenManaged + Cashfree` event, the backend picks vendor IDs in this order:

1. **Per-event from `cashfree_kyc` table** (New Flow) — both commission + settlement, `is_active = true`, `status = ACTIVE`
2. **Global from `appsettings.json` → `CashfreeVendorSplits.Splits[]`** (Old Flow — fallback)
3. If neither — payment initiate returns **400 "no vendors configured"**

So both flows coexist: events with per-event vendors use them; events without fall back to the global config.

## Configuration

Edit `KaizenEvents.API/appsettings.json`. Sections to fill:

```json
"Cashfree": {
  "AppId":      "<your Cashfree App ID>",
  "SecretKey":  "<your Cashfree Secret Key>",
  "Mode":       "sandbox",
  "WebhookPublicKey": "<from Cashfree dashboard if available>"
},
"KaizenGateway": {
  "ProjectKey":     "<from Kaizen Infotech>",
  "ProjectSecret":  "<64-char hex from Kaizen Infotech>",
  "GatewayPayUrl":  "https://www.kaizeninfotech.com/cashfree-payment-gateway/pay.php",
  "GatewayVerifyUrl": "https://www.kaizeninfotech.com/cashfree-payment-gateway/verify.php",
  "ReturnUrl":      "https://events.yatrimitra.com/payment-complete"
},
"CashfreeVendorSplits": {
  "Enabled":    true,
  "WebhookUrl": "<webhook proxy URL from Kaizen Infotech>",
  "Splits": [
    { "VendorId": "<Cashfree vendor 1 — commission>", "Percentage": 2.95 },
    { "VendorId": "<Cashfree vendor 2 — settlement>", "Percentage": 97.05 }
  ]
}
```

**Rules:**
- Percentages **must sum to 100.00**. The backend rejects payment initiation otherwise.
- The **last vendor** absorbs rounding drift (we compute it as `total − sum(other vendors)`), avoiding the `0.01 split mismatch` Cashfree error.
- All sensitive values (ProjectSecret, vendor IDs) belong in **environment variables on production**, not in git-tracked appsettings. Use `web.config` or systemd Environment for `KaizenGateway__ProjectSecret`, etc.

## Database — One-Time Migration

The `payments` table needs a new column to record the vendor split snapshot:

### Option 1 — EF CLI (recommended)

```bash
dotnet ef migrations add AddPaymentVendorSplitsJson \
  --project KaizenEvents.Infrastructure \
  --startup-project KaizenEvents.API

dotnet ef database update \
  --project KaizenEvents.Infrastructure \
  --startup-project KaizenEvents.API
```

### Option 2 — Raw SQL (if EF tooling not available)

```sql
ALTER TABLE payments
  ADD COLUMN vendor_splits_json JSON NULL
  AFTER gateway_payment_request_id;
```

Either way, the column accepts JSON like `[{"vendor_id":"X","amount":2.95},{"vendor_id":"Y","amount":97.05}]`. Existing payments stay `NULL`.

## How the Flow Works

### KaizenManaged + Cashfree path

```
1. User submits registration → frontend gets registration_id
2. Frontend calls POST /api/payments/create with gateway=cashfree
3. Backend:
   - Creates Cashfree order with order_splits (2 vendors) + notify_url=webhook_proxy
   - Saves Payment record with VendorSplitsJson snapshot
   - Computes HMAC signature (order_id + session_id + amount + return_url)
   - Returns { method:"kaizen_proxy_form_post", form_action, form_fields:{...} }
4. Frontend builds a hidden POST form and submits to Kaizen proxy
5. User pays on Cashfree checkout (rendered by Kaizen proxy on whitelisted domain)
6. Cashfree:
   - Settles money: 2.95% → vendor1 (commission), 97.05% → vendor2 (settlement)
   - Redirects user → Kaizen proxy → events.yatrimitra.com/payment-complete
   - Server-to-server webhook → Kaizen webhook proxy → our /api/payments/webhook/cashfree
7. /payment-complete page calls POST /api/payments/cashfree/return
   - Backend verifies proxy HMAC + double-checks with Cashfree API
   - Marks payment "completed", calls FinalizeRegistrationAsync
8. Both webhook + return path are idempotent — whichever arrives first activates
```

### OrganizerDirect + Cashfree path (unchanged)

```
1. User submits → /api/payments/create with gateway=cashfree
2. Backend creates Cashfree order with per-payment-account credentials, no splits, no proxy
3. Returns { gateway:"cashfree", payment_session_id }
4. Frontend uses Cashfree.js SDK in modal (existing flow)
5. Verification via /api/registrations/payment/verify/cashfree (existing flow)
```

## Switching Between Models

| Want | Set in appsettings |
|---|---|
| Off (use direct Cashfree, single account, settlement-time fee) | `CashfreeVendorSplits.Enabled = false` |
| On (Kaizen proxy + payment-time vendor splits for KaizenManaged) | `CashfreeVendorSplits.Enabled = true` + vendor IDs filled |
| Per-event control | Each event's **Fund Collection Mode**: KaizenManaged uses splits; OrganizerDirect bypasses |

## Where the 2.95% Lives Across the Codebase

| Location | What it does | When fee separation happens |
|---|---|---|
| [FundTransferController.cs:16](../KaizenEvents.API/Controllers/FundTransferController.cs#L16) | `PlatformFeeRate = 0.0295m` — used for fund-transfer reporting | Settlement time (always — for all gateways) |
| `CashfreeVendorSplits` config (this guide) | Sends `order_splits` to Cashfree at order creation | Payment time (only when enabled, only Cashfree, only KaizenManaged) |

Both work together. Even with vendor splits enabled, the fund-transfer reporting in admin still calculates `total × 0.0295` for display. The split changes WHERE money lands at payment time, not the accounting model.

## Production Checklist

Before turning splits on for live traffic:

- [ ] `Cashfree.Mode = "production"`, `BaseUrl` switched to `api.cashfree.com` (in CashfreeService — already env-aware)
- [ ] Production Cashfree `AppId` + `SecretKey` (not sandbox keys)
- [ ] Production vendor IDs (created + **active** in Cashfree dashboard, not just "registered")
- [ ] `KaizenGateway.ProjectSecret` rotated (don't reuse a secret that's been in chat or git history)
- [ ] `CashfreeVendorSplits.WebhookUrl` points to the production webhook proxy (HTTPS only)
- [ ] `KaizenGateway.ReturnUrl = https://events.yatrimitra.com/payment-complete`
- [ ] Test with one ₹1 transaction end-to-end. Check:
  - Money lands in BOTH vendor accounts (correct percentages)
  - `payments.vendor_splits_json` is populated
  - Webhook arrives, signature verifies, registration confirmed
  - User sees confirmation email

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| Payment initiate returns `Cashfree vendor split percentages must sum to 100` | Splits config doesn't add to exactly 100.00 | Adjust percentages in appsettings; check decimal precision |
| Payment initiate returns `splits enabled but no vendors configured` | `Splits[].VendorId` empty | Fill vendor IDs from Cashfree dashboard |
| Cashfree returns "Vendor not found" / "split mismatch" | Vendor ID typo or vendor not active in Cashfree | Verify each vendor in Cashfree dashboard |
| Return page shows `Invalid signature` | `KaizenGateway.ProjectSecret` doesn't match the one Kaizen Infotech registered | Re-confirm secret with Kaizen Infotech |
| Webhook doesn't fire | `CashfreeVendorSplits.WebhookUrl` empty or wrong | Set to the proxy URL on the whitelisted domain |
| Webhook fires but signature fails | Body re-serialized somewhere; or wrong `Cashfree.SecretKey` | Verify against raw bytes; cross-check secret in dashboard |

## Why a Proxy at All?

Cashfree only loads its checkout JS on **pre-whitelisted merchant domains**. Whitelisting takes manual approval and 1–3 days. The Kaizen Infotech proxy lives on a domain that's already approved by Cashfree, so any new Kaizen project can accept payments immediately by piggy-backing on it. The proxy doesn't see/store credentials — it just renders the Cashfree checkout page using the `payment_session_id` you computed.

## Reference

- Reference implementation (PHP): `docs/cashfree-payment-gateway_reference/`
- Setup guide: `docs/cashfree-payment-gateway_reference/SETUP_GUIDE.md`
- Vendor split details: `docs/cashfree-payment-gateway_reference/CASHFREE_VENDOR_SPLITS.md`
- Cashfree Easy Split docs: https://docs.cashfree.com/docs/easy-split-introduction
