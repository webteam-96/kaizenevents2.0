<?php
/**
 * EXAMPLE: Client Redirect to Payment Gateway
 * ---------------------------------------------------
 * Place this logic on: rotarymatchmaker.com
 *
 * This example shows how to:
 *   1. Create a Cashfree order via the Cashfree API (server-side)
 *   2. Generate the request signature
 *   3. Redirect the user to the payment gateway
 *
 * Prerequisites:
 *   - You have a Cashfree account with App ID and Secret Key
 *   - Your project is registered in the gateway's config.php
 */

// ─── Your project's credentials ───────────────────────────────────────────────
// These must match what's set in the gateway's config.php
define('GATEWAY_PROJECT_KEY', 'rotary_matchmaker');
define('GATEWAY_PROJECT_SECRET', 'rm_secret_key_REPLACE_WITH_STRONG_SECRET');

// Cashfree API credentials (your OWN app credentials from Cashfree dashboard)
define('CF_APP_ID',     'your_cashfree_app_id');
define('CF_SECRET_KEY', 'your_cashfree_secret_key');
define('CF_ENV',        'sandbox'); // 'sandbox' or 'production'

// Gateway URL
define('GATEWAY_PAY_URL', 'https://www.kaizeninfotech.com/cashfree-payment-gateway/pay.php');

// ─── Step 1: Collect order details ────────────────────────────────────────────
// In a real app these come from your database / session / POST data
$order_details = [
    'order_id'       => 'RM_' . strtoupper(bin2hex(random_bytes(8))), // your unique order ID
    'amount'         => '999.00',
    'currency'       => 'INR',
    'customer_id'    => 'cust_' . '12345',          // your internal customer ID
    'customer_name'  => 'Rahul Sharma',
    'customer_email' => 'rahul@example.com',
    'customer_phone' => '9876543210',
    'return_url'     => 'https://rotarymatchmaker.com/payment-complete', // your completion page
];

// ─── Step 2: Create Cashfree Order via API ────────────────────────────────────
// This creates the order on Cashfree's servers and returns a payment_session_id
$cf_api_url = (CF_ENV === 'production')
    ? 'https://api.cashfree.com/pg/orders'
    : 'https://sandbox.cashfree.com/pg/orders';

$cf_order_payload = json_encode([
    'order_id'     => $order_details['order_id'],
    'order_amount' => $order_details['amount'],
    'order_currency' => $order_details['currency'],
    'customer_details' => [
        'customer_id'    => $order_details['customer_id'],
        'customer_name'  => $order_details['customer_name'],
        'customer_email' => $order_details['customer_email'],
        'customer_phone' => $order_details['customer_phone'],
    ],
    'order_meta' => [
        // Cashfree will POST webhook to this URL directly
        'notify_url' => 'https://rotarymatchmaker.com/api/cashfree-webhook',
    ],
]);

$ch = curl_init($cf_api_url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $cf_order_payload,
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
    // Handle API error — show user a friendly message
    error_log("Cashfree order creation failed: HTTP $http_code | $curl_error | $cf_response_raw");
    die('Unable to initiate payment. Please try again.');
}

$cf_order = json_decode($cf_response_raw, true);

if (empty($cf_order['payment_session_id'])) {
    error_log("Cashfree order missing payment_session_id: " . $cf_response_raw);
    die('Unable to initiate payment. Please try again.');
}

$payment_session_id = $cf_order['payment_session_id'];
$order_id           = $cf_order['order_id'];  // Use the confirmed order_id from Cashfree

// Save order_id + payment_session_id in YOUR database here, linked to the user/subscription

// ─── Step 3: Generate signature ───────────────────────────────────────────────
// Formula: hash_hmac('sha256', order_id . session_id . amount . return_url, project_secret)
$sig_data  = $order_id . $payment_session_id . $order_details['amount'] . $order_details['return_url'];
$signature = hash_hmac('sha256', $sig_data, GATEWAY_PROJECT_SECRET);

// ─── Step 4: Build redirect URL & redirect user ───────────────────────────────
$params = http_build_query([
    'session_id'     => $payment_session_id,
    'order_id'       => $order_id,
    'project_key'    => GATEWAY_PROJECT_KEY,
    'return_url'     => $order_details['return_url'],
    'amount'         => $order_details['amount'],
    'currency'       => $order_details['currency'],
    'customer_name'  => $order_details['customer_name'],
    'customer_email' => $order_details['customer_email'],
    'customer_phone' => $order_details['customer_phone'],
    'signature'      => $signature,
]);

$redirect_url = GATEWAY_PAY_URL . '?' . $params;

// Redirect the user to the gateway payment page
header('Location: ' . $redirect_url, true, 302);
exit;
