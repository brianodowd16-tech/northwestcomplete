<?php
// Shared helpers for the Hostinger (PHP) version of the draw: config, the order file and emails.
declare(strict_types=1);

// The order file is a .php file whose first line stops PHP from serving it,
// so it stays private even if the data folder's .htaccess is ignored.
const DATA_GUARD = "<?php http_response_code(404); exit; ?>\n";
// New columns go on the end: rows written before a column existed are padded when read.
const ORDER_COLUMNS = ['ref', 'created', 'status', 'name', 'phone', 'email', 'seller', 'bundle', 'quantity', 'lines', 'amount', 'paid_at', 'slot_start', 'token', 'checkout_id', 'txn'];

function cfg(): array
{
    static $config;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
        if (str_contains($config['from_email'] ?? '', 'YOURDOMAIN') || empty($config['from_email'])) {
            $host = explode(':', $_SERVER['HTTP_HOST'] ?? 'localhost')[0];
            $host = preg_replace('/^www\./', '', preg_replace('/[^a-z0-9.\-]/i', '', $host));
            $config['from_email'] = 'noreply@' . $host;
        }
    }
    return $config;
}

function draw(): array
{
    static $draw;
    return $draw ??= json_decode((string) file_get_contents(__DIR__ . '/draw.json'), true, 512, JSON_THROW_ON_ERROR);
}

function data_path(string $name): string
{
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    return "$dir/$name";
}

function read_rows($handle): array
{
    rewind($handle);
    fgets($handle); // the guard line
    $rows = [];
    while (($row = fgetcsv($handle, null, ',', '"', '')) !== false) {
        if (count($row) >= 13 && count($row) <= count(ORDER_COLUMNS)) {
            $rows[] = array_combine(ORDER_COLUMNS, array_pad($row, count(ORDER_COLUMNS), ''));
        }
    }
    return $rows;
}

function write_rows($handle, array $rows): void
{
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, DATA_GUARD);
    foreach ($rows as $row) {
        fputcsv($handle, array_map(fn ($c) => (string) ($row[$c] ?? ''), ORDER_COLUMNS), ',', '"', '');
    }
    fflush($handle);
}

/** Read every order (shared lock). */
function all_orders(): array
{
    $file = data_path('orders.php');
    if (!file_exists($file)) {
        return [];
    }
    $h = fopen($file, 'r');
    flock($h, LOCK_SH);
    $rows = read_rows($h);
    flock($h, LOCK_UN);
    fclose($h);
    return $rows;
}

/** Change the orders under an exclusive lock. $fn receives the rows by reference. */
function update_orders(callable $fn)
{
    $h = fopen(data_path('orders.php'), 'c+');
    flock($h, LOCK_EX);
    $rows = read_rows($h);
    $result = $fn($rows);
    write_rows($h, $rows);
    flock($h, LOCK_UN);
    fclose($h);
    return $result;
}

function euro(int $cents): string
{
    return '€' . (fmod($cents / 100, 1) ? number_format($cents / 100, 2) : number_format($cents / 100));
}

function draw_when(): string
{
    $d = new DateTime(draw()['drawDate']);
    $d->setTimezone(new DateTimeZone('Europe/Dublin'));
    return $d->format('l j F Y') . ' at ' . strtolower($d->format('ga'));
}

/** Plain-text email. Header values are stripped of line breaks so form input can't inject headers. */
function send_mail(string $to, string $subject, string $body, ?string $replyTo = null): bool
{
    $clean = fn ($v) => trim(preg_replace('/[\r\n]+/', ' ', $v));
    $headers = [
        'From: "' . str_replace('"', '', $clean(draw()['clubName'])) . '" <' . $clean(cfg()['from_email']) . '>',
        'Content-Type: text/plain; charset=UTF-8',
        'MIME-Version: 1.0',
    ];
    if ($replyTo) {
        $headers[] = 'Reply-To: ' . $clean($replyTo);
    }
    $ok = @mail($clean($to), '=?UTF-8?B?' . base64_encode($clean($subject)) . '?=', $body, implode("\r\n", $headers));
    if (!$ok) {
        error_log("Draw: could not send email to $to ($subject)");
    }
    return $ok;
}

/** "Card 3, lines 1-7" style reference for a block of slots (slots count from 0). */
function describe_slots(int $start, int $count, int $perCard): string
{
    $parts = [];
    for ($slot = $start; $slot < $start + $count;) {
        $card = intdiv($slot, $perCard) + 1;
        $first = $slot % $perCard + 1;
        $last = min($perCard, $first + ($start + $count - $slot) - 1);
        $parts[] = "Card $card, " . ($first === $last ? "line $first" : "lines $first-$last");
        $slot += $last - $first + 1;
    }
    return implode('; ', $parts);
}

function h($v): string
{
    return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
}

function site_url(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    return ($https ? 'https' : 'http') . '://' . preg_replace('/[^a-z0-9.\-:]/i', '', $_SERVER['HTTP_HOST'] ?? '');
}

function find_order(string $ref): ?array
{
    foreach (all_orders() as $o) {
        if ($o['ref'] === $ref) {
            return $o;
        }
    }
    return null;
}

/**
 * Mark an order paid and place its lines on the online cards, in the order payments are recorded.
 * An order that fits on one card is kept together; bigger orders run across cards.
 * Returns the updated row, or null if it was already paid (so callers only act once).
 */
function mark_paid(array &$rows, string $ref, string $txn = ''): ?array
{
    $perCard = (int) (draw()['linesPerCard'] ?? 20);
    $next = 0;
    foreach ($rows as $r) {
        if ($r['slot_start'] !== '') {
            $next = max($next, (int) $r['slot_start'] + (int) $r['lines']);
        }
    }
    foreach ($rows as &$r) {
        if ($r['ref'] !== $ref || $r['status'] === 'paid') {
            continue;
        }
        $lines = (int) $r['lines'];
        $used = $next % $perCard;
        if ($used !== 0 && $lines > $perCard - $used) {
            $next += $perCard - $used;
        }
        $r['status'] = 'paid';
        $r['paid_at'] = date('c');
        $r['slot_start'] = (string) $next;
        if ($txn !== '') {
            $r['txn'] = $txn;
        }
        return $r;
    }
    return null;
}

// ---------------- SumUp ----------------
// Card payments, rebuilt from SumUp's WooCommerce plugin: create a checkout through the API, show SumUp's
// card widget on the page, then confirm by reading the checkout back from SumUp before marking anything paid.

function sumup_enabled(): bool
{
    $c = cfg();
    return !empty($c['sumup_api_key']) && !empty($c['sumup_merchant_code']);
}

function sumup_base(): string
{
    return rtrim(cfg()['sumup_api_base'] ?? 'https://api.sumup.com', '/');
}

/** The club's SumUp API key, sent as a bearer token. */
function sumup_token(): ?string
{
    return cfg()['sumup_api_key'] ?: null;
}

/** Returns [http status, decoded JSON body]. Status 0 means the request didn't complete. */
function http_request(string $method, string $url, ?array $body = null, ?string $bearer = null): array
{
    $ch = curl_init($url);
    $headers = ['Accept: application/json', 'User-Agent: StMichaelsDraw/1.0'];
    if ($bearer) {
        $headers[] = 'Authorization: Bearer ' . $bearer;
    }
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($raw === false) {
        error_log('Draw: request to ' . $url . ' failed: ' . curl_error($ch));
    }
    curl_close($ch);
    return [$raw === false ? 0 : $code, json_decode((string) $raw, true) ?: []];
}

function sumup_reference(array $order): string
{
    // The reference must be unique on the SumUp account, even if test orders are cleared and refs restart.
    return $order['ref'] . '-' . substr($order['token'], 0, 8);
}

/** Create a SumUp checkout for an order. Returns the checkout id, or null if SumUp couldn't be reached. */
/**
 * "Mary Anne Murphy" → ["Mary Anne", "Murphy"], "Seán Ó Briain" → ["Seán", "Ó Briain"].
 * Surname prefixes stay with the surname; a single name goes in first name.
 */
function split_name(string $name): array
{
    $parts = preg_split('/\s+/u', trim($name)) ?: [];
    if (count($parts) < 2) {
        return [implode(' ', $parts), ''];
    }
    $last = [array_pop($parts)];
    $prefixes = ['ó', 'o', 'ui', 'uí', 'ní', 'ni', 'nic', 'mac', 'mc', 'mhic', 'giolla', 'de', 'di', 'du', 'van', 'von', 'le', 'la', 'del', 'da'];
    while (count($parts) > 1 && in_array(mb_strtolower(end($parts)), $prefixes, true)) {
        array_unshift($last, array_pop($parts));
    }
    return [implode(' ', $parts), implode(' ', $last)];
}

/** "087 123 4567" → "+353871234567". Numbers already in +/00 form keep their country code. */
function international_phone(string $phone): string
{
    $digits = preg_replace('/[^0-9+]/', '', $phone);
    if (str_starts_with($digits, '+')) {
        return $digits;
    }
    if (str_starts_with($digits, '00')) {
        return '+' . substr($digits, 2);
    }
    if (str_starts_with($digits, '0')) {
        return '+353' . substr($digits, 1);
    }
    return $digits;
}

/**
 * Save the buyer as a SumUp customer, so their name, email and phone show against the payment in
 * SumUp. Returns the customer id, or null if SumUp refused (the payment then goes ahead without it).
 */
function sumup_create_customer(array $order, string $token): ?string
{
    [$first, $last] = split_name($order['name']);
    $id = sumup_reference($order);
    [$code, $body] = http_request('POST', sumup_base() . '/v0.1/customers', [
        'customer_id' => $id,
        'personal_details' => array_filter([
            'first_name' => $first,
            'last_name' => $last,
            'email' => $order['email'],
            'phone' => international_phone($order['phone']),
        ], fn ($v) => $v !== ''),
    ], $token);
    if ($code === 200 || $code === 201 || $code === 409) { // 409: already saved by an earlier attempt
        return $id;
    }
    error_log("Draw: SumUp customer for {$order['ref']} not saved ($code): " . ($body['message'] ?? $body['error_code'] ?? ''));
    return null;
}

function sumup_create_checkout(array $order): ?string
{
    $token = sumup_token();
    if (!$token) {
        return null;
    }
    $draw = draw();
    $customerId = sumup_create_customer($order, $token);
    // The description shows in SumUp's sales list, so it carries the buyer's name and email too.
    $description = mb_substr("{$draw['drawName']} {$order['ref']}: {$order['lines']} lines · {$order['name']} ({$order['email']})", 0, 255);
    $back = site_url() . '/success.html?' . http_build_query(['ref' => $order['ref'], 'token' => $order['token']]);
    [$code, $body] = http_request('POST', sumup_base() . '/v0.1/checkouts', [
        'checkout_reference' => sumup_reference($order),
        'amount' => round((int) $order['amount'] / 100, 2),
        'currency' => strtoupper($draw['currency'] ?? 'EUR'),
        'merchant_code' => cfg()['sumup_merchant_code'],
        'description' => $description,
        'return_url' => site_url() . '/sumup-webhook.php',
        'redirect_url' => $back,
    ] + ($customerId ? ['customer_id' => $customerId] : []), $token);
    if (($code === 200 || $code === 201) && !empty($body['id'])) {
        return (string) $body['id'];
    }
    error_log("Draw: SumUp checkout for {$order['ref']} failed ($code): " . ($body['message'] ?? $body['error_code'] ?? ''));
    return null;
}

/**
 * Ask SumUp whether an order's checkout is paid. Marks it paid and sends the emails the first time.
 * Never trusts the browser or the webhook body: the checkout is always read back from SumUp's API and
 * must match this order's reference, amount, currency and merchant.
 */
function sumup_confirm(string $ref): ?array
{
    $order = find_order($ref);
    if (!$order || $order['status'] === 'paid' || $order['checkout_id'] === '' || !sumup_enabled()) {
        return $order;
    }
    $token = sumup_token();
    if (!$token) {
        return $order;
    }
    [$code, $c] = http_request('GET', sumup_base() . '/v0.1/checkouts/' . rawurlencode($order['checkout_id']), null, $token);
    $matches = $code === 200
        && ($c['id'] ?? '') === $order['checkout_id']
        && ($c['checkout_reference'] ?? '') === sumup_reference($order)
        && strtoupper((string) ($c['currency'] ?? '')) === strtoupper(draw()['currency'] ?? 'EUR')
        && abs((float) ($c['amount'] ?? -1) - (int) $order['amount'] / 100) < 0.001
        && (empty($c['merchant_code']) || $c['merchant_code'] === cfg()['sumup_merchant_code']);
    if (!$matches || ($c['status'] ?? '') !== 'PAID') {
        return $order;
    }
    $txn = (string) ($c['transaction_code'] ?? ($c['transactions'][0]['transaction_code'] ?? ($c['transaction_id'] ?? '')));
    $paid = update_orders(fn (array &$rows) => mark_paid($rows, $ref, $txn));
    if ($paid) {
        send_paid_emails($paid);
        return $paid;
    }
    return find_order($ref);
}

function send_paid_emails(array $o): void
{
    $draw = draw();
    $config = cfg();
    $lines = (int) $o['lines'];
    $linesText = $lines . ' line' . ($lines > 1 ? 's' : '');
    $total = euro((int) $o['amount']);
    $where = describe_slots((int) $o['slot_start'], $lines, (int) ($draw['linesPerCard'] ?? 20));
    send_mail(
        $config['club_email'],
        "PAID draw order {$o['ref']}: $linesText, $total, {$o['name']}",
        "An online order for the {$draw['drawName']} has been paid by card (SumUp).\n\n"
        . "Order:   {$o['ref']}\nName:    {$o['name']}\nPhone:   {$o['phone']}\nEmail:   {$o['email']}\n"
        . 'Seller:  ' . ($o['seller'] ?: '(none given)') . "\nLines:   $linesText\nPaid:    $total"
        . ($o['txn'] !== '' ? " (SumUp {$o['txn']})" : '') . "\nCards:   Online $where\n\n"
        . "Nothing to do: the lines are already on the online cards.\n" . site_url() . "/admin.php\n",
        $o['email']
    );
    send_mail(
        $o['email'],
        "You're in: {$draw['drawName']} order {$o['ref']}",
        "Hi {$o['name']},\n\nThanks for supporting {$draw['clubName']}. Your payment has gone through and you're in the draw.\n\n"
        . "Order:   {$o['ref']}\nLines:   $linesText, entered in your name\nPaid:    $total\n\n"
        . "The Big Draw is on " . draw_when() . " at {$draw['drawLocation']}. Keep this email as your proof of entry.\n\n"
        . "Questions? Reply to this email or contact {$config['club_email']}.\n\n{$draw['clubName']}\n",
        $config['club_email']
    );
}
