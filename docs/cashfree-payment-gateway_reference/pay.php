<?php
/**
 * Payment Gateway Proxy - pay.php
 *
 * MAIN entry point. Validates the incoming request, logs a PENDING transaction,
 * then renders the Cashfree JS SDK checkout page.
 *
 * Accepts: GET or POST
 * Required params: session_id, order_id, project_key, return_url, signature
 * Optional params: amount, currency, customer_name, customer_email, customer_phone
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// ─── Collect & Sanitize Input ─────────────────────────────────────────────────
$input = array_merge($_GET, $_POST); // POST overrides GET

$session_id     = sanitize_string($input['session_id']     ?? '');
$order_id       = sanitize_string($input['order_id']       ?? '');
$project_key    = sanitize_string($input['project_key']    ?? '');
$return_url     = trim($input['return_url']                ?? '');  // validated separately
$signature      = sanitize_string($input['signature']      ?? '');
$amount         = sanitize_string($input['amount']         ?? '');
$currency       = sanitize_string($input['currency']       ?? 'INR');
$customer_name  = sanitize_string($input['customer_name']  ?? '');
$customer_email = sanitize_string($input['customer_email'] ?? '');
$customer_phone = sanitize_string($input['customer_phone'] ?? '');

// ─── Validation Helper ────────────────────────────────────────────────────────
$error = null;

// 1. Required parameters
if (!$session_id || !$order_id || !$project_key || !$return_url || !$signature) {
    $error = 'Missing required parameters. Please return to the application and try again.';
}

// 2. Project key exists
if (!$error && !isset($REGISTERED_PROJECTS[$project_key])) {
    error_log("[PaymentGateway] Unknown project_key: $project_key");
    $error = 'Invalid project configuration. Please contact support.';
}

if (!$error) {
    $project = $REGISTERED_PROJECTS[$project_key];

    // 3. Signature verification
    if (!verify_request_signature(
        ['order_id' => $order_id, 'session_id' => $session_id, 'amount' => $amount, 'return_url' => $return_url],
        $project['secret'],
        $signature
    )) {
        error_log("[PaymentGateway] Invalid signature for order_id=$order_id project=$project_key");
        $error = 'Request signature is invalid. Please return to the application and try again.';
    }

    // 4. return_url domain whitelist
    if (!$error && !validate_return_url($return_url, $project['allowed_domains'])) {
        error_log("[PaymentGateway] Unauthorized return_url=$return_url for project=$project_key");
        $error = 'Unauthorized return URL. Please contact support.';
    }
}

// ─── Error Page ───────────────────────────────────────────────────────────────
if ($error) {
    http_response_code(400);
    ?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Error</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="container">
    <div class="card error-card">
        <div class="status-icon error-icon">&#10007;</div>
        <h1>Payment Error</h1>
        <p class="error-message"><?= htmlspecialchars($error) ?></p>
        <?php if ($return_url && filter_var($return_url, FILTER_VALIDATE_URL)): ?>
            <a href="<?= htmlspecialchars($return_url) ?>" class="btn btn-secondary">Return to Application</a>
        <?php endif; ?>
    </div>
</div>
</body>
</html>
    <?php
    exit;
}

// ─── Log Transaction ──────────────────────────────────────────────────────────
$pdo = get_pdo();
log_transaction($pdo, [
    'project_key'        => $project_key,
    'order_id'           => $order_id,
    'payment_session_id' => $session_id,
    'amount'             => $amount ?: null,
    'currency'           => $currency ?: 'INR',
    'customer_name'      => $customer_name,
    'customer_email'     => $customer_email,
    'customer_phone'     => $customer_phone,
    'return_url'         => $return_url,
]);

// ─── Cashfree SDK Configuration ───────────────────────────────────────────────
$cashfree_mode = (CASHFREE_ENV === 'production') ? 'production' : 'sandbox';
$response_url  = GATEWAY_BASE_URL . '/response.php?order_id=' . urlencode($order_id);

// Cancel URL: redirect back to client with CANCELLED status
$cancel_sig = generate_response_signature($order_id, 'CANCELLED', $project['secret']);
$cancel_url = $return_url
    . (strpos($return_url, '?') === false ? '?' : '&')
    . http_build_query(['order_id' => $order_id, 'status' => 'CANCELLED', 'signature' => $cancel_sig]);

// Display values (safe for HTML)
$display_project = htmlspecialchars($project['name']);
$display_order   = htmlspecialchars($order_id);
$display_amount  = $amount ? '₹' . number_format((float)$amount, 2) : null;
$display_name    = $customer_name;
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secure Payment – <?= $display_project ?></title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="container">
    <div class="card payment-card">
        <div class="payment-header">
            <div class="lock-icon">&#128274;</div>
            <h1>Secure Payment</h1>
            <p class="project-name"><?= $display_project ?></p>
        </div>

        <div class="payment-details">
            <div class="detail-row">
                <span class="detail-label">Order ID</span>
                <span class="detail-value"><?= $display_order ?></span>
            </div>
            <?php if ($display_amount): ?>
            <div class="detail-row">
                <span class="detail-label">Amount</span>
                <span class="detail-value amount"><?= $display_amount ?></span>
            </div>
            <?php endif; ?>
            <?php if ($display_name): ?>
            <div class="detail-row">
                <span class="detail-label">Customer</span>
                <span class="detail-value"><?= $display_name ?></span>
            </div>
            <?php endif; ?>
        </div>

        <div id="loading-section">
            <div class="spinner"></div>
            <p class="loading-text">Loading secure payment...</p>
        </div>

        <div id="pay-button-section" style="display:none;">
            <div id="cashfree-payment-element"></div>
        </div>

        <div id="error-section" class="error-section" style="display:none;">
            <p class="error-message">Failed to load payment gateway. Please go back and try again.</p>
        </div>

        <div class="cancel-section">
            <a href="<?= htmlspecialchars($cancel_url) ?>" class="btn btn-cancel"
               onclick="return confirm('Are you sure you want to cancel this payment?')">
                Cancel Payment
            </a>
        </div>
    </div>
</div>

<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
<script>
(function () {
    const cashfree = Cashfree({ mode: "<?= $cashfree_mode ?>" });

    const checkoutOptions = {
        paymentSessionId: "<?= htmlspecialchars($session_id, ENT_QUOTES) ?>",
        redirectTarget:   "_self",
        returnUrl:        "<?= htmlspecialchars($response_url, ENT_QUOTES) ?>",
    };

    document.getElementById('loading-section').style.display = 'none';
    document.getElementById('pay-button-section').style.display = 'block';

    cashfree.checkout(checkoutOptions).then(function (result) {
        if (result.error) {
            document.getElementById('pay-button-section').style.display = 'none';
            document.getElementById('error-section').style.display = 'block';
            console.error('Cashfree checkout error:', result.error);
        }
        if (result.redirect) {
            // Redirect is happening — nothing to do
        }
    }).catch(function (err) {
        document.getElementById('loading-section').style.display = 'none';
        document.getElementById('error-section').style.display = 'block';
        console.error('Cashfree SDK error:', err);
    });
})();
</script>
</body>
</html>
