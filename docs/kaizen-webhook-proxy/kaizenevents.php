<?php
/**
 * Cashfree → Kaizen Events Webhook Proxy
 * ==========================================
 *
 * This file lives on kaizeninfotech.com (a Cashfree-whitelisted domain)
 * and forwards raw webhook POSTs to the Kaizen Events backend.
 *
 * Why a proxy: Cashfree only delivers webhooks to pre-whitelisted domains.
 * The Kaizen Events backend domain may not be on that list, so this proxy
 * receives on the whitelisted domain and forwards byte-for-byte.
 *
 * CRITICAL RULES:
 *  1. Forward the raw request body — DO NOT json_decode/json_encode.
 *     Re-serialization changes whitespace/key order and breaks Cashfree's
 *     HMAC-SHA256 signature verification on the backend.
 *  2. Forward the signature headers verbatim.
 *  3. Always return HTTP 200 — even on errors — so Cashfree doesn't retry.
 *
 * Deploy:
 *   Upload to https://www.kaizeninfotech.com/webhooks/kaizenevents/kaizenevents.php
 *   (or whatever path you prefer on the whitelisted domain)
 *
 * Kaizen Events admin then sets:
 *   appsettings.json → CashfreeVendorSplits.WebhookUrl =
 *     "https://www.kaizeninfotech.com/webhooks/kaizenevents/kaizenevents.php"
 */

// ─── Configuration ──────────────────────────────────────────────────────────
// Where to forward the webhook. This must be the actual Kaizen Events backend.
//
// NOTE the DOUBLE /api in production: the .NET app is mounted at
// https://events.yatrimitra.com/api (IIS sub-application), and the app's own
// route is /api/payments/webhook/cashfree — so the public URL is /api/api/...
//
// Production (single subdomain, app mounted under /api):
//   https://events.yatrimitra.com/api/api/payments/webhook/cashfree
//
// Production (split subdomain, app mounted at the root):
//   https://api.yatrimitra.com/api/payments/webhook/cashfree
//
// Local testing via ngrok (app at the root):
//   https://<ngrok-id>.ngrok-free.app/api/payments/webhook/cashfree
define('TARGET_URL', 'https://events.yatrimitra.com/api/api/payments/webhook/cashfree');

// Optional: log forwarded events to a file for debugging.
// Comment out the next line to disable logging entirely.
define('LOG_FILE', __DIR__ . '/kaizenevents.log');

// Forward timeout in seconds. Cashfree expects a fast response, so keep this short.
define('FORWARD_TIMEOUT', 25);

// ─── Helpers ────────────────────────────────────────────────────────────────
function logLine(string $message): void {
    if (!defined('LOG_FILE') || !LOG_FILE) return;
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $message . "\n";
    @file_put_contents(LOG_FILE, $line, FILE_APPEND | LOCK_EX);
}

// ─── Step 1: Read incoming request ─────────────────────────────────────────
// Read RAW body bytes — never decode + re-encode (would break the signature).
$rawBody = file_get_contents('php://input') ?: '';

// Cashfree's signature headers
$timestamp = $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? '';
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$version   = $_SERVER['HTTP_X_WEBHOOK_VERSION']   ?? '';

logLine("Incoming webhook: " . strlen($rawBody) . " bytes, timestamp=$timestamp, sig=" . substr($signature, 0, 12) . '...');

// ─── Step 2: Forward to Kaizen Events backend ──────────────────────────────
$ch = curl_init(TARGET_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $rawBody,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => FORWARD_TIMEOUT,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Content-Length: ' . strlen($rawBody),
        'x-webhook-timestamp: ' . $timestamp,
        'x-webhook-signature: ' . $signature,
        'x-webhook-version: '   . $version,
        'User-Agent: KaizenWebhookProxy/1.0',
    ],
]);

$response   = curl_exec($ch);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($curlError !== '') {
    logLine("Forward FAILED: curl error = $curlError");
} else {
    $shortResp = substr((string)$response, 0, 200);
    logLine("Forward OK: HTTP $httpCode | response=$shortResp");
}

// ─── Step 3: Always return 200 to Cashfree ─────────────────────────────────
// Even if our backend was unreachable, returning 200 prevents Cashfree from
// flooding us with retries. Logging captures any forwarding failure for the
// admin to inspect later.
http_response_code(200);
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'status'  => 'forwarded',
    'forward_http_code' => $httpCode,
]);
