<?php
// Shared helpers for the Hostinger (PHP) version of the draw: config, the order file and emails.
declare(strict_types=1);

// The order file is a .php file whose first line stops PHP from serving it,
// so it stays private even if the data folder's .htaccess is ignored.
const DATA_GUARD = "<?php http_response_code(404); exit; ?>\n";
const ORDER_COLUMNS = ['ref', 'created', 'status', 'name', 'phone', 'email', 'seller', 'bundle', 'quantity', 'lines', 'amount', 'paid_at', 'slot_start'];

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
        if (count($row) === count(ORDER_COLUMNS)) {
            $rows[] = array_combine(ORDER_COLUMNS, $row);
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
