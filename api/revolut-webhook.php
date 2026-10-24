<?php
/**
 * Receives payment events from Revolut. Every request is checked against the
 * webhook signing secret, and the order is re-read from Revolut before it is
 * treated as paid.
 */
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    json_out(['ok' => false], 405);
}

$c = nwc_config();
$raw = (string) file_get_contents('php://input');
$timestamp = (string) ($_SERVER['HTTP_REVOLUT_REQUEST_TIMESTAMP'] ?? '');
$signatures = (string) ($_SERVER['HTTP_REVOLUT_SIGNATURE'] ?? '');

// Signature: "v1=" + HMAC-SHA256 of "v1.{timestamp}.{raw body}". Several may be
// sent, comma-separated, while a signing secret is being rotated.
$valid = false;
if ($c['revolut_webhook_secret'] !== '' && $timestamp !== '' && $signatures !== '') {
    $expected = 'v1=' . hash_hmac('sha256', "v1.$timestamp.$raw", $c['revolut_webhook_secret']);
    foreach (preg_split('/[,\s]+/', $signatures) as $candidate) {
        if ($candidate !== '' && hash_equals($expected, $candidate)) {
            $valid = true;
            break;
        }
    }
}
// Reject anything older than 5 minutes (timestamp is in milliseconds).
$seconds = (int) $timestamp > 9999999999 ? intdiv((int) $timestamp, 1000) : (int) $timestamp;
if (!$valid || abs(time() - $seconds) > 300) {
    json_out(['ok' => false, 'error' => 'invalid signature'], 401);
}

$event = json_decode($raw, true);
$type = (string) ($event['event'] ?? '');
$ref = (string) ($event['merchant_order_ext_ref'] ?? '');
$orderId = (string) ($event['order_id'] ?? '');

// Only completed payments for our audit orders need action; acknowledge the rest.
if ($type !== 'ORDER_COMPLETED' || !valid_ref($ref)) {
    json_out(['ok' => true, 'ignored' => $type]);
}

$record = load_record($ref);
if ($record === null || $record['revolut_order_id'] !== $orderId) {
    error_log("NWC webhook: unknown order $ref / $orderId");
    json_out(['ok' => true, 'ignored' => 'unknown order']);
}

try {
    $order = revolut_request('GET', '/api/orders/' . rawurlencode($orderId));
    if (!revolut_order_paid($order)) {
        json_out(['ok' => true, 'state' => $order['state'] ?? 'unknown']);
    }
    fulfil_paid_order($ref, $order);
} catch (Throwable $e) {
    error_log('NWC webhook: ' . $e->getMessage());
    // A non-2xx response makes Revolut retry the webhook later.
    json_out(['ok' => false], 500);
}

json_out(['ok' => true]);
