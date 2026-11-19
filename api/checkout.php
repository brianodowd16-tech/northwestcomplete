<?php
/**
 * Starts a €500 systems audit payment: saves the client's details and returns
 * a signed form that sends the browser to myPOS's hosted checkout page.
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
$source   = one_line((string) ($_POST['source'] ?? ''), 200);
$agreed   = !empty($_POST['agree']);

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('Please enter your name and a valid email address.', 422);
}
if (!$agreed) {
    fail('Please confirm you agree to the audit terms.', 422);
}

$c = nwc_config();

// Until the myPOS keys are added, say so plainly instead of failing with a generic error.
if (!mypos_enabled()) {
    fail('Online payment is being set up. Please send us a message using the contact form and we will invoice you directly.', 503);
}

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
    $record = [
        'ref'          => $ref,
        'status'       => 'pending',
        'created_at'   => gmdate('c'),
        'amount'       => (int) $c['audit_amount'],
        'currency'     => $c['currency'],
        'name'         => $name,
        'email'        => $email,
        'business'     => $business,
        'phone'        => $phone,
        'notes'        => $notes,
        'source'       => $source,
        'mypos_trnref' => '',
    ];
    $fields = mypos_checkout_fields($record);
    save_record($record);
} catch (Throwable $e) {
    error_log('NWC checkout: ' . $e->getMessage());
    fail('We could not start the payment. Please try again, or email ' . $c['notify_email'] . '.', 502);
}

$action = mypos_checkout_url();
if ($wantsJson) {
    json_out(['ok' => true, 'action' => $action, 'fields' => $fields, 'reference' => $ref]);
}

// No JavaScript: show a page with a button that posts the signed form to myPOS.
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
   . '<title>Continue to secure payment</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem">'
   . '<h1>Continue to secure payment</h1><p>Your details are saved. Press the button to pay on myPOS\'s secure page.</p>'
   . '<form method="post" action="' . htmlspecialchars($action, ENT_QUOTES) . '">';
foreach ($fields as $k => $v) {
    echo '<input type="hidden" name="' . htmlspecialchars($k, ENT_QUOTES) . '" value="' . htmlspecialchars((string) $v, ENT_QUOTES) . '">';
}
echo '<button type="submit" style="font-size:1.1rem;padding:.8rem 1.4rem">Pay €500 securely</button></form></body></html>';
