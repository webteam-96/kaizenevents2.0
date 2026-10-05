<?php
/**
 * Payment Gateway Proxy - dashboard.php
 * Password-protected admin dashboard to view all transactions.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

session_start();

// ─── Authentication ───────────────────────────────────────────────────────────
$auth_error = '';

if (isset($_POST['logout'])) {
    session_destroy();
    header('Location: dashboard.php');
    exit;
}

if (!isset($_SESSION['pg_admin_auth'])) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
        if (hash_equals(DASHBOARD_PASSWORD, $_POST['password'])) {
            $_SESSION['pg_admin_auth'] = true;
            header('Location: dashboard.php');
            exit;
        } else {
            $auth_error = 'Incorrect password.';
        }
    }
    // Show login form
    ?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gateway Dashboard – Login</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="container">
    <div class="card login-card">
        <h1>&#128274; Dashboard Login</h1>
        <?php if ($auth_error): ?>
            <p class="error-message"><?= htmlspecialchars($auth_error) ?></p>
        <?php endif; ?>
        <form method="POST" action="dashboard.php">
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" class="form-control"
                       placeholder="Enter dashboard password" autofocus required>
            </div>
            <button type="submit" class="btn btn-primary">Login</button>
        </form>
    </div>
</div>
</body>
</html>
    <?php
    exit;
}

// ─── Filters ──────────────────────────────────────────────────────────────────
$filter_project = sanitize_string($_GET['project']    ?? '');
$filter_status  = sanitize_string($_GET['status']     ?? '');
$filter_from    = sanitize_string($_GET['date_from']  ?? '');
$filter_to      = sanitize_string($_GET['date_to']    ?? '');
$export_csv     = isset($_GET['export']) && $_GET['export'] === 'csv';

$pdo = get_pdo();

// ─── Build Query ──────────────────────────────────────────────────────────────
$where  = [];
$params = [];

if ($filter_project) {
    $where[]               = 'project_key = :project_key';
    $params[':project_key'] = $filter_project;
}
if ($filter_status) {
    $where[]              = 'payment_status = :payment_status';
    $params[':payment_status'] = $filter_status;
}
if ($filter_from) {
    $where[]           = 'DATE(created_at) >= :date_from';
    $params[':date_from'] = $filter_from;
}
if ($filter_to) {
    $where[]         = 'DATE(created_at) <= :date_to';
    $params[':date_to'] = $filter_to;
}

$where_sql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

// ─── CSV Export ───────────────────────────────────────────────────────────────
if ($export_csv) {
    $stmt = $pdo->prepare("SELECT * FROM pg_transactions $where_sql ORDER BY created_at DESC");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="transactions_' . date('Y-m-d') . '.csv"');

    $out = fopen('php://output', 'w');
    fputcsv($out, ['ID', 'Project', 'Order ID', 'Amount', 'Currency', 'Customer Name',
                   'Customer Email', 'Customer Phone', 'Status', 'Created At', 'Updated At']);
    foreach ($rows as $row) {
        fputcsv($out, [
            $row['id'], $row['project_key'], $row['order_id'],
            $row['amount'], $row['currency'], $row['customer_name'],
            $row['customer_email'], $row['customer_phone'],
            $row['payment_status'], $row['created_at'], $row['updated_at'],
        ]);
    }
    fclose($out);
    exit;
}

// ─── Fetch Transactions ───────────────────────────────────────────────────────
$stmt = $pdo->prepare("SELECT * FROM pg_transactions $where_sql ORDER BY created_at DESC LIMIT 500");
$stmt->execute($params);
$transactions = $stmt->fetchAll();

// ─── Summary Stats ────────────────────────────────────────────────────────────
$stmt_total   = $pdo->prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(CASE WHEN payment_status='SUCCESS' THEN amount ELSE 0 END),0) AS total_success FROM pg_transactions $where_sql");
$stmt_total->execute($params);
$totals = $stmt_total->fetch();

// Per-project breakdown
$stmt_proj = $pdo->query("
    SELECT project_key,
           COUNT(*) AS total,
           SUM(CASE WHEN payment_status='SUCCESS' THEN 1 ELSE 0 END) AS success_count,
           COALESCE(SUM(CASE WHEN payment_status='SUCCESS' THEN amount ELSE 0 END),0) AS success_amount
    FROM pg_transactions
    GROUP BY project_key
");
$project_stats = $stmt_proj->fetchAll();

// Build current filter query string for links
$filter_qs = http_build_query(array_filter([
    'project'   => $filter_project,
    'status'    => $filter_status,
    'date_from' => $filter_from,
    'date_to'   => $filter_to,
]));

// Distinct project keys for filter dropdown
$all_projects = array_keys($REGISTERED_PROJECTS);
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Gateway Dashboard</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body class="dashboard-body">

<header class="dashboard-header">
    <div class="header-inner">
        <h1>&#128202; Payment Gateway Dashboard</h1>
        <form method="POST" style="display:inline">
            <button type="submit" name="logout" class="btn btn-cancel btn-sm">Logout</button>
        </form>
    </div>
</header>

<main class="dashboard-main">

    <!-- Summary Stats -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value"><?= number_format((int)$totals['cnt']) ?></div>
            <div class="stat-label">Total Transactions</div>
        </div>
        <div class="stat-card stat-success">
            <div class="stat-value">&#8377;<?= number_format((float)$totals['total_success'], 2) ?></div>
            <div class="stat-label">Total Successful Amount</div>
        </div>
        <?php foreach ($project_stats as $ps): ?>
        <div class="stat-card">
            <div class="stat-value"><?= htmlspecialchars($REGISTERED_PROJECTS[$ps['project_key']]['name'] ?? $ps['project_key']) ?></div>
            <div class="stat-label">
                <?= (int)$ps['total'] ?> txns &bull;
                <?= (int)$ps['success_count'] ?> success &bull;
                &#8377;<?= number_format((float)$ps['success_amount'], 2) ?>
            </div>
        </div>
        <?php endforeach; ?>
    </div>

    <!-- Filters -->
    <div class="card filter-card">
        <form method="GET" action="dashboard.php" class="filter-form">
            <div class="form-row">
                <div class="form-group">
                    <label>Project</label>
                    <select name="project" class="form-control">
                        <option value="">All Projects</option>
                        <?php foreach ($all_projects as $pk): ?>
                            <option value="<?= htmlspecialchars($pk) ?>" <?= ($filter_project === $pk) ? 'selected' : '' ?>>
                                <?= htmlspecialchars($REGISTERED_PROJECTS[$pk]['name']) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-control">
                        <option value="">All Statuses</option>
                        <?php foreach (['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED', 'UNKNOWN'] as $s): ?>
                            <option value="<?= $s ?>" <?= ($filter_status === $s) ? 'selected' : '' ?>><?= $s ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label>From Date</label>
                    <input type="date" name="date_from" class="form-control" value="<?= htmlspecialchars($filter_from) ?>">
                </div>
                <div class="form-group">
                    <label>To Date</label>
                    <input type="date" name="date_to" class="form-control" value="<?= htmlspecialchars($filter_to) ?>">
                </div>
                <div class="form-group form-group-actions">
                    <label>&nbsp;</label>
                    <div>
                        <button type="submit" class="btn btn-primary">Filter</button>
                        <a href="dashboard.php" class="btn btn-secondary">Reset</a>
                    </div>
                </div>
            </div>
        </form>
        <div class="export-section">
            <a href="dashboard.php?export=csv&<?= $filter_qs ?>" class="btn btn-secondary">
                &#11015; Export CSV
            </a>
            <span class="record-count"><?= count($transactions) ?> record(s)</span>
        </div>
    </div>

    <!-- Transactions Table -->
    <div class="card table-card">
        <?php if (empty($transactions)): ?>
            <p class="no-data">No transactions found.</p>
        <?php else: ?>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Project</th>
                        <th>Order ID</th>
                        <th>Amount</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Updated</th>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($transactions as $t): ?>
                    <?php
                    $status_class = match($t['payment_status']) {
                        'SUCCESS'   => 'status-success',
                        'FAILED'    => 'status-failed',
                        'CANCELLED' => 'status-cancelled',
                        default     => 'status-pending',
                    };
                    $proj_name = $REGISTERED_PROJECTS[$t['project_key']]['name'] ?? $t['project_key'];
                    ?>
                    <tr>
                        <td><?= (int)$t['id'] ?></td>
                        <td><?= htmlspecialchars($proj_name) ?></td>
                        <td class="order-id"><?= htmlspecialchars($t['order_id']) ?></td>
                        <td>
                            <?php if ($t['amount'] !== null): ?>
                                &#8377;<?= number_format((float)$t['amount'], 2) ?>
                                <small><?= htmlspecialchars($t['currency']) ?></small>
                            <?php else: ?>
                                —
                            <?php endif; ?>
                        </td>
                        <td>
                            <?= htmlspecialchars($t['customer_name'] ?? '—') ?>
                            <?php if ($t['customer_email']): ?>
                                <br><small><?= htmlspecialchars($t['customer_email']) ?></small>
                            <?php endif; ?>
                            <?php if ($t['customer_phone']): ?>
                                <br><small><?= htmlspecialchars($t['customer_phone']) ?></small>
                            <?php endif; ?>
                        </td>
                        <td><span class="status-badge <?= $status_class ?>"><?= htmlspecialchars($t['payment_status']) ?></span></td>
                        <td><?= htmlspecialchars($t['created_at']) ?></td>
                        <td><?= htmlspecialchars($t['updated_at']) ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>

</main>
</body>
</html>
