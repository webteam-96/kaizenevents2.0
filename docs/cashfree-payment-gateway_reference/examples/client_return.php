<?php
/**
 * EXAMPLE: Client Return Page (payment-complete)
 * ---------------------------------------------------
 * Place this at: rotarymatchmaker.com/payment-complete
 *
 * This example shows how to:
 *   1. Receive the redirect from the payment gateway
 *   2. Verify the response signature
 *   3. Verify payment status server-side via Cashfree API (REQUIRED — never trust redirect alone)
 *   4. Update your local database
 *   5. Show success/failure to the user
 *
 * The gateway redirects here with:
 *   ?order_id=ORDER_ID&status=SUCCESS&signature=HMAC_SIGNATURE
 */

// ─── Your project's credentials ───────────────────────────────────────────────
define('GATEWAY_PROJECT_SECRET', 'rm_secret_key_REPLACE_WITH_STRONG_SECRET');

// Cashfree API credentials (for server-side verification)
define('CF_APP_ID',     'your_cashfree_app_id');
define('CF_SECRET_KEY', 'your_cashfree_secret_key');
define('CF_ENV',        'sandbox'); // 'sandbox' or 'production'

// ─── Step 1: Receive parameters from gateway redirect ─────────────────────────
$order_id           = trim($_GET['order_id']  ?? '');
$status_from_gw     = strtoupper(trim($_GET['status']    ?? ''));
$received_signature = trim($_GET['signature'] ?? '');

// Basic input presence check
if (!$order_id || !$status_from_gw || !$received_signature) {
    show_result('error', 'Invalid payment response. Missing parameters.');
    exit;
}

// ─── Step 2: Verify the signature from the gateway ────────────────────────────
// Formula (gateway → client): hash_hmac('sha256', order_id . payment_status, project_secret)
$expected_signature = hash_hmac('sha256', $order_id . $status_from_gw, GATEWAY_PROJECT_SECRET);

if (!hash_equals($expected_signature, $received_signature)) {
    error_log("Payment gateway: signature mismatch for order_id=$order_id");
    show_result('error', 'Invalid payment signature. Please contact support.');
    exit;
}

// ─── Step 3: Verify payment server-side via Cashfree API ──────────────────────
// IMPORTANT: The redirect status can be tampered with. ALWAYS verify server-side.
$cf_api_base = (CF_ENV === 'production')
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

$ch = curl_init("$cf_api_base/orders/$order_id");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPGET        => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'x-api-version: 2023-08-01',
        'x-client-id: ' . CF_APP_ID,
        'x-client-secret: ' . CF_SECRET_KEY,
    ],
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$cf_response_raw = curl_exec($ch);
$curl_error      = curl_error($ch);
$http_code       = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($curl_error || $http_code !== 200) {
    error_log("Cashfree order fetch failed: HTTP $http_code | $curl_error | $cf_response_raw");
    show_result('error', 'Unable to verify payment. Please contact support with order ID: ' . htmlspecialchars($order_id));
    exit;
}

$cf_order        = json_decode($cf_response_raw, true);
$verified_status = strtoupper($cf_order['order_status'] ?? 'UNKNOWN');

// Normalize Cashfree status
$payment_confirmed = ($verified_status === 'PAID');

// ─── Step 4: Update your database ─────────────────────────────────────────────
// Example using PDO — replace with your actual DB logic
/*
$pdo = new PDO('mysql:host=localhost;dbname=rotary_db;charset=utf8mb4', 'user', 'pass');

if ($payment_confirmed) {
    // Activate subscription / mark order as paid
    $stmt = $pdo->prepare("
        UPDATE subscriptions
        SET status = 'ACTIVE', payment_status = 'SUCCESS', cashfree_order_id = :order_id, activated_at = NOW()
        WHERE cashfree_order_id = :order_id
    ");
    $stmt->execute([':order_id' => $order_id]);
} else {
    // Mark as failed
    $stmt = $pdo->prepare("
        UPDATE subscriptions
        SET payment_status = :status
        WHERE cashfree_order_id = :order_id
    ");
    $stmt->execute([':status' => $verified_status, ':order_id' => $order_id]);
}
*/

// ─── Step 5: Show result to user ──────────────────────────────────────────────
if ($payment_confirmed) {
    show_result('success', 'Payment successful! Your subscription is now active.', $order_id);
} else {
    show_result('failed', 'Payment was not successful (status: ' . htmlspecialchars($verified_status) . '). Please try again.', $order_id);
}

// ─── Helper: Render result page ───────────────────────────────────────────────
function show_result(string $type, string $message, string $order_id = ''): void {
    $icons   = ['success' => '&#10003;', 'failed' => '&#10007;', 'error' => '&#9888;'];
    $titles  = ['success' => 'Payment Successful', 'failed' => 'Payment Failed', 'error' => 'Error'];
    $classes = ['success' => 'color:#16a34a', 'failed' => 'color:#dc2626', 'error' => 'color:#d97706'];
    $icon    = $icons[$type]   ?? '&#9432;';
    $title   = $titles[$type]  ?? 'Result';
    $style   = $classes[$type] ?? '';
    ?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title) ?> — Rotary Matchmaker</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 16px rgba(0,0,0,.08); padding: 40px 32px; max-width: 440px; width: 100%; text-align: center; }
        .icon { font-size: 56px; margin-bottom: 12px; }
        h1 { font-size: 22px; margin-bottom: 12px; }
        p { color: #64748b; line-height: 1.6; }
        .order { font-family: monospace; font-size: 12px; color: #94a3b8; margin-top: 12px; }
        .btn { display: inline-block; margin-top: 24px; padding: 10px 24px; background: #2563eb; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body>
<div class="card">
    <div class="icon" style="<?= $style ?>"><?= $icon ?></div>
    <h1 style="<?= $style ?>"><?= htmlspecialchars($title) ?></h1>
    <p><?= $message ?></p>
    <?php if ($order_id): ?>
        <p class="order">Order ID: <?= htmlspecialchars($order_id) ?></p>
    <?php endif; ?>
    <a href="/dashboard" class="btn">Go to Dashboard</a>
</div>
</body>
</html>
    <?php
}
