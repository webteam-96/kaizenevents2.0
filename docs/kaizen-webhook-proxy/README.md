# Kaizen Events — Cashfree Webhook Proxy

A single-purpose PHP file that lives on `kaizeninfotech.com` (a Cashfree-whitelisted
domain) and forwards Cashfree webhook POSTs to the Kaizen Events backend.

## Files in This Folder

| File | Purpose |
|---|---|
| `kaizenevents.php` | The actual proxy. Receives Cashfree POSTs, forwards raw body + headers to backend, always returns 200. |
| `.htaccess` | Optional Apache rewrite so the public URL can be `/kaizenevents` instead of `/kaizenevents.php`. Also blocks public access to `kaizenevents.log`. |
| `kaizenevents.log` | Generated at runtime by `kaizenevents.php` if logging is enabled. **Don't pre-create this file.** |
| `README.md` | This file. |

## Why a Proxy

Cashfree only delivers webhooks to **pre-whitelisted merchant domains**.
Whitelisting takes manual review and 1–3 days per domain.
The Kaizen Infotech proxy lives on a domain that's already whitelisted,
so any Kaizen Infotech project (including Kaizen Events) can receive
Cashfree webhooks immediately by piggy-backing on it.

```
[Cashfree] ──webhook POST──▶ [kaizeninfotech.com/webhooks/kaizenevents/kaizenevents.php]
                                       │
                                       │ forwards raw body + headers byte-for-byte
                                       ▼
                       [events.yatrimitra.com/api/payments/webhook/cashfree]
                                       │
                                       │ verifies HMAC signature, finalizes registration
                                       ▼
                                  [DB updated]
```

## Server-Side Deploy Instructions (for Kaizen Infotech admin)

### 1. Pick a path on the whitelisted domain

For example: `https://www.kaizeninfotech.com/webhooks/kaizenevents/`

(The exact path is up to the admin — just remember it for step 5.)

### 2. Upload files

Copy these two files via FTP/SSH/cPanel to that path:

- `kaizenevents.php`
- `.htaccess` (only if the server is Apache)

Final layout on the server:
```
/var/www/kaizeninfotech.com/htdocs/webhooks/kaizenevents/
├── kaizenevents.php
└── .htaccess
```

### 3. Edit `kaizenevents.php` — set the target URL

Open `kaizenevents.php` and find this line near the top:

```php
  , 'https://events.yatrimitra.com/api/payments/webhook/cashfree');
```

Change it to whichever URL is correct:

| Setup | URL |
|---|---|
| Production (single-subdomain) | `https://events.yatrimitra.com/api/payments/webhook/cashfree` |
| Production (split-subdomain)  | `https://api.yatrimitra.com/api/payments/webhook/cashfree` |
| Local testing (via ngrok)     | `https://<ngrok-id>.ngrok-free.app/api/payments/webhook/cashfree` |

Save the file.

### 4. Verify file permissions

```bash
chmod 644 kaizenevents.php .htaccess
chown www-data:www-data kaizenevents.php .htaccess  # or whichever user runs Apache/PHP
```

If logging is enabled (default), the directory must be writable so `kaizenevents.log`
can be created on first request:

```bash
chmod 755 .   # the folder containing kaizenevents.php
```

### 5. Test the proxy is reachable

```bash
curl -X POST https://www.kaizeninfotech.com/webhooks/kaizenevents/kaizenevents.php \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
```

Expected response (HTTP 200):
```json
{"status":"forwarded","forward_http_code":400}
```

`forward_http_code: 400` is fine here — it means Kaizen Events backend
was reached but rejected because the test request had no Cashfree signature.
That confirms forwarding works.

### 6. Hand the URL back to the Kaizen Events team

Give them the public URL of `kaizenevents.php`, e.g.:

```
https://www.kaizeninfotech.com/webhooks/kaizenevents/kaizenevents.php
```

They'll paste it into `appsettings.json` → `CashfreeVendorSplits.WebhookUrl`.

## Configuration in Kaizen Events Backend

Once the proxy is live, the Kaizen Events team adds:

```json
"CashfreeVendorSplits": {
  "Enabled":    true,
  "WebhookUrl": "https://www.kaizeninfotech.com/webhooks/kaizenevents/kaizenevents.php",
  "Splits": [ ... ]
}
```

When Kaizen Events creates a Cashfree order, this URL is sent to Cashfree as
`order_meta.notify_url`. Cashfree then POSTs the webhook to the proxy → proxy
forwards to Kaizen Events backend → backend verifies + activates registration.

## How Idempotency Works

Cashfree may retry a webhook 3+ times (network blips, slow responses).
The Kaizen Events backend handles this:

1. Each webhook is verified by HMAC signature.
2. If the payment is already marked `completed` in the DB, the backend returns
   200 immediately without re-running activation.
3. The `payments.status` column acts as the idempotency key.

The proxy itself doesn't need any idempotency logic — it just forwards.

## Logging & Debugging

By default, `kaizenevents.php` writes one line per webhook to `kaizenevents.log` in the
same folder, like:

```
[2026-04-28 14:32:18] Incoming webhook: 432 bytes, timestamp=1714325538, sig=abc123def456...
[2026-04-28 14:32:18] Forward OK: HTTP 200 | response={"status":"success","message":"Payment confirmed."}
```

To disable logging, comment out this line at the top of `kaizenevents.php`:
```php
define('LOG_FILE', __DIR__ . '/kaizenevents.log');
```

Logs accumulate over time — rotate or truncate periodically. The `.htaccess`
already blocks public access to `kaizenevents.log`.

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| 404 from the proxy URL | Wrong path / not uploaded | Verify file is at the URL the admin gave you |
| 500 from `kaizenevents.php` | PHP version too old, or curl extension missing | Need PHP 7.4+ with curl extension enabled |
| Always logs `Forward FAILED: curl error = ...` | Backend URL unreachable from the proxy server | Check `TARGET_URL`, firewall, DNS |
| Always logs `Forward OK: HTTP 400` and Cashfree dashboard shows webhooks delivered | Backend rejecting due to signature mismatch | Double-check `Cashfree.SecretKey` (used for HMAC) matches what's in Cashfree dashboard |
| Cashfree dashboard shows webhook attempts but proxy log is empty | Wrong webhook URL configured in Kaizen Events appsettings | Verify `CashfreeVendorSplits.WebhookUrl` matches the proxy URL exactly |

## Security Notes

- **Don't log full request bodies** in production — they may contain customer
  PII. The current `kaizenevents.php` only logs sizes and signature prefixes, which
  is safe.
- Keep this proxy behind HTTPS with a valid cert (Cashfree won't deliver to
  HTTP). The `.htaccess` doesn't enforce HTTPS — that's the server's job.
- The proxy doesn't verify Cashfree's signature itself; only forwards. The
  backend does the verification with `Cashfree.SecretKey`. So the proxy never
  needs any Cashfree credentials — keep this folder credential-free.

## What This Proxy Does NOT Do

- ❌ Does not verify Cashfree's signature (backend does it)
- ❌ Does not parse JSON or transform the body in any way
- ❌ Does not handle order creation (only webhooks)
- ❌ Does not store the webhook content in a DB
- ❌ Does not route different webhook types — every webhook just gets forwarded
