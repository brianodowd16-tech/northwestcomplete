<?php
/**
 * Starts a €500 systems audit payment: saves the client's details, creates a
 * Revolut order and sends the browser to Revolut's hosted checkout page.
 */
require __DIR__ . '/_lib.php';

$wantsJson = ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch';

function fail(string $message, int $code): void
{
    global $wantsJson;
    if ($wantsJson) {
        json_out(['ok' => false, 'message' => $message], $code);
    }
    header('Location: /book-audit.html?error=1', true, 303);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    fail('Please use the booking form.', 405);
}

// Bots fill in the hidden field; send them nowhere.
if (trim((string) ($_POST['website'] ?? '')) !== '') {
    fail('Please use the booking form.', 400);
}

$name     = one_line((string) ($_POST['name'] ?? ''), 100);
$email    = one_line((string) ($_POST['email'] ?? ''), 200);
$business = one_line((string) ($_POST['business'] ?? ''), 150);
$phone    = one_line((string) ($_POST['phone'] ?? ''), 40);
$notes    = mb_substr(trim((string) ($_POST['notes'] ?? '')), 0, 3000);
$agreed   = !empty($_POST['agree']);

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('Please enter your name and a valid email address.', 422);
}
if (!$agreed) {
    fail('Please confirm you agree to the audit terms.', 422);
}

$c = nwc_config();

// At most 10 checkout attempts per visitor per hour.
$rateFile = sys_get_temp_dir() . '/nwc_checkout_' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
$now = time();
$recent = is_readable($rateFile)
    ? array_filter(array_map('intval', explode(',', (string) file_get_contents($rateFile))), fn ($t) => $t > $now - 3600)
    : [];
if (count($recent) >= 10) {
    fail('Too many attempts. Please try again later or email ' . $c['notify_email'] . '.', 429);
}
$recent[] = $now;
@file_put_contents($rateFile, implode(',', $recent), LOCK_EX);

$ref = new_ref();
try {
    $order = revolut_request('POST', '/api/orders', [
        'amount'                 => (int) $c['audit_amount'],
        'currency'               => $c['currency'],
        'capture_mode'           => 'automatic',
        'description'            => $c['audit_name'] . ($business !== '' ? " - $business" : ''),
        'merchant_order_ext_ref' => $ref,
        'customer'               => ['email' => $email, 'full_name' => $name],
        'redirect_url'           => rtrim($c['site_url'], '/') . '/payment-complete.html?ref=' . $ref,
    ]);
    if (empty($order['id']) || empty($order['checkout_url'])) {
        throw new RuntimeException('Revolut response missing id or checkout_url');
    }
    save_record([
        'ref'              => $ref,
        'status'           => 'pending',
        'created_at'       => gmdate('c'),
        'amount'           => (int) $c['audit_amount'],
        'currency'         => $c['currency'],
        'name'             => $name,
        'email'            => $email,
        'business'         => $business,
        'phone'            => $phone,
        'notes'            => $notes,
        'revolut_order_id' => (string) $order['id'],
    ]);
} catch (Throwable $e) {
    error_log('NWC checkout: ' . $e->getMessage());
    fail('We could not start the payment. Please try again, or email ' . $c['notify_email'] . '.', 502);
}

if ($wantsJson) {
    json_out(['ok' => true, 'checkout_url' => $order['checkout_url'], 'reference' => $ref]);
}
header('Location: ' . $order['checkout_url'], true, 303);
