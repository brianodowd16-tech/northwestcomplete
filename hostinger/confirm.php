<?php
// The buyer's browser asks here whether an order is paid: after SumUp's card form reports success,
// and when the confirmation page loads (including after a bank's 3-D Secure redirect).
// The answer always comes from SumUp's API, never from the browser.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$in = json_decode((string) file_get_contents('php://input'), true);
$ref = (string) ($in['ref'] ?? '');
$token = (string) ($in['token'] ?? '');
$order = $ref !== '' ? find_order($ref) : null;
// The token is only known to the buyer who placed the order, so others can't look orders up.
if (!$order || $order['token'] === '' || !hash_equals($order['token'], $token)) {
    http_response_code(404);
    echo json_encode(['error' => 'Order not found.']);
    exit;
}

$order = sumup_confirm($ref) ?? $order;
$draw = draw();
echo json_encode([
    'ref' => $order['ref'],
    'status' => $order['status'],
    'payMode' => $order['checkout_id'] !== '' ? 'card' : 'later',
    'lines' => (int) $order['lines'],
    'amount' => (int) $order['amount'],
    'name' => $order['name'],
    'firstName' => explode(' ', $order['name'])[0],
    'email' => $order['email'],
    'drawDate' => $draw['drawDate'],
    'drawLocation' => $draw['drawLocation'],
    'instructions' => $order['status'] === 'paid' ? '' : cfg()['payment_instructions'],
]);
