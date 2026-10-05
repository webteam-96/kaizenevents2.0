<?php
/**
 * Payment Gateway Proxy - response.php
 *
 * Cashfree redirects here after payment completion.
 * We update the transaction in the database, then redirect
 * back to the client's return_url with the result.
 *
 * Cashfree GET params include: order_id, and various payment status fields.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// ─── Extract order_id ─────────────────────────────────────────────────────────
// order_id is passed via the returnUrl we gave Cashfree in pay.php
$order_id = sanitize_string($_GET['order_id'] ?? $_POST['order_id'] ?? '');

if (!$order_id) {
    error_log('[PaymentGateway] response.php called without order_id');
    http_response_code(400);
    die('Invalid response. Missing order ID.');
}

// ─── Look up transaction ──────────────────────────────────────────────────────
$pdo         = get_pdo();
$transaction = get_transaction($pdo, $order_id);

if (!$transaction) {
    error_log("[PaymentGateway] response.php: no transaction found for order_id=$order_id");
    http_response_code(404);
    die('Transaction not found.');
}

$project_key = $transaction['project_key'];

if (!isset($REGISTERED_PROJECTS[$project_key])) {
    error_log("[PaymentGateway] response.php: unknown project_key=$project_key for order_id=$order_id");
    http_response_code(500);
    die('Configuration error. Please contact support.');
}

$project = $REGISTERED_PROJECTS[$project_key];

// ─── Determine Payment Status ─────────────────────────────────────────────────
// Cashfree sends the payment result in GET params.
// The primary status field is "order_status" or we fall back to inspecting available fields.
$cf_params = $_GET + $_POST;
unset($cf_params['order_id']); // already extracted

// Cashfree SDK v3 redirect typically includes these:
// order_id, order_token, transaction_status, transaction_msg, transaction_id
$cf_order_status = strtoupper(sanitize_string(
    $cf_params['order_status']        ??
    $cf_params['transaction_status']  ??
    $cf_params['payment_status']      ??
    'UNKNOWN'
));

// Normalize to standard statuses
$status_map = [
    'PAID'      => 'SUCCESS',
    'SUCCESS'   => 'SUCCESS',
    'FAILED'    => 'FAILED',
    'FAILURE'   => 'FAILED',
    'CANCELLED' => 'CANCELLED',
    'CANCEL'    => 'CANCELLED',
    'PENDING'   => 'PENDING',
    'USER_DROPPED' => 'CANCELLED',
];
$payment_status = $status_map[$cf_order_status] ?? 'UNKNOWN';

// ─── Update Database ──────────────────────────────────────────────────────────
update_transaction($pdo, $order_id, $payment_status, $cf_params);

// ─── Generate Response Signature ─────────────────────────────────────────────
$response_sig = generate_response_signature($order_id, $payment_status, $project['secret']);

// ─── Build Redirect URL ───────────────────────────────────────────────────────
$return_url = $transaction['return_url'];

$separator  = (strpos($return_url, '?') === false) ? '?' : '&';
$return_url .= $separator . http_build_query([
    'order_id'  => $order_id,
    'status'    => $payment_status,
    'signature' => $response_sig,
]);

// ─── Redirect to Client ───────────────────────────────────────────────────────
header('Location: ' . $return_url, true, 302);
exit;
