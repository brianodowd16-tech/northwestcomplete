<?php
/**
 * Contact form handler for northwestcomplete.com (Hostinger / any PHP host).
 *
 * Emails each enquiry to TO_EMAIL. FROM_EMAIL must be a mailbox on your own
 * domain (create it in hPanel > Emails) or many providers will mark the
 * message as spam. The visitor's address is set as Reply-To, so you can just
 * hit "Reply".
 */

const TO_EMAIL   = 'hello@northwestcomplete.com';
const FROM_EMAIL = 'hello@northwestcomplete.com';
const FROM_NAME  = 'Northwest Complete website';

const MAX_PER_HOUR   = 5;   // enquiries allowed per visitor IP per hour
const MIN_FILL_SECS  = 3;   // faster than this is treated as a bot

$wantsJson = ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch';

function respond(bool $ok, string $message, int $code = 200): void
{
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $message]);
    } else {
        // Plain form post (JavaScript disabled): send the visitor back to the page.
        header('Location: /?' . ($ok ? 'sent=1' : 'error=1') . '#contact', true, 303);
    }
    exit;
}

function field(string $key, int $maxLen): string
{
    $value = trim((string) ($_POST[$key] ?? ''));
    return mb_substr($value, 0, $maxLen);
}

function oneLine(string $value): string
{
    // Strip line breaks so values can't inject extra email headers.
    return trim(preg_replace('/[\r\n]+/', ' ', $value));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(false, 'Please use the contact form.', 405);
}

// Spam checks: hidden honeypot field, and forms filled in implausibly fast.
if (field('website', 200) !== '') {
    respond(true, 'Thanks, your enquiry has been sent.');
}
$started = (int) ($_POST['started'] ?? 0);
if ($started > 0 && (time() - intdiv($started, 1000)) < MIN_FILL_SECS) {
    respond(true, 'Thanks, your enquiry has been sent.');
}

$name     = oneLine(field('name', 100));
$business = oneLine(field('business', 150));
$email    = oneLine(field('email', 200));
$service  = oneLine(field('service', 100));
$message  = field('message', 5000);

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'Please fill in your name, a valid email and a message.', 422);
}

// Simple per-IP rate limit, stored in the server's temp folder.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateFile = sys_get_temp_dir() . '/nwc_contact_' . hash('sha256', $ip);
$now = time();
$recent = [];
if (is_readable($rateFile)) {
    $recent = array_filter(
        array_map('intval', explode(',', (string) file_get_contents($rateFile))),
        fn ($t) => $t > $now - 3600
    );
}
if (count($recent) >= MAX_PER_HOUR) {
    respond(false, 'You have sent several enquiries already. Please try again later or email us directly.', 429);
}

$subject = 'Website enquiry: ' . ($service !== '' ? $service : 'General') . ($business !== '' ? " - $business" : '');
$body = "New enquiry from northwestcomplete.com\n\n"
      . "Name:     $name\n"
      . "Business: " . ($business !== '' ? $business : '-') . "\n"
      . "Email:    $email\n"
      . "Service:  " . ($service !== '' ? $service : '-') . "\n\n"
      . "Message:\n$message\n\n"
      . "--\nSent " . gmdate('Y-m-d H:i') . " UTC from IP $ip\n";

$headers = [
    'From'         => sprintf('%s <%s>', FROM_NAME, FROM_EMAIL),
    'Reply-To'     => sprintf('"%s" <%s>', str_replace(['"', '\\', '<', '>'], '', $name), $email),
    'MIME-Version' => '1.0',
    'Content-Type' => 'text/plain; charset=UTF-8',
    'X-Mailer'     => 'PHP/' . PHP_VERSION,
];

$sent = mail(
    TO_EMAIL,
    '=?UTF-8?B?' . base64_encode($subject) . '?=',
    $body,
    $headers,
    '-f' . FROM_EMAIL
);

if (!$sent) {
    error_log('contact.php: mail() failed for enquiry from ' . $email);
    respond(false, 'Sorry, your enquiry could not be sent. Please email us at ' . TO_EMAIL . '.', 500);
}

$recent[] = $now;
@file_put_contents($rateFile, implode(',', $recent), LOCK_EX);

respond(true, "Thanks $name, your enquiry has been sent. We'll be in touch within one working day.");
