<?php
/**
 * One-time Xero connection. Open
 *   https://northwestcomplete.com/api/xero-connect.php?key=YOUR_ADMIN_KEY
 * sign in to Xero, pick your organisation, and the site stores the tokens it
 * needs to create invoices. Re-run it if Xero is ever disconnected.
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
$redirectUri = rtrim($c['site_url'], '/') . '/api/xero-connect.php';
$stateFile = $c['data_dir'] . '/xero-connect-state';

if ($c['xero_client_id'] === '' || $c['xero_client_secret'] === '' || $c['admin_key'] === '') {
    page('Xero not configured', 'Add xero_client_id, xero_client_secret and admin_key to nwc-config.php first.');
}

// Step 2: Xero sends the browser back here with a one-time code.
if (isset($_GET['code'])) {
    $expected = is_readable($stateFile) ? (string) file_get_contents($stateFile) : '';
    @unlink($stateFile);
    if ($expected === '' || !hash_equals($expected, (string) ($_GET['state'] ?? ''))) {
        page('Connection expired', 'Please start again from the connect link.');
    }
    try {
        $tokens = xero_token_request([
            'grant_type'   => 'authorization_code',
            'code'         => (string) $_GET['code'],
            'redirect_uri' => $redirectUri,
        ]);
        $connections = http_ok(http_json('GET', xero_base('api') . '/connections', ['Authorization: Bearer ' . $tokens['access_token']]), 'Xero connections');
        $org = $connections[0] ?? null;
        if (!$org || empty($org['tenantId'])) {
            throw new RuntimeException('No Xero organisation was selected.');
        }
        xero_save_tokens($tokens, $org['tenantId']);
    } catch (Throwable $e) {
        error_log('NWC xero-connect: ' . $e->getMessage());
        page('Xero connection failed', htmlspecialchars($e->getMessage()));
    }
    page('Xero connected', 'Connected to <strong>' . htmlspecialchars($org['tenantName'] ?? 'your organisation')
        . '</strong>. Paid audits will now create invoices in Xero automatically. You can close this page.');
}

if (isset($_GET['error'])) {
    page('Xero connection cancelled', htmlspecialchars((string) ($_GET['error_description'] ?? $_GET['error'])));
}

// Step 1: check the admin key, then send the browser to Xero to approve access.
if (!hash_equals($c['admin_key'], (string) ($_GET['key'] ?? ''))) {
    http_response_code(403);
    page('Not allowed', 'This page needs the admin key from nwc-config.php.');
}
$state = bin2hex(random_bytes(16));
if (!is_dir($c['data_dir'])) {
    mkdir($c['data_dir'], 0700, true);
}
file_put_contents($stateFile, $state, LOCK_EX);
header('Location: https://login.xero.com/identity/connect/authorize?' . http_build_query([
    'response_type' => 'code',
    'client_id'     => $c['xero_client_id'],
    'redirect_uri'  => $redirectUri,
    'scope'         => $c['xero_scopes'],
    'state'         => $state,
]), true, 302);
