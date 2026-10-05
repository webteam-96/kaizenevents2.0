# Cashfree Payment Gateway Proxy — Developer Setup Guide

**Maintained by:** Kaizen Infotech  
**Gateway hosted at:** `https://www.kaizeninfotech.com/cashfree-payment-gateway/`

---

## What Is This?

This is a **shared payment gateway proxy** hosted on `kaizeninfotech.com`. It sits between your application and Cashfree, handling the checkout page on a pre-whitelisted domain.

```
Your App  →  kaizeninfotech.com/cashfree-payment-gateway/pay.php  →  Cashfree Checkout
                                                                            ↓
Your App  ←  /payment-complete?order_id=&status=&signature=        ←  Cashfree Redirect
```

**Why use this instead of Cashfree directly?**  
Cashfree requires your domain to be whitelisted before the JS SDK works. This proxy runs on an already-whitelisted domain, so any new project can accept payments immediately without waiting for Cashfree domain approval.

---

## Files Overview

| File | Purpose |
|---|---|
| `config.php` | Database, Cashfree env, registered projects |
| `db_setup.sql` | Creates the transactions table (run once) |
| `helpers.php` | Signature functions, DB helpers |
| `pay.php` | Entry point — user lands here to pay |
| `response.php` | Cashfree redirects here after payment |
| `verify.php` | POST API — your backend can verify status |
| `dashboard.php` | Admin view of all transactions |
| `assets/style.css` | Styles for all pages |
| `examples/client_redirect.php` | Example: how to send user to gateway |
| `examples/client_return.php` | Example: how to handle the return |

---

## Part 1 — One-Time Server Setup (Done Once by Kaizen Infotech)

> This is already done. Skip to Part 2 if you are a developer integrating a new project.

1. Upload all files to `kaizeninfotech.com/cashfree-payment-gateway/`
2. Run `db_setup.sql` on the gateway MySQL database
3. Set DB credentials, `CASHFREE_ENV`, and `DASHBOARD_PASSWORD` in `config.php`

---

## Part 2 — Registering a New Project (Done by Kaizen Infotech)

To add a new project, Kaizen Infotech opens `config.php` on the server and adds an entry:

```php
$REGISTERED_PROJECTS = [
    'your_project_key' => [
        'secret'          => 'GENERATED_SECRET',   // see below
        'name'            => 'Your Project Name',
        'allowed_domains' => ['yourproject.com', 'www.yourproject.com', 'localhost'],
    ],
];
```

**Generate the secret** (run once in Node.js):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep this secret safe. You will need it in your application config.

---

## Part 3 — Integrating Into Your Application

### What you need from Kaizen Infotech

Before starting, get these values from Kaizen Infotech:

| Value | Example |
|---|---|
| `project_key` | `rotary_matchmaker` |
| `project_secret` | `00a9362bc9...` (64-char hex string) |
| Gateway pay URL | `https://www.kaizeninfotech.com/cashfree-payment-gateway/pay.php` |

You also need your own **Cashfree account credentials**:
- App ID
- Secret Key
- Environment: `sandbox` or `production`

---

### Step 1 — Store credentials in your app config

**.NET — `appsettings.json`:**
```json
"PaymentGateway": {
  "ProjectKey": "your_project_key",
  "ProjectSecret": "your_64_char_secret",
  "GatewayPayUrl": "https://www.kaizeninfotech.com/cashfree-payment-gateway/pay.php",
  "ReturnUrl": "https://yourproject.com/payment-complete"
},
"CashfreePayment": {
  "BaseUrl": "https://sandbox.cashfree.com/pg/",
  "ClientId": "your_cashfree_app_id",
  "ClientSecret": "your_cashfree_secret",
  "ApiVersion": "2023-08-01"
}
```

**PHP — environment variables or config file:**
```php
define('GATEWAY_PROJECT_KEY',    'your_project_key');
define('GATEWAY_PROJECT_SECRET', 'your_64_char_secret');
define('GATEWAY_PAY_URL',        'https://www.kaizeninfotech.com/cashfree-payment-gateway/pay.php');
define('RETURN_URL',             'https://yourproject.com/payment-complete');
define('CF_APP_ID',              'your_cashfree_app_id');
define('CF_SECRET_KEY',          'your_cashfree_secret');
define('CF_ENV',                 'sandbox');
```

---

### Step 2 — Create a Cashfree Order (Server Side)

**Your backend** must call the Cashfree API to create an order and get a `payment_session_id`.  
This MUST be done server-side — never from the browser.

**POST** `https://sandbox.cashfree.com/pg/orders`  
Headers: `x-client-id`, `x-client-secret`, `x-api-version: 2023-08-01`

```json
{
  "order_id": "YOUR_UNIQUE_ORDER_ID",
  "order_amount": "999.00",
  "order_currency": "INR",
  "customer_details": {
    "customer_id": "user_123",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "customer_phone": "9876543210"
  }
}
```

Response gives you: `payment_session_id`

---

### Step 3 — Generate the Request Signature

Before redirecting the user to the gateway, generate a signature to prove the request is from your trusted backend.

**Formula:**
```
signature = HMAC-SHA256( order_id + session_id + amount + return_url, project_secret )
```

Output must be **lowercase hex**.

**.NET (C#):**
```csharp
private static string GenerateSignature(string orderId, string sessionId, string amount, string returnUrl, string secret)
{
    var data = orderId + sessionId + amount + returnUrl;
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
    return BitConverter.ToString(hash).Replace("-", "").ToLower();
}
```

**PHP:**
```php
$signature = hash_hmac('sha256', $order_id . $session_id . $amount . $return_url, $project_secret);
```

**Node.js:**
```js
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', projectSecret)
  .update(orderId + sessionId + amount + returnUrl)
  .digest('hex');
```

---

### Step 4 — Send User to the Gateway (POST Form)

Do **not** use a GET redirect — the long `session_id` will trigger ModSecurity on the server.  
Use a **POST form** instead.

**Frontend (JavaScript/Next.js):**
```js
function redirectToGateway(gatewayPayUrl, params) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = gatewayPayUrl;

  Object.entries(params).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

// Call it with:
redirectToGateway('https://www.kaizeninfotech.com/cashfree-payment-gateway/pay.php', {
  session_id:     'session_abc123...',
  order_id:       'ORDER_001',
  project_key:    'your_project_key',
  return_url:     'https://yourproject.com/payment-complete',
  amount:         '999.00',
  currency:       'INR',
  customer_name:  'John Doe',
  customer_email: 'john@example.com',
  customer_phone: '9876543210',
  signature:      'generated_signature_hex',
});
```

**Required POST params:**

| Param | Required | Description |
|---|---|---|
| `session_id` | Yes | Cashfree `payment_session_id` from Step 2 |
| `order_id` | Yes | Your unique order ID |
| `project_key` | Yes | Your registered project key |
| `return_url` | Yes | Where user returns after payment |
| `signature` | Yes | HMAC signature from Step 3 |
| `amount` | No | Order amount (shown on checkout page) |
| `currency` | No | Default: `INR` |
| `customer_name` | No | Shown on checkout page |
| `customer_email` | No | Shown on checkout page |
| `customer_phone` | No | Shown on checkout page |

---

### Step 5 — Handle the Return (/payment-complete)

After payment, the gateway redirects the user back to your `return_url` with:
```
https://yourproject.com/payment-complete?order_id=ORDER_001&status=SUCCESS&signature=abc123
```

Possible `status` values: `SUCCESS`, `FAILED`, `CANCELLED`

**On your return page, do these 3 things in order:**

#### 5a — Verify the signature

Check the gateway's response is authentic:

**Formula:**
```
expected = HMAC-SHA256( order_id + status, project_secret )
```

**.NET (C#):**
```csharp
var expected = ComputeHmacSha256Hex(orderId + status, projectSecret);
if (!string.Equals(expected, receivedSignature, StringComparison.OrdinalIgnoreCase))
{
    // Reject — someone tampered with the URL
}
```

**PHP:**
```php
$expected = hash_hmac('sha256', $order_id . $status, $project_secret);
if (!hash_equals($expected, $received_signature)) {
    die('Invalid signature');
}
```

#### 5b — Verify server-side with Cashfree API

**NEVER trust the `status` in the URL alone.** Always confirm with Cashfree:

**GET** `https://sandbox.cashfree.com/pg/orders/{order_id}/payments`  
Headers: `x-client-id`, `x-client-secret`, `x-api-version: 2023-08-01`

Check that `payment_status === "SUCCESS"` in the response.

#### 5c — Update your database

Only activate the order/subscription **after** server-side confirmation in 5b:

```
if cashfree_api_status == "SUCCESS":
    activate_subscription()
    show_success_page()
else:
    show_failure_page()
```

---

### Step 6 — (Optional) Verify Status via Gateway API

You can also ask the gateway directly if a payment succeeded:

**POST** `https://www.kaizeninfotech.com/cashfree-payment-gateway/verify.php`

```json
{
  "project_key": "your_project_key",
  "order_id":    "ORDER_001",
  "signature":   "HMAC-SHA256(order_id, project_secret)"
}
```

Note: signature for verify endpoint is just `HMAC-SHA256(order_id, project_secret)` — no status.

Response:
```json
{
  "success": true,
  "order_id": "ORDER_001",
  "payment_status": "SUCCESS",
  "amount": "999.00",
  "currency": "INR"
}
```

---

## Part 4 — Webhook Proxy Setup

Part 3 only handles the user's **browser journey** (checkout → return). Cashfree also sends a **server-to-server webhook** when a payment completes, and that needs its own proxy on a whitelisted domain.

> **Why a separate proxy?** Same reason as `pay.php` — Cashfree only delivers webhooks to pre-whitelisted domains. If your API server (e.g. `api.yourproject.com`) isn't whitelisted, you need a proxy on a whitelisted domain (e.g. `yourproject.com` or `rotaryindia.com`) that receives the webhook and forwards it to your real API.

---

### How it fits into the overall flow

```
Payment completes on Cashfree
       ↓
Cashfree server → POSTs webhook to order_meta.notify_url
       ↓
Webhook proxy (on whitelisted domain)
       ↓ forwards raw body + signature headers byte-for-byte
Your real API server (api.yourproject.com/api/subscription/webhook)
       ↓ verifies signature, activates subscription
```

The webhook path runs **in parallel** with the return redirect (Step 5) — whichever arrives first activates the subscription, and the activation must be idempotent.

---

### Step 1 — Configure the webhook URL in your app

Add `WebhookUrl` to `CashfreePayment` in your `appsettings.json`:

```json
"CashfreePayment": {
  "BaseUrl": "https://sandbox.cashfree.com/pg/",
  "ClientId": "your_cashfree_app_id",
  "ClientSecret": "your_cashfree_secret",
  "ApiVersion": "2023-08-01",
  "WebhookUrl": "https://your-whitelisted-domain.com/api/subscription/webhook"
}
```

This URL is sent to Cashfree as `order_meta.notify_url` when creating each order:

```csharp
order_meta = new
{
    return_url = ReturnUrl.Replace("{order_id}", orderId),
    notify_url = _configuration["CashfreePayment:WebhookUrl"] ?? ""
}
```

---

### Step 2 — Deploy the webhook proxy

Pick one implementation based on your whitelisted domain's hosting.

#### Option A — PHP (`webhook.php`)

Upload to `your-whitelisted-domain.com/api/subscription/webhook.php` (or rewrite `/api/subscription/webhook` → this file):

```php
<?php
define('API_TARGET', 'https://api.yourproject.com/api/subscription/webhook');

$rawBody   = file_get_contents('php://input');
$timestamp = $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? '';
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';

$ch = curl_init(API_TARGET);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $rawBody,         // raw body — do NOT re-encode
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'x-webhook-timestamp: ' . $timestamp,
        'x-webhook-signature: ' . $signature,
    ],
]);
curl_exec($ch);
curl_close($ch);

http_response_code(200);  // Always 200 — prevents Cashfree retries
echo 'OK';
```

#### Option B — .NET minimal API (`RotaryRishtey.Webhook`)

Deploy a standalone .NET 8 app:

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpClient("ApiForward", c => c.Timeout = TimeSpan.FromSeconds(30));
var app = builder.Build();

app.MapPost("/api/subscription/webhook", async (HttpContext ctx, IHttpClientFactory f, IConfiguration cfg) =>
{
    using var reader = new StreamReader(ctx.Request.Body, leaveOpen: true);
    var rawBody   = await reader.ReadToEndAsync();
    var timestamp = ctx.Request.Headers["x-webhook-timestamp"].ToString();
    var signature = ctx.Request.Headers["x-webhook-signature"].ToString();

    var target  = cfg["ForwardTo:WebhookUrl"]!;
    var request = new HttpRequestMessage(HttpMethod.Post, target)
    {
        Content = new StringContent(rawBody, System.Text.Encoding.UTF8, "application/json")
    };
    request.Headers.TryAddWithoutValidation("x-webhook-timestamp", timestamp);
    request.Headers.TryAddWithoutValidation("x-webhook-signature", signature);

    await f.CreateClient("ApiForward").SendAsync(request);
    return Results.Ok();   // Always 200
});
app.Run();
```

With `appsettings.json` on the proxy:
```json
{
  "ForwardTo": { "WebhookUrl": "https://api.yourproject.com/api/subscription/webhook" }
}
```

---

### Step 3 — Verify the signature on your real API

The webhook signature is generated by **Cashfree** (not the Kaizen gateway), so the formula and secret are different from Part 3's signatures.

**Formula:**
```
expected = HMAC-SHA256( timestamp + raw_json_body, cashfree_client_secret )
```

Output in **Base64** (Cashfree's format — not hex).

**.NET (C#):**
```csharp
var data = timestamp + rawBody;
using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(clientSecret));
var expected = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(data)));
if (!string.Equals(expected, receivedSignature, StringComparison.Ordinal))
{
    // Invalid — log and still return 200 to avoid retries
}
```

**Critical rules:**

- Use the **raw JSON body** — never deserialize then re-serialize. It will change whitespace/key order and break the signature.
- Use `ClientSecret` from Cashfree dashboard, **not** the project secret from Part 3.
- Always return HTTP 200 — even on invalid signature. Non-200 triggers Cashfree retries.

---

### Step 4 — Make activation idempotent

Cashfree may deliver the same webhook multiple times (retries, network blips). Your handler must:

1. Look up the order in your DB
2. If already active (`IsWebhookDone = true` or `Status = "Active"`), return 200 without re-activating
3. Otherwise, activate and set the flag in one transaction

```csharp
if (subscription.Status == "Active") return; // already done
if (paymentStatus == "SUCCESS") {
    subscription.IsWebhookDone = true;
    await ActivateSubscriptionAsync(subscription, cfPaymentId);
}
```

---

### Webhook vs return redirect — which activates the subscription?

Both can, but the webhook is the **authoritative** path:

| Event | Depends on browser? | Reliable? | Used for |
|---|---|---|---|
| Return redirect (Step 5) | Yes | ❌ user may close tab, lose network | Showing success UI |
| Webhook (Part 4) | No | ✅ Cashfree retries until 200 | Activating subscription |

Your return-page handler should verify via `GET /pg/orders/{order_id}/payments` (Step 5b) to activate eagerly if the user is still watching. The webhook is the safety net that catches everything else.

---

## Signature Quick Reference

| Direction | Formula | Encoding | Secret | Used In |
|---|---|---|---|---|
| Client → Gateway | `HMAC-SHA256(order_id + session_id + amount + return_url, secret)` | hex (lowercase) | `project_secret` | Step 3 — request to pay.php |
| Gateway → Client | `HMAC-SHA256(order_id + status, secret)` | hex (lowercase) | `project_secret` | Step 5a — verify return redirect |
| Client → verify.php | `HMAC-SHA256(order_id, secret)` | hex (lowercase) | `project_secret` | Step 6 — status check API |
| Cashfree → Your API | `HMAC-SHA256(timestamp + raw_body, secret)` | **Base64** | `cashfree_client_secret` | Part 4 Step 3 — webhook verify |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `HTTP 403 ModSecurity` on pay.php | Long `session_id` in GET URL | Use POST form (Step 4) |
| `Request signature is invalid` | Wrong secret or wrong formula | Double-check secret matches config.php; check field order in formula |
| `Unauthorized return URL` | `return_url` domain not in `allowed_domains` | Ask Kaizen Infotech to add your domain to config.php |
| `Unknown project_key` | Wrong key or not registered | Ask Kaizen Infotech to register your project in config.php |
| `Transaction not found` on verify | Order was never sent to pay.php | Ensure pay.php was hit before calling verify.php |
| Payment succeeds but subscription not activated | Server-side Cashfree check skipped | Always verify via Cashfree API (Step 5b) — never trust redirect status alone |
| Webhook signature verification fails | Body re-serialized in proxy/handler | Forward + verify against **raw body bytes** — never deserialize then re-stringify |
| Cashfree keeps retrying webhook | Proxy or API returned non-200 | Always return 200 — even on invalid signature or unknown order |
| Webhook never arrives | `notify_url` domain not whitelisted, or wrong URL | Check `CashfreePayment.WebhookUrl` in appsettings points to the whitelisted proxy domain |
| Subscription activated twice | Webhook handler not idempotent | Check `IsWebhookDone` / `Status == "Active"` before activating (Part 4 Step 4) |

---

## Admin Dashboard

View all transactions across all projects:

```
https://www.kaizeninfotech.com/cashfree-payment-gateway/dashboard.php
```

- Password protected (contact Kaizen Infotech for access)
- Filter by project, status, date range
- Export CSV

---

## Going Live Checklist

**Payment gateway (Part 3):**
- [ ] Change `CASHFREE_ENV` to `production` in `config.php` on the gateway server
- [ ] Switch Cashfree credentials to production (`ClientId`, `ClientSecret`, `BaseUrl`)
- [ ] Update `return_url` to production domain (e.g. `https://yourproject.com/payment-complete`)
- [ ] Add your production domain to `allowed_domains` in `config.php`

**Webhook proxy (Part 4):**
- [ ] Deploy webhook proxy (`webhook.php` or `RotaryRishtey.Webhook`) to your whitelisted domain
- [ ] Set `CashfreePayment.WebhookUrl` in your app's `appsettings.json` to the proxy URL
- [ ] Set `ForwardTo.WebhookUrl` in the proxy's config to your real API URL
- [ ] Verify the proxy forwards the **raw body byte-for-byte** (re-serialization breaks the signature)
- [ ] Confirm your API verifies the webhook signature using `ClientSecret` (not project secret)
- [ ] Ensure webhook handler is idempotent (checks `IsWebhookDone` before re-activating)

**End-to-end:**
- [ ] Test with a real small transaction
- [ ] Confirm webhook is hitting your backend (check `is_webhook_done` flag in your DB)
- [ ] Confirm subscription activates even if the user closes the browser before the return redirect

---

## Contact

For project registration, secret generation, or server issues:  
**Kaizen Infotech** — add your project to `config.php` on the gateway server.
