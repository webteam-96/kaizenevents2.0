<?php
/**
 * Payment Gateway Proxy - verify.php
 *
 * POST-only JSON API endpoint.
 * Allows client projects to verify payment status stored in the gateway database.
 *
 * Request (POST JSON or form):
 *   project_key  string  required
 *   order_id     string  required
 *   signature    string  required  hash_hmac('sha256', order_id, project_secret)
 *
 * Response (JSON):
 *   success        bool
 *   order_id       string
 *   payment_status string
 *   amount         string|null
 *   currency       string
 *   created_at     string
 *   updated_at     string
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'error' => 'Method not allowed. Use POST.'], 405);
}

// ─── Parse Input ─────────────────────────────────────────────────────────────
// Support both JSON body and form-encoded
$body = file_get_contents('php://input');
$json = json_decode($body, true);

$input       = $json ?: $_POST;
$project_key = sanitize_string($input['project_key'] ?? '');
$order_id    = sanitize_string($input['order_id']    ?? '');
$signature   = sanitize_string($input['signature']   ?? '');

// ─── Validate Inputs ──────────────────────────────────────────────────────────
if (!$project_key || !$order_id || !$signature) {
    json_response(['success' => false, 'error' => 'Missing required parameters: project_key, order_id, signature'], 400);
}

if (!isset($REGISTERED_PROJECTS[$project_key])) {
    json_response(['success' => false, 'error' => 'Unknown project_key'], 401);
}

$project = $REGISTERED_PROJECTS[$project_key];

// Signature for verify endpoint: hash_hmac('sha256', order_id, project_secret)
$expected_sig = generate_signature($order_id, $project['secret']);
if (!hash_equals($expected_sig, $signature)) {
    error_log("[PaymentGateway] verify.php: invalid signature for order_id=$order_id project=$project_key");
    json_response(['success' => false, 'error' => 'Invalid signature'], 401);
}

// ─── Fetch Transaction ────────────────────────────────────────────────────────
$pdo         = get_pdo();
$transaction = get_transaction($pdo, $order_id);

if (!$transaction) {
    json_response(['success' => false, 'error' => 'Transaction not found'], 404);
}

// Ensure the transaction belongs to the requesting project
if ($transaction['project_key'] !== $project_key) {
    json_response(['success' => false, 'error' => 'Access denied'], 403);
}

// ─── Return Result ────────────────────────────────────────────────────────────
json_response([
    'success'        => true,
    'order_id'       => $transaction['order_id'],
    'payment_status' => $transaction['payment_status'],
    'amount'         => $transaction['amount'],
    'currency'       => $transaction['currency'],
    'customer_name'  => $transaction['customer_name'],
    'customer_email' => $transaction['customer_email'],
    'created_at'     => $transaction['created_at'],
    'updated_at'     => $transaction['updated_at'],
]);
