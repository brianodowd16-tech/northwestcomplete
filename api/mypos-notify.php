<?php
/**
 * Receives payment notifications from myPOS (the URL_Notify we send with every
 * checkout). Each request is verified with myPOS's public certificate, and the
 * amount, currency and store are checked against our own order record before
 * anything is fulfilled. myPOS expects a plain "OK" reply; any other reply
 * makes it retry later.
 */
require __DIR__ . '/_lib.php';

function reply(string $text, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $text;
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    reply('POST only', 405);
}

$c = nwc_config();
$fields = $_POST;
if (!mypos_enabled() || !mypos_verify($fields)) {
    error_log('NWC myPOS notify: signature check failed');
    reply('invalid signature', 401);
}

// Only completed purchases need action; acknowledge everything else.
if (($fields['IPCmethod'] ?? '') !== 'IPCPurchaseNotify') {
    reply('OK');
}

$ref = (string) ($fields['OrderID'] ?? '');
$record = valid_ref($ref) ? load_record($ref) : null;
if ($record === null || (string) ($fields['SID'] ?? '') !== (string) $c['mypos_sid']) {
    error_log("NWC myPOS notify: unknown order or store for '$ref'");
    reply('OK');
}

$amount = (int) round(((float) ($fields['Amount'] ?? 0)) * 100);
$currency = strtoupper((string) ($fields['Currency'] ?? ''));
if ($amount !== (int) $record['amount'] || $currency !== $record['currency']) {
    error_log("NWC myPOS notify: amount mismatch for $ref ($amount $currency)");
    send_mail($c['notify_email'], "Check payment $ref: amount mismatch",
        "myPOS reported $amount minor units $currency for $ref, but the order was " . $record['amount'] . " {$record['currency']}. Nothing was fulfilled automatically; please check it in myPOS.\n");
    reply('OK');
}

try {
    fulfil_paid_order($ref, [
        'amount'         => $amount,
        'currency'       => $currency,
        'transaction_id' => (string) ($fields['IPC_Trnref'] ?? ''),
    ]);
} catch (Throwable $e) {
    error_log('NWC myPOS notify: ' . $e->getMessage());
    reply('error', 500); // myPOS retries
}
reply('OK');
