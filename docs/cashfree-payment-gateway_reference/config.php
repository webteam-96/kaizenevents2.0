<?php
/**
 * Payment Gateway Proxy - Configuration
 * Hosted at: kaizeninfotech.com/cashfree-payment-gateway/
 */

// ─── Database ────────────────────────────────────────────────────────────────
define('DB_HOST', 'localhost');
define('DB_NAME', 'kaizen_payment_gateway');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');
define('DB_CHARSET', 'utf8mb4');

// ─── Cashfree ─────────────────────────────────────────────────────────────────
// "sandbox" or "production"
define('CASHFREE_ENV', 'sandbox');

// ─── Gateway ──────────────────────────────────────────────────────────────────
define('GATEWAY_BASE_URL', 'https://www.kaizeninfotech.com/cashfree-payment-gateway');

// ─── Dashboard ────────────────────────────────────────────────────────────────
define('DASHBOARD_PASSWORD', 'change_this_strong_password');

// ─── Registered Projects ──────────────────────────────────────────────────────
// To add a new project: add a new entry to this array.
// Generate a strong random secret (e.g.: bin2hex(random_bytes(32)))
$REGISTERED_PROJECTS = [
    'rotary_matchmaker' => [
        'secret'          => 'rm_secret_key_REPLACE_WITH_STRONG_SECRET',
        'name'            => 'Rotary Matchmaker',
        'allowed_domains' => ['rotarymatchmaker.com', 'www.rotarymatchmaker.com', 'localhost'],
    ],
    // 'another_project' => [
    //     'secret'          => 'another_secret_key',
    //     'name'            => 'Another Project',
    //     'allowed_domains' => ['anotherproject.com', 'www.anotherproject.com'],
    // ],
];

// ─── PDO Connection ───────────────────────────────────────────────────────────
function get_pdo(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            // Log and show generic error — never expose DB credentials
            error_log('[PaymentGateway] DB connection failed: ' . $e->getMessage());
            http_response_code(500);
            die('Service temporarily unavailable. Please try again later.');
        }
    }
    return $pdo;
}
