<?php
/**
 * Used by the payment-complete page to show whether the audit payment went
 * through. The status flips to "paid" when myPOS's signed notification arrives
 * (api/mypos-notify.php), normally within a few seconds of payment.
 */
require __DIR__ . '/_lib.php';

$ref = (string) ($_GET['ref'] ?? '');
$record = valid_ref($ref) ? load_record($ref) : null;
if ($record === null) {
    json_out(['status' => 'unknown'], 404);
}

json_out([
    'status'    => $record['status'] === 'paid' ? 'paid' : 'pending',
    'reference' => $record['ref'],
    'amount'    => format_amount((int) $record['amount'], $record['currency']),
    'email'     => $record['status'] === 'paid' ? $record['email'] : null,
]);
