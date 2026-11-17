<?php
// Takes a pay-later order: saves it, emails the club and the buyer, and returns the order reference.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, 'Use the order form on the website.');
}

$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) {
    fail(400, 'We couldn’t read your order. Please try again.');
}
if (!empty($in['website'])) { // honeypot field that people never see
    fail(400, 'We couldn’t place your order. Please try again.');
}

$draw = draw();
if (time() >= strtotime($draw['salesCloseDate'])) {
    fail(410, 'Online entries for this draw have closed.');
}

$bundle = null;
foreach ($draw['bundles'] as $b) {
    if ($b['id'] === ($in['bundleId'] ?? null)) {
        $bundle = $b;
    }
}
$quantity = filter_var($in['quantity'] ?? 1, FILTER_VALIDATE_INT);
if (!$bundle) {
    fail(400, 'Please choose how many lines you want.');
}
if ($quantity === false || $quantity < 1 || $quantity > $draw['maxBundlesPerOrder']) {
    fail(400, 'Please choose a valid number of bundles.');
}
$amount = $bundle['price'] * $quantity;
if (!empty($draw['maxOrderTotal']) && $amount > $draw['maxOrderTotal']) {
    fail(400, 'Online orders are limited to ' . euro($draw['maxOrderTotal']) . '. For more, please contact the club.');
}

$text = fn ($key, $max) => trim(mb_substr(preg_replace('/\s+/u', ' ', (string) ($in[$key] ?? '')), 0, $max));
$name = $text('name', 80);
$phone = $text('phone', 30);
$email = $text('email', 120);
$seller = $text('seller', 80);
if (mb_strlen($name) < 2) {
    fail(400, 'Please enter your full name.');
}
if (!preg_match('/^\+?[0-9 ()\-]{7,}$/', $phone)) {
    fail(400, 'Please enter a valid phone number.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail(400, 'Please enter a valid email address.');
}
if (($in['adult'] ?? false) !== true) {
    fail(400, 'Please confirm you are 18 or over.');
}

// A light limit per visitor, to stop scripted spam.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateFile = data_path('rate.php');
$rh = fopen($rateFile, 'c+');
flock($rh, LOCK_EX);
rewind($rh);
fgets($rh);
$rates = json_decode((string) stream_get_contents($rh), true) ?: [];
$now = time();
foreach ($rates as $k => $times) {
    $rates[$k] = array_values(array_filter($times, fn ($t) => $now - $t < 600));
    if (!$rates[$k]) {
        unset($rates[$k]);
    }
}
$limited = count($rates[$ip] ?? []) >= 10;
if (!$limited) {
    $rates[$ip][] = $now;
}
ftruncate($rh, 0);
rewind($rh);
fwrite($rh, DATA_GUARD . json_encode($rates));
flock($rh, LOCK_UN);
fclose($rh);
if ($limited) {
    fail(429, 'Too many orders from this connection. Please wait a few minutes or contact the club.');
}

$lines = $bundle['lines'] * $quantity;
$order = update_orders(function (array &$rows) use ($name, $phone, $email, $seller, $bundle, $quantity, $lines, $amount) {
    $row = [
        'ref' => sprintf('SM-%04d', count($rows) + 1),
        'created' => date('c'),
        'status' => 'unpaid',
        'name' => $name,
        'phone' => $phone,
        'email' => $email,
        'seller' => $seller,
        'bundle' => $bundle['label'],
        'quantity' => $quantity,
        'lines' => $lines,
        'amount' => $amount,
        'paid_at' => '',
        'slot_start' => '',
        'token' => bin2hex(random_bytes(12)),
        'checkout_id' => '',
        'txn' => '',
    ];
    $rows[] = $row;
    return $row;
});

$config = cfg();
$ref = $order['ref'];
$total = euro($amount);
$linesText = $lines . ' line' . ($lines > 1 ? 's' : '');

$reply = [
    'ref' => $ref,
    'token' => $order['token'],
    'lines' => $lines,
    'amount' => $amount,
    'name' => $name,
    'firstName' => explode(' ', $name)[0],
    'email' => $email,
    'phone' => $phone,
    'givenName' => split_name($name)[0],
    'familyName' => split_name($name)[1],
    'drawDate' => $draw['drawDate'],
    'drawLocation' => $draw['drawLocation'],
];

// Card payment with SumUp: the buyer pays on the next screen and the emails go out once SumUp confirms it.
if (sumup_enabled()) {
    $checkoutId = sumup_create_checkout($order);
    if ($checkoutId) {
        update_orders(function (array &$rows) use ($ref, $checkoutId) {
            foreach ($rows as &$r) {
                if ($r['ref'] === $ref) {
                    $r['checkout_id'] = $checkoutId;
                }
            }
        });
        echo json_encode($reply + ['payMode' => 'card', 'checkoutId' => $checkoutId]);
        exit;
    }
    // SumUp couldn't be reached: take the order anyway, and the club collects payment.
}

send_mail(
    $config['club_email'],
    "New draw order $ref: $linesText, $total, $name",
    "A new online order for the {$draw['drawName']}. It needs payment.\n\n"
    . "Order:   $ref\nName:    $name\nPhone:   $phone\nEmail:   $email\n"
    . 'Seller:  ' . ($seller ?: '(none given)') . "\n"
    . "Lines:   $linesText ({$bundle['label']}" . ($quantity > 1 ? " x $quantity" : '') . ")\nTo pay:  $total\n\n"
    . "Once they've paid, mark the order as paid here so their lines go on the online cards:\n" . site_url() . "/admin.php\n",
    $email
);

$customerOk = send_mail(
    $email,
    "Your {$draw['drawName']} order $ref",
    "Hi $name,\n\nThanks for supporting {$draw['clubName']}. Your order is in:\n\n"
    . "Order:   $ref\nLines:   $linesText\nTo pay:  $total\n\n"
    . "HOW TO PAY\n{$config['payment_instructions']}\n\n"
    . "Your lines go into the draw, in your name, once payment is received.\n\n"
    . "The Big Draw is on " . draw_when() . " at {$draw['drawLocation']}.\n\n"
    . "Questions? Reply to this email or contact {$config['club_email']}.\n\n{$draw['clubName']}\n",
    $config['club_email']
);

echo json_encode($reply + ['payMode' => 'later', 'instructions' => $config['payment_instructions'], 'emailed' => $customerOk]);
