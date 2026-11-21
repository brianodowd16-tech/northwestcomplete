<?php
// Minimal stand-in for Odoo, used by tests/mypos-flow.sh. Logs every call.
$body = file_get_contents('php://input');
file_put_contents(getenv('ODOO_LOG'), $_SERVER['REQUEST_URI'] . ' ' . ($_SERVER['HTTP_AUTHORIZATION'] ?? '-') . ' ' . $body . "\n", FILE_APPEND);
header('Content-Type: application/json');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/json/2/([^/]+)/([^/]+)$#', $path, $m)) {
    echo json_encode(match ($m[2]) { 'search_read' => [], 'create' => [101], default => true });
} elseif ($path === '/jsonrpc') {
    $p = json_decode($body, true)['params'];
    $r = $p['method'] === 'authenticate' ? 2 : match ($p['args'][4]) { 'search_read' => [], 'create' => [202], default => true };
    echo json_encode(['jsonrpc' => '2.0', 'id' => 1, 'result' => $r]);
} else {
    http_response_code(404);
}
