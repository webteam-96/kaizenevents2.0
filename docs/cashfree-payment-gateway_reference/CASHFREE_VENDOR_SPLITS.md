# Cashfree Payment Gateway — Developer Guide

A simple guide for new developers working on the Rotary Rishtey payment system.
**Read this if:** you're joining the project and need to understand how subscription payments and vendor splits work.

---

## TL;DR (read this first)

1. A user buys a subscription (1-year ₹11 or 2-year ₹14).
2. Our backend creates an order on Cashfree and tells Cashfree: *"split this money between Vendor A (2.95%) and Vendor B (97.05%)."*
3. The user pays on Cashfree's checkout page.
4. Cashfree sends us a webhook saying "payment successful" → we activate the subscription.
5. Cashfree settles the money to the two vendor bank accounts automatically.

That's it. The rest of this doc explains the details.

---

## 1. What is a "Vendor Split"?

Imagine a customer pays ₹100 for something. Normally, that ₹100 lands in one bank account.

A **vendor split** lets Cashfree send portions of that ₹100 to **multiple bank accounts** automatically. For example:
- ₹2.95 → Vendor A's account (commission)
- ₹97.05 → Vendor B's account (settlement)

You don't have to manually transfer money later. Cashfree does the split when it settles the funds.

In our project, we have **two vendors** configured. Both are Federal Bank accounts owned by Kaizen Events.

---

## 2. Configuration (where to look)

All payment settings live in **one file**:

📄 `backend/RotaryRishtey.Api/appsettings.json`

```json
"SubscriptionPlans": {
  "1year": { "Price": 11.00, "DurationYears": 1 },
  "2year": { "Price": 14.00, "DurationYears": 2 }
},

"CashfreePayment": {
  "BaseUrl":      "https://sandbox.cashfree.com/pg/",
  "ClientId":     "TEST...",
  "ClientSecret": "REDACTED_CASHFREE_KEY...",
  "ApiVersion":   "2023-08-01",
  "WebhookUrl":   "https://api.rotarymatchmaker.com/api/subscription/webhook",
  "VendorSplits": [
    { "VendorId": "Sandbox1_KaizenEventsFederalBank", "Percentage": 2.95  },
    { "VendorId": "Sandbox2_KaizenEventsFederalBank", "Percentage": 97.05 }
  ]
}
```

### Two important rules
1. **Percentages must add up to exactly 100.** Cashfree will reject the order otherwise.
2. **Vendor IDs must already exist in the Cashfree dashboard.** You can't invent a vendor ID — it has to be created and approved on Cashfree first.

---

## 3. How the split is calculated

The formula is dead simple:

```
vendorAmount = round( orderAmount × (percentage / 100), 2 )
```

### Example: ₹11.00 plan (1-year subscription)

| Vendor                                | Percentage | Math              | Amount sent |
| ------------------------------------- | ---------- | ----------------- | ----------- |
| `Sandbox1_KaizenEventsFederalBank`    | 2.95%      | 11.00 × 0.0295    | **₹0.32**   |
| `Sandbox2_KaizenEventsFederalBank`    | 97.05%     | 11.00 × 0.9705    | **₹10.68**  |
| **Total**                             | 100%       |                   | **₹11.00**  |

### Example: ₹14.00 plan (2-year subscription)

| Vendor                                | Percentage | Math              | Amount sent |
| ------------------------------------- | ---------- | ----------------- | ----------- |
| `Sandbox1_KaizenEventsFederalBank`    | 2.95%      | 14.00 × 0.0295    | **₹0.41**   |
| `Sandbox2_KaizenEventsFederalBank`    | 97.05%     | 14.00 × 0.9705    | **₹13.59**  |
| **Total**                             | 100%       |                   | **₹14.00**  |

### Example: ₹999.00 (just to show bigger numbers)

| Vendor                                | Percentage | Math               | Amount sent |
| ------------------------------------- | ---------- | ------------------ | ------------ |
| `Sandbox1_KaizenEventsFederalBank`    | 2.95%      | 999 × 0.0295       | **₹29.47**   |
| `Sandbox2_KaizenEventsFederalBank`    | 97.05%     | 999 × 0.9705       | **₹969.53**  |
| **Total**                             | 100%       |                    | **₹999.00**  |

> **⚠ Watch out for rounding:** if both rows are rounded independently, the sum can sometimes be ₹0.01 off from the order total. If Cashfree rejects an order with "split mismatch," compute the second vendor as `orderAmount − firstVendorAmount` instead of as an independent percentage.

---

## 4. The full payment flow (step by step)

```
USER clicks "Subscribe"
        │
        ▼
[1] Frontend  →  POST /api/subscription/initiate  →  Backend
        │
        ▼
[2] Backend creates an order ID like:  SUB_42_1714200000
        (format: SUB_{userId}_{unixTimestamp})
        │
        ▼
[3] Backend calculates the vendor split amounts
        │
        ▼
[4] Backend calls Cashfree:  POST /pg/orders
        Sends: order_id, amount, customer details,
               order_splits array, return_url, notify_url
        │
        ▼
[5] Cashfree returns a payment_session_id
        │
        ▼
[6] Backend saves a row in `subscriptions` table
        status = "Pending"
        vendor_splits_json = "[ {vendor_id, amount}, ... ]"
        │
        ▼
[7] Backend redirects user to Cashfree checkout page
        │
        ▼
[8] USER pays on Cashfree
        │
        ├──────────── PATH A (server-to-server) ────────────┐
        │                                                    │
        │  Cashfree calls our webhook:                       │
        │  POST /api/subscription/webhook                    │
        │  → We verify signature                             │
        │  → If SUCCESS: activate subscription               │
        │                                                    │
        ├──────────── PATH B (browser redirect) ────────────┤
        │                                                    │
        │  User's browser is redirected back to us:          │
        │  GET /api/subscription/payment-complete            │
        │  → We verify signature                             │
        │  → We DOUBLE-CHECK with Cashfree's API             │
        │  → If SUCCESS: activate subscription               │
        │                                                    │
        ▼                                                    ▼
              Whichever path arrives first wins.
              The other one sees "already active" and skips.
              (This is called "idempotent.")
```

### Why are there TWO paths (webhook + redirect)?

- The **webhook** is reliable — Cashfree retries if it fails. But the user might see "Success!" before we receive it.
- The **browser redirect** is fast — the user gets immediate feedback. But it can be tampered with, so we always verify against Cashfree's API.

Using both = best of both worlds.

---

## 5. Files you need to know

| File                                                     | What it does |
| -------------------------------------------------------- | ------------ |
| `appsettings.json`                                       | All config: prices, vendor splits, Cashfree credentials. |
| `Services/CashfreeService.cs`                            | Talks to Cashfree's API. Builds the order JSON, calculates splits. |
| `Services/SubscriptionService.cs`                        | The "brain." Handles initiate, verify, webhook, activate. |
| `Controllers/SubscriptionController.cs`                  | The HTTP routes (`/api/subscription/*`). |
| `Controllers/WebhookController.cs`                       | The webhook endpoint Cashfree calls. |
| `Models/Subscription.cs`                                 | The `subscriptions` DB table model. |
| `DTOs/SubscriptionDTOs.cs`                               | Request/response shapes. |

---

## 6. API endpoints (cheat sheet)

| Method | Route                                  | Who calls it      | What it does |
| ------ | -------------------------------------- | ----------------- | ------------ |
| GET    | `/api/subscription/plans`              | Frontend          | List available plans. |
| POST   | `/api/subscription/initiate`           | Frontend          | Start a payment. Returns checkout URL. |
| GET    | `/api/subscription/status`             | Frontend          | Is the user currently subscribed? |
| GET    | `/api/subscription/verify/{orderId}`   | Frontend          | Manually re-check a payment. |
| GET    | `/api/subscription/payment-complete`   | Browser redirect  | Final landing after payment. |
| POST   | `/api/subscription/webhook`            | Cashfree (server) | Server-to-server payment status update. |
| GET    | `/api/subscription/admin`              | Admin frontend    | List all subscriptions. |
| POST   | `/api/subscription/admin/activate`     | Admin frontend    | Manually activate a subscription. |

---

## 7. The `vendor_splits_json` column (audit trail)

Every time we create an order, we **save a snapshot** of the split into the database:

📄 `subscriptions.vendor_splits_json` (longtext)

Example value:
```json
[
  { "vendor_id": "Sandbox1_KaizenEventsFederalBank", "amount": 0.32  },
  { "vendor_id": "Sandbox2_KaizenEventsFederalBank", "amount": 10.68 }
]
```

### Why save it?
- **Audit:** if someone changes the percentages tomorrow, we still know what was used yesterday.
- **Reconciliation:** finance can compare this against Cashfree's settlement report.
- **Admin panel:** the admin subscription list shows this column directly.

> ⚠ **Important:** changing percentages in `appsettings.json` does NOT update old rows. Only new orders use the new percentages.

---

## 8. Security: signatures explained

There are **3 different signatures** in the flow. Don't get them confused.

| # | Signature                  | When                              | Formula                                                            | Encoding |
| - | -------------------------- | --------------------------------- | ------------------------------------------------------------------ | -------- |
| 1 | **Cashfree webhook**       | Cashfree → our server             | `HMAC-SHA256(timestamp + rawBody, ClientSecret)`                   | Base64   |
| 2 | **Client → Gateway proxy** | Our server → Kaizen proxy         | `HMAC-SHA256(order_id + session_id + amount + return_url, ProjectSecret)` | Hex      |
| 3 | **Gateway → Client**       | Kaizen proxy → our server         | `HMAC-SHA256(order_id + status, ProjectSecret)`                    | Hex      |

The first one uses **Cashfree's** secret. The other two use our **own ProjectSecret** (used by the Kaizen proxy at `kaizeninfotech.com/cashfree-payment-gateway`).

### Golden rule
**Never trust a payment status from a redirect alone.** Always verify by calling Cashfree's `GetPaymentStatusAsync`. The redirect is just a hint.

---

## 9. How to test locally (sandbox)

1. **Sandbox credentials are already in `appsettings.json`.** Don't commit production keys here.
2. **Cashfree test cards:** see https://docs.cashfree.com/docs/test-cards.
3. **Webhook testing:** Cashfree can't reach `localhost`. Use ngrok or the Kaizen webhook proxy:
   - Tunnel: `ngrok http 5000`
   - Update `CashfreePayment:WebhookUrl` in Cashfree dashboard to your ngrok URL.
4. **Run backend:**
   ```bash
   cd backend/RotaryRishtey.Api
   dotnet run
   ```
5. **Run frontend:**
   ```bash
   cd frontend/rotary-rishtey-web
   npm run dev
   ```
6. Open `http://localhost:3000`, log in, click subscribe.

---

## 10. Going to production (checklist)

- [ ] Replace `CashfreePayment.BaseUrl` from `sandbox.cashfree.com` → `api.cashfree.com`
- [ ] Replace `ClientId` and `ClientSecret` with **production** keys
- [ ] Replace vendor IDs (`Sandbox1_*`, `Sandbox2_*`) with the **real** registered production vendor IDs
- [ ] Make sure `WebhookUrl` points to the production HTTPS URL
- [ ] Configure that same webhook URL inside the Cashfree dashboard
- [ ] Verify both production vendors are **active** in the Cashfree dashboard (not just "registered")
- [ ] Test with a real ₹1 transaction before going live

---

## 11. Common problems & fixes

| Problem                                                     | Cause                                            | Fix |
| ----------------------------------------------------------- | ------------------------------------------------ | --- |
| `Cashfree create order response: BadRequest`                | Vendor ID doesn't exist or isn't active          | Check vendor exists in Cashfree dashboard. |
| Order created but split amount mismatch error               | ₹0.01 rounding drift                             | Use `total − firstVendor` for the second vendor amount. |
| Webhook never fires                                         | Webhook URL not reachable / not HTTPS            | Cashfree requires public HTTPS. Use ngrok in dev. |
| Webhook fires but signature fails                           | Wrong `ClientSecret` or modified request body    | Don't read the body twice. Verify against the raw bytes. |
| User paid but subscription still "Pending"                  | Both webhook and redirect missed                 | User can call `/api/subscription/verify/{orderId}` to retry. |
| User charged twice                                          | Should not happen — `ActivateSubscriptionAsync` is idempotent | Check `subscriptions` table — only one row should be `Active`. |

---

## 12. Glossary

- **Order** — A request to Cashfree to charge a customer. Identified by our `order_id` (like `SUB_42_1714200000`) and Cashfree's `cf_order_id`.
- **Payment Session ID** — A token Cashfree gives us. The frontend uses it to load the checkout page.
- **Webhook** — A server-to-server HTTP POST from Cashfree to us, telling us what happened.
- **Vendor Split / Easy Split** — Cashfree's feature for splitting a payment across multiple bank accounts.
- **Idempotent** — Calling the same operation twice has the same effect as calling it once. Our activation logic is idempotent — paying twice (somehow) won't extend the subscription twice.
- **HMAC-SHA256** — A cryptographic signature. Proves a message wasn't tampered with, by anyone who doesn't know the secret key.

---

## Questions?

- Cashfree docs: https://docs.cashfree.com/docs/easy-split-introduction
- Project docs: `docs/SUBSCRIPTION_PAYMENT_PLAN.md`, `docs/payment-gateway-plan.md`
- Setup guide: `cashfree-payment-gateway/SETUP_GUIDE.md`
