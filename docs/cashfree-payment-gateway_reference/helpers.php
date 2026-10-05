<?php
/**
 * Payment Gateway Proxy - Shared Helper Functions
 */

/**
 * Generate HMAC-SHA256 signature.
 *
 * @param string $data_string  The raw string to sign
 * @param string $secret       The project secret key
 * @return string              Hex-encoded HMAC
 */
function generate_signature(string $data_string, string $secret): string {
    return hash_hmac('sha256', $data_string, $secret);
}

/**
 * Verify signature from a client request.
 * Signature formula (client → gateway):
 *   hash_hmac('sha256', order_id . session_id . amount . return_url, project_secret)
 *
 * @param array  $params             Associative array with order_id, session_id, amount, return_url
 * @param string $secret             Project secret
 * @param string $received_signature Signature sent by the client
 * @return bool
 */
function verify_request_signature(array $params, string $secret, string $received_signature): bool {
    $data_string = $params['order_id'] . $params['session_id'] . ($params['amount'] ?? '') . $params['return_url'];
    $expected    = generate_signature($data_string, $secret);
    return hash_equals($expected, $received_signature);
}

/**
 * Generate the response signature sent back to the client.
 * Formula (gateway → client):
 *   hash_hmac('sha256', order_id . payment_status, project_secret)
 *
 * @param string $order_id
 * @param string $payment_status
 * @param string $secret
 * @return string
 */
function generate_response_signature(string $order_id, string $payment_status, string $secret): string {
    return generate_signature($order_id . $payment_status, $secret);
}

/**
 * Validate that a return_url's domain is in the project's allowed_domains list.
 *
 * @param string $return_url
 * @param array  $allowed_domains
 * @return bool
 */
function validate_return_url(string $return_url, array $allowed_domains): bool {
    $parsed = parse_url($return_url);
    if (!$parsed || empty($parsed['host'])) {
        return false;
    }
    $host = strtolower($parsed['host']);
    foreach ($allowed_domains as $domain) {
        if ($host === strtolower($domain)) {
            return true;
        }
    }
    return false;
}

/**
 * Insert a new PENDING transaction into the database.
 *
 * @param PDO   $pdo
 * @param array $data  Keys: project_key, order_id, payment_session_id, amount, currency,
 *                           customer_name, customer_email, customer_phone, return_url
 * @return bool
 */
function log_transaction(PDO $pdo, array $data): bool {
    $sql = "
        INSERT INTO pg_transactions
            (project_key, order_id, payment_session_id, amount, currency,
             customer_name, customer_email, customer_phone, payment_status, return_url)
        VALUES
            (:project_key, :order_id, :payment_session_id, :amount, :currency,
             :customer_name, :customer_email, :customer_phone, 'PENDING', :return_url)
        ON DUPLICATE KEY UPDATE
            payment_session_id = VALUES(payment_session_id),
            updated_at         = CURRENT_TIMESTAMP
    ";
    $stmt = $pdo->prepare($sql);
    return $stmt->execute([
        ':project_key'        => $data['project_key'],
        ':order_id'           => $data['order_id'],
        ':payment_session_id' => $data['payment_session_id'],
        ':amount'             => $data['amount'] ?? null,
        ':currency'           => $data['currency'] ?? 'INR',
        ':customer_name'      => $data['customer_name'] ?? null,
        ':customer_email'     => $data['customer_email'] ?? null,
        ':customer_phone'     => $data['customer_phone'] ?? null,
        ':return_url'         => $data['return_url'],
    ]);
}

/**
 * Update transaction status after Cashfree responds.
 *
 * @param PDO    $pdo
 * @param string $order_id
 * @param string $status         e.g. 'SUCCESS', 'FAILED', 'CANCELLED'
 * @param mixed  $response_data  Full response data (will be JSON-encoded)
 * @return bool
 */
function update_transaction(PDO $pdo, string $order_id, string $status, $response_data): bool {
    $sql  = "UPDATE pg_transactions
             SET payment_status = :status, cashfree_response = :response
             WHERE order_id = :order_id";
    $stmt = $pdo->prepare($sql);
    return $stmt->execute([
        ':status'   => $status,
        ':response' => is_string($response_data) ? $response_data : json_encode($response_data),
        ':order_id' => $order_id,
    ]);
}

/**
 * Fetch a transaction by order_id.
 *
 * @param PDO    $pdo
 * @param string $order_id
 * @return array|null
 */
function get_transaction(PDO $pdo, string $order_id): ?array {
    $stmt = $pdo->prepare("SELECT * FROM pg_transactions WHERE order_id = :order_id LIMIT 1");
    $stmt->execute([':order_id' => $order_id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Send a JSON response and exit.
 *
 * @param array $data
 * @param int   $status_code  HTTP status code
 */
function json_response(array $data, int $status_code = 200): void {
    http_response_code($status_code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Sanitize a plain string input (trim + strip tags).
 *
 * @param string|null $value
 * @return string
 */
function sanitize_string(?string $value): string {
    return htmlspecialchars(strip_tags(trim((string)$value)), ENT_QUOTES, 'UTF-8');
}
