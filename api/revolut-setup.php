<?php
/**
 * One-time Revolut webhook setup. Open
 *   https://northwestcomplete.com/api/revolut-setup.php?key=YOUR_ADMIN_KEY
 * and the site registers its payment webhook with Revolut and stores the
 * signing secret itself. Re-run it after switching from sandbox to live keys.
 */
require __DIR__ . '/_lib.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

function page(string $title, string $message): void
{
    printf('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%1$s</title>'
        . '<body style="font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;background:#07090f;color:#eef1f7">'
        . '<h1 style="font-size:1.5rem">%1$s</h1><p>%2$s</p></body>', htmlspecialchars($title), $message);
    exit;
}

$c = nwc_config();
if ($c['admin_key'] === '' || !hash_equals($c['admin_key'], (string) ($_GET['key'] ?? ''))) {
    http_response_code(403);
    page('Not allowed', 'This page needs the admin key from nwc-config.php.');
}
if ($c['revolut_secret_key'] === '') {
    page('Revolut not configured', 'Add revolut_secret_key to nwc-config.php first.');
}

$url = rtrim($c['site_url'], '/') . '/api/revolut-webhook.php';
try {
    $hook = revolut_request('POST', '/api/1.0/webhooks', [
        'url'    => $url,
        'events' => ['ORDER_COMPLETED', 'ORDER_AUTHORISED', 'ORDER_PAYMENT_FAILED'],
    ]);
    if (empty($hook['signing_secret'])) {
        throw new RuntimeException('Revolut did not return a signing secret.');
    }
    save_webhook_secret((string) $hook['signing_secret']);
} catch (Throwable $e) {
    error_log('NWC revolut-setup: ' . $e->getMessage());
    page('Webhook setup failed', htmlspecialchars($e->getMessage()));
}
page('Revolut webhook registered', 'Revolut will now notify <strong>' . htmlspecialchars($url) . '</strong> about '
    . ($c['sandbox'] ? 'sandbox' : 'live') . ' payments. The signing secret has been saved. You can close this page.');
