<?php
// SumUp calls this when a checkout's status changes (the checkout's return_url). As in SumUp's own
// plugin, the message only says which checkout changed: the status is read back from SumUp's API.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');

$event = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($event) || empty($event['id']) || ($event['event_type'] ?? '') !== 'CHECKOUT_STATUS_CHANGED') {
    echo json_encode(['ok' => true, 'ignored' => true]);
    exit;
}

foreach (all_orders() as $o) {
    if ($o['checkout_id'] !== '' && hash_equals($o['checkout_id'], (string) $event['id'])) {
        sumup_confirm($o['ref']);
        break;
    }
}
echo json_encode(['ok' => true]);
