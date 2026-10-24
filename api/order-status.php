<?php
/**
 * Used by the payment-complete page to show whether the audit payment went
 * through. If Revolut's webhook hasn't arrived yet, this checks the order with
 * Revolut directly and completes it, so nothing depends on webhook timing.
 */
require __DIR__ . '/_lib.php';

$ref = (string) ($_GET['ref'] ?? '');
$record = valid_ref($ref) ? load_record($ref) : null;
if ($record === null) {
    json_out(['status' => 'unknown'], 404);
}

if ($record['status'] === 'pending') {
    try {
        $order = revolut_request('GET', '/api/orders/' . rawurlencode($record['revolut_order_id']));
        if (revolut_order_paid($order)) {
            $record = fulfil_paid_order($ref, $order);
        } elseif (revolut_order_failed($order)) {
            json_out(['status' => 'failed']);
        }
    } catch (Throwable $e) {
        error_log('NWC order-status: ' . $e->getMessage());
    }
}

json_out([
    'status'    => $record['status'] === 'paid' ? 'paid' : 'pending',
    'reference' => $record['ref'],
    'amount'    => format_amount((int) $record['amount'], $record['currency']),
    'email'     => $record['status'] === 'paid' ? $record['email'] : null,
]);
