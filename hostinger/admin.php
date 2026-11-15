<?php
// Club admin: see orders, mark them paid (which places their lines on the online cards),
// print the cards for the Big Draw, and download everything as a spreadsheet.
declare(strict_types=1);
require __DIR__ . '/lib.php';

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => ($_SERVER['HTTPS'] ?? 'off') !== 'off']);
session_start();
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$config = cfg();
$draw = draw();
$perCard = (int) ($draw['linesPerCard'] ?? 20);

if (($config['admin_password'] ?? '') === '' || str_contains($config['admin_password'], 'CHANGE')) {
    exit('Set admin_password in config.php before using this page.');
}

// ---------- log in / out ----------
if (isset($_POST['password'])) {
    if (hash_equals($config['admin_password'], (string) $_POST['password'])) {
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        header('Location: admin.php');
        exit;
    }
    sleep(1);
    $loginError = 'That password isn’t right.';
}
if (isset($_POST['logout'])) {
    session_destroy();
    header('Location: admin.php');
    exit;
}
if (empty($_SESSION['admin'])) {
    page('Club admin', '<form method="post" class="login"><h1>Club admin</h1>'
        . (isset($loginError) ? '<p class="err">' . h($loginError) . '</p>' : '')
        . '<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>'
        . '<button type="submit">Log in</button></form>');
    exit;
}

// ---------- mark paid / unpaid ----------
if (isset($_POST['ref'], $_POST['status'])) {
    if (!hash_equals($_SESSION['csrf'] ?? '', (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Your session expired. Go back and try again.');
    }
    update_orders(function (array &$rows) use ($perCard) {
        // Lines go on the cards in the order payments are recorded. An order that fits on one
        // card is kept together; bigger orders run across cards.
        $next = 0;
        foreach ($rows as $r) {
            if ($r['slot_start'] !== '') {
                $next = max($next, (int) $r['slot_start'] + (int) $r['lines']);
            }
        }
        foreach ($rows as &$r) {
            if ($r['ref'] !== $_POST['ref']) {
                continue;
            }
            if ($_POST['status'] === 'paid' && $r['status'] !== 'paid') {
                $lines = (int) $r['lines'];
                $used = $next % $perCard;
                if ($used !== 0 && $lines > $perCard - $used) {
                    $next += $perCard - $used;
                }
                $r['status'] = 'paid';
                $r['paid_at'] = date('c');
                $r['slot_start'] = (string) $next;
            } elseif ($_POST['status'] === 'unpaid') {
                $r['status'] = 'unpaid';
                $r['paid_at'] = '';
                $r['slot_start'] = '';
            }
        }
    });
    header('Location: admin.php#' . rawurlencode((string) $_POST['ref']));
    exit;
}

$orders = all_orders();

// ---------- spreadsheet download ----------
if (($_GET['download'] ?? '') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="draw-orders-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // so Excel reads the euro sign and fadas correctly
    fputcsv($out, ['Order', 'Created', 'Status', 'Name', 'Phone', 'Email', 'Seller', 'Bundle', 'Lines', 'Amount (€)', 'Paid at', 'Online cards'], ',', '"', '');
    // Stop spreadsheet apps treating a typed value such as "=SUM(...)" as a formula.
    $safe = fn ($v) => preg_match('/^[=+\-@\t\r]/', (string) $v) ? "'" . $v : $v;
    foreach ($orders as $o) {
        fputcsv($out, array_map($safe, [
            $o['ref'], $o['created'], $o['status'], $o['name'], $o['phone'], $o['email'], $o['seller'], $o['bundle'],
            $o['lines'], number_format((int) $o['amount'] / 100, 2, '.', ''), $o['paid_at'],
            $o['slot_start'] === '' ? '' : describe_slots((int) $o['slot_start'], (int) $o['lines'], $perCard),
        ]), ',', '"', '');
    }
    exit;
}

// ---------- printable cards ----------
if (($_GET['view'] ?? '') === 'cards') {
    $cards = [];
    foreach ($orders as $o) {
        if ($o['slot_start'] === '') {
            continue;
        }
        for ($i = 0; $i < (int) $o['lines']; $i++) {
            $slot = (int) $o['slot_start'] + $i;
            $cards[intdiv($slot, $perCard)][$slot % $perCard] = $o;
        }
    }
    ksort($cards);
    $total = array_sum(array_map('count', $cards));
    $html = '<div class="bar"><a href="admin.php">← Orders</a><strong>' . $total . ' paid online line' . ($total === 1 ? '' : 's') . ' on ' . count($cards) . ' card' . (count($cards) === 1 ? '' : 's') . '</strong>'
        . '<button type="button" onclick="window.print()">Print cards</button></div>';
    if (!$cards) {
        $html .= '<p class="empty">No paid online lines yet. Mark orders as paid and they appear here.</p>';
    }
    foreach ($cards as $index => $lines) {
        $rowsHtml = '';
        for ($i = 0; $i < $perCard; $i++) {
            $o = $lines[$i] ?? null;
            $rowsHtml .= '<tr><td>' . ($i + 1) . '</td><td>'
                . ($o ? '<strong>' . h($o['name']) . '</strong><small>' . h($o['phone']) . ' · ' . h($o['email']) . ' · ' . h($o['ref']) . '</small>' : '')
                . '</td><td>' . ($o ? h($o['seller'] ?: 'Online') : '') . '</td></tr>';
        }
        $html .= '<section class="card"><header><img src="img/crest-96.png" alt="" width="48" height="48"><div><strong>' . h($draw['clubName']) . '</strong><span>'
            . h($draw['drawName']) . ' 2026</span></div><b>Online card ' . ($index + 1) . '</b></header>'
            . '<table><thead><tr><th>#</th><th>Name &amp; contact details</th><th>Seller</th></tr></thead><tbody>' . $rowsHtml . '</tbody></table>'
            . '<footer>Big Draw in ' . h($draw['drawLocation']) . ', ' . h(draw_when()) . ' · Entered online</footer></section>';
    }
    page('Online cards', $html);
    exit;
}

// ---------- orders list ----------
$paid = array_filter($orders, fn ($o) => $o['status'] === 'paid');
$sum = fn ($list, $key) => array_sum(array_map(fn ($o) => (int) $o[$key], $list));
$unpaid = array_filter($orders, fn ($o) => $o['status'] !== 'paid');
$csrf = h($_SESSION['csrf']);
$rows = '';
foreach (array_reverse($orders) as $o) {
    $isPaid = $o['status'] === 'paid';
    $where = $isPaid && $o['slot_start'] !== '' ? describe_slots((int) $o['slot_start'], (int) $o['lines'], $perCard) : '';
    $rows .= '<tr id="' . h($o['ref']) . '" class="' . ($isPaid ? 'is-paid' : '') . '">'
        . '<td><strong>' . h($o['ref']) . '</strong><small>' . h(date('j M, H:i', strtotime($o['created']))) . '</small></td>'
        . '<td><strong>' . h($o['name']) . '</strong><small><a href="tel:' . h(preg_replace('/[^0-9+]/', '', $o['phone'])) . '">' . h($o['phone']) . '</a> · <a href="mailto:' . h($o['email']) . '">' . h($o['email']) . '</a></small></td>'
        . '<td>' . h($o['seller'] ?: '–') . '</td>'
        . '<td>' . h($o['lines']) . '<small>' . h($o['bundle']) . '</small></td>'
        . '<td><strong>' . euro((int) $o['amount']) . '</strong></td>'
        . '<td><form method="post"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="ref" value="' . h($o['ref']) . '">'
        . ($isPaid
            ? '<span class="pill paid">Paid</span><small>' . h($where) . '</small><button name="status" value="unpaid" class="link" onclick="return confirm(\'Mark ' . h($o['ref']) . ' as not paid? Its lines come off the online cards.\')">Undo</button>'
            : '<button name="status" value="paid" class="pay">Mark paid</button>')
        . '</form></td></tr>';
}
page('Orders', '<div class="bar"><strong>' . h($draw['drawName']) . '</strong><a href="?view=cards">Print online cards</a><a href="?download=csv">Download spreadsheet</a>'
    . '<form method="post" class="out"><button name="logout" value="1" class="link">Log out</button></form></div>'
    . '<div class="stats"><div><b>' . count($orders) . '</b><span>orders</span></div><div><b>' . euro($sum($paid, 'amount')) . '</b><span>paid · ' . $sum($paid, 'lines') . ' lines</span></div>'
    . '<div><b>' . euro($sum($unpaid, 'amount')) . '</b><span>awaiting payment · ' . count($unpaid) . ' orders</span></div></div>'
    . ($orders ? '<div class="wrap"><table class="list"><thead><tr><th>Order</th><th>Buyer</th><th>Seller</th><th>Lines</th><th>Amount</th><th>Payment</th></tr></thead><tbody>' . $rows . '</tbody></table></div>'
        : '<p class="empty">No orders yet.</p>'));

function page(string $title, string $body): void
{
    echo '<!doctype html><html lang="en-IE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>' . h($title) . ' · Draw admin</title><style>
  body { margin: 0; font: 15px/1.45 system-ui, sans-serif; color: #102018; background: #e9efeb; }
  a { color: #0d6b36; }
  .bar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: .6rem 1.4rem; align-items: center; padding: .9rem 1.2rem; background: #0d6b36; color: #fff; }
  .bar a, .bar .link { color: #fff; font-weight: 600; }
  .bar button:not(.link) { padding: .45rem 1rem; border: 0; border-radius: 999px; font: inherit; font-weight: 700; color: #fff; background: #c4141f; cursor: pointer; }
  .out { margin-left: auto; }
  button.link { padding: 0; border: 0; background: none; font: inherit; text-decoration: underline; cursor: pointer; color: inherit; }
  .stats { display: flex; flex-wrap: wrap; gap: 1rem; padding: 1.2rem; }
  .stats div { flex: 1 1 180px; padding: 1rem 1.2rem; border-radius: 12px; background: #fff; }
  .stats b { display: block; font-size: 1.6rem; }
  .stats span { color: #4a5c52; }
  .wrap { overflow-x: auto; padding: 0 1.2rem 2rem; }
  table.list { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
  .list th { text-align: left; padding: .6rem .8rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: #4a5c52; background: #f4f7f5; }
  .list td { padding: .7rem .8rem; border-top: 1px solid #dfe7e2; vertical-align: top; }
  .list small { display: block; color: #4a5c52; }
  .list tr.is-paid { background: #f2fbf5; }
  .pay { padding: .45rem .9rem; border: 0; border-radius: 999px; font: inherit; font-weight: 700; color: #fff; background: #0d6b36; cursor: pointer; }
  .pill { display: inline-block; padding: .15rem .6rem; border-radius: 999px; font-size: .8rem; font-weight: 700; }
  .pill.paid { color: #fff; background: #1fa95a; }
  .empty { padding: 3rem 1.2rem; text-align: center; color: #4a5c52; }
  .login { max-width: 340px; margin: 12vh auto; display: grid; gap: .6rem; padding: 1.6rem; border-radius: 16px; background: #fff; }
  .login input { padding: .7rem; font: inherit; border: 1px solid #b9c8bf; border-radius: 10px; }
  .login button { padding: .7rem; border: 0; border-radius: 999px; font: inherit; font-weight: 700; color: #fff; background: #0d6b36; cursor: pointer; }
  .err { color: #a3121b; font-weight: 600; }
  .card { max-width: 760px; margin: 1.5rem auto; padding: 1.5rem; background: #fff; border-top: 10px solid #0d6b36; }
  .card header { display: flex; gap: .8rem; align-items: center; margin-bottom: 1rem; }
  .card header div { flex: 1; display: grid; }
  .card header span { color: #4a5c52; }
  .card header b { padding: .4rem .8rem; border-radius: 6px; background: #c4141f; color: #fff; white-space: nowrap; }
  .card table { width: 100%; border-collapse: collapse; }
  .card th { text-align: left; padding: .4rem; background: #0d6b36; color: #fff; font-size: .8rem; text-transform: uppercase; }
  .card td { height: 2.3rem; padding: .25rem .4rem; border-bottom: 1px solid #b9c8bf; }
  .card td:first-child { width: 2rem; font-weight: 700; color: #0d6b36; }
  .card td:last-child { width: 9rem; }
  .card small { display: block; color: #4a5c52; font-size: .8rem; }
  .card footer { margin-top: .8rem; font-size: .8rem; color: #4a5c52; }
  @media print { body { background: #fff; } .bar { display: none; } .card { margin: 0; max-width: none; break-after: page; } @page { size: A4; margin: 12mm; } }
</style></head><body>' . $body . '</body></html>';
}
