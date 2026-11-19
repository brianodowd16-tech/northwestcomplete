<?php
/**
 * Shared code for the myPOS audit checkout.
 *
 * Settings live in nwc-config.php OUTSIDE public_html (one level above it on
 * Hostinger), so secret keys never sit in the web root or in GitHub.
 * See nwc-config.sample.php for every setting.
 *
 * When an audit is paid, fulfil_paid_order() runs every enabled step:
 * Xero invoice + payment, HubSpot contact + deal, client and team emails,
 * and an optional webhook for any other automation tool.
 */

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

function nwc_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $defaults = [
        'mypos_sid'                 => '',
        'mypos_wallet'              => '',
        'mypos_key_index'           => 1,
        'mypos_private_key'         => '',
        'mypos_public_cert'         => '',
        'mypos_sandbox'             => true,
        'mypos_checkout_url'        => '',
        'site_url'                  => 'https://northwestcomplete.com',
        'audit_amount'              => 50000,
        'currency'                  => 'EUR',
        'audit_name'                => 'Comprehensive systems audit',
        'notify_email'              => 'hello@northwestcomplete.com',
        'from_email'                => 'hello@northwestcomplete.com',
        'from_name'                 => 'Northwest Complete',
        'booking_url'               => '',
        'admin_key'                 => '',
        'xero_client_id'            => '',
        'xero_client_secret'        => '',
        'xero_scopes'               => 'offline_access accounting.transactions accounting.contacts',
        'xero_sales_account_code'   => '200',
        'xero_payment_account_code' => '',
        'xero_line_amount_types'    => 'NoTax',
        'xero_tax_type'             => '',
        'xero_email_invoice'        => true,
        'hubspot_token'             => '',
        'hubspot_pipeline'          => 'default',
        'hubspot_dealstage'         => 'closedwon',
        'automation_webhook_url'    => '',
        'automation_webhook_secret' => '',
        'data_dir'                  => null,
    ];
    $file = getenv('NWC_CONFIG') ?: dirname(__DIR__, 2) . '/nwc-config.php';
    $loaded = is_readable($file) ? require $file : [];
    $config = array_merge($defaults, is_array($loaded) ? $loaded : []);
    $config['data_dir'] = $config['data_dir'] ?: dirname(__DIR__, 2) . '/nwc-data';
    return $config;
}

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function one_line(string $value, int $maxLen): string
{
    return mb_substr(trim(preg_replace('/[\r\n\t]+/', ' ', $value)), 0, $maxLen);
}

function format_amount(int $minor, string $currency): string
{
    $symbol = ['EUR' => '€', 'GBP' => '£', 'USD' => '$'][$currency] ?? ($currency . ' ');
    return $symbol . number_format($minor / 100, $minor % 100 === 0 ? 0 : 2);
}

/* ---------- Order records (JSON files outside the web root) ---------- */

function valid_ref(string $ref): bool
{
    return (bool) preg_match('/^AUDIT-\d{8}-[A-F0-9]{6}$/', $ref);
}

function new_ref(): string
{
    return 'AUDIT-' . gmdate('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function record_path(string $ref): string
{
    $dir = nwc_config()['data_dir'] . '/orders';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create data directory ' . $dir);
    }
    return $dir . '/' . $ref . '.json';
}

function load_record(string $ref): ?array
{
    if (!valid_ref($ref)) {
        return null;
    }
    $path = record_path($ref);
    if (!is_readable($path)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function save_record(array $record): void
{
    $path = record_path($record['ref']);
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    rename($tmp, $path);
}

/* ---------- myPOS Checkout ---------- */

/**
 * myPOS Checkout (IPC 1.4): the browser POSTs a signed form to myPOS, the
 * customer pays on myPOS's hosted page, and myPOS then POSTs a signed
 * notification to api/mypos-notify.php. Signatures are RSA-SHA256 over the
 * base64 of every field value joined with "-", in the order the fields are sent.
 * Keys come from the myPOS configuration pack and are never stored in public_html.
 */

/** A key or certificate given either as a file path or as the PEM text itself. */
function mypos_pem(string $value): string
{
    $value = trim($value);
    if ($value !== '' && strpos($value, '-----BEGIN') === false && is_readable($value)) {
        return (string) file_get_contents($value);
    }
    return $value;
}

function mypos_enabled(): bool
{
    $c = nwc_config();
    return $c['mypos_sid'] !== '' && $c['mypos_wallet'] !== '' && mypos_pem($c['mypos_private_key']) !== '' && mypos_pem($c['mypos_public_cert']) !== '';
}

function mypos_checkout_url(): string
{
    $c = nwc_config();
    if ($c['mypos_checkout_url'] !== '') {
        return $c['mypos_checkout_url'];
    }
    return $c['mypos_sandbox'] ? 'https://www.mypos.com/vmp/checkout-test' : 'https://www.mypos.com/vmp/checkout';
}

function mypos_payload(array $fields): string
{
    unset($fields['Signature']);
    return base64_encode(implode('-', array_map('strval', array_values($fields))));
}

function mypos_sign(array $fields): string
{
    $key = openssl_pkey_get_private(mypos_pem(nwc_config()['mypos_private_key']));
    if ($key === false || !openssl_sign(mypos_payload($fields), $signature, $key, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Could not sign the myPOS request. Check mypos_private_key.');
    }
    return base64_encode($signature);
}

function mypos_verify(array $fields): bool
{
    $signature = base64_decode((string) ($fields['Signature'] ?? ''), true);
    $cert = openssl_pkey_get_public(mypos_pem(nwc_config()['mypos_public_cert']));
    if ($signature === false || $signature === '' || $cert === false) {
        return false;
    }
    return openssl_verify(mypos_payload($fields), $signature, $cert, OPENSSL_ALGO_SHA256) === 1;
}

/** The signed form fields the browser posts to myPOS to start a payment. */
function mypos_checkout_fields(array $record): array
{
    $c = nwc_config();
    $site = rtrim($c['site_url'], '/');
    [$first, $last] = array_pad(explode(' ', $record['name'], 2), 2, '');
    $amount = number_format($record['amount'] / 100, 2, '.', '');
    $fields = [
        'IPCmethod'                => 'IPCPurchase',
        'IPCVersion'               => '1.4',
        'IPCLanguage'              => 'EN',
        'SID'                      => $c['mypos_sid'],
        'walletnumber'             => $c['mypos_wallet'],
        'Amount'                   => $amount,
        'Currency'                 => $record['currency'],
        'OrderID'                  => $record['ref'],
        'URL_OK'                   => $site . '/payment-complete.html?ref=' . $record['ref'],
        'URL_Cancel'               => $site . '/book-audit.html?cancelled=1',
        'URL_Notify'               => $site . '/api/mypos-notify.php',
        'CardTokenRequest'         => '0',
        'KeyIndex'                 => (string) $c['mypos_key_index'],
        'PaymentParametersRequired' => '1',
        'CustomerEmail'            => $record['email'],
        'CustomerFirstNames'       => $first,
        'CustomerFamilyName'       => $last !== '' ? $last : $first,
        'CartItems'                => '1',
        'Article_1'                => $c['audit_name'],
        'Quantity_1'               => '1',
        'Price_1'                  => $amount,
        'Amount_1'                 => $amount,
        'Currency_1'               => $record['currency'],
    ];
    $fields['Signature'] = mypos_sign($fields);
    return $fields;
}

/* ---------- Fulfilment: runs once per paid order ---------- */

/**
 * Marks the order paid and runs the automations exactly once, even if the
 * webhook and the thank-you page both confirm the payment at the same time.
 */
function fulfil_paid_order(string $ref, array $payment): array
{
    $lock = fopen(record_path($ref) . '.lock', 'c');
    flock($lock, LOCK_EX);
    try {
        $record = load_record($ref);
        if ($record === null) {
            throw new RuntimeException("No local record for $ref");
        }
        if (($record['status'] ?? '') === 'paid') {
            return $record;
        }
        $c = nwc_config();
        $amount = (int) ($payment['amount'] ?? $record['amount']);
        $currency = strtoupper((string) ($payment['currency'] ?? $record['currency']));
        if ($amount !== (int) $record['amount'] || $currency !== $record['currency']) {
            throw new RuntimeException("Amount mismatch for $ref: got $amount $currency");
        }

        $record['status'] = 'paid';
        $record['paid_at'] = gmdate('c');
        $record['mypos_trnref'] = (string) ($payment['transaction_id'] ?? '');
        save_record($record);

        // Each step is independent: one failing never blocks the others, and
        // the team email reports how every step went.
        $steps = [
            'xero'    => fn () => xero_enabled() ? xero_record_sale($record) : 'not configured',
            'hubspot' => fn () => $c['hubspot_token'] !== '' ? hubspot_record_sale($record) : 'not configured',
            'webhook' => fn () => $c['automation_webhook_url'] !== '' ? post_automation_event($record) : 'not configured',
            'client_email' => fn () => send_client_confirmation($record),
        ];
        $record['automation'] = [];
        foreach ($steps as $name => $step) {
            try {
                $record['automation'][$name] = $step();
            } catch (Throwable $e) {
                error_log("NWC $name failed for $ref: " . $e->getMessage());
                $record['automation'][$name] = 'failed: ' . mb_substr($e->getMessage(), 0, 300);
            }
        }
        $record['automation']['team_email'] = send_team_notification($record);
        save_record($record);
        return $record;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function send_mail(string $to, string $subject, string $body, ?string $replyTo = null): bool
{
    $c = nwc_config();
    $headers = [
        'From'         => sprintf('%s <%s>', $c['from_name'], $c['from_email']),
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
    ];
    if ($replyTo !== null) {
        $headers['Reply-To'] = $replyTo;
    }
    return mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers, '-f' . $c['from_email']);
}

function send_client_confirmation(array $r): string
{
    $c = nwc_config();
    $amount = format_amount((int) $r['amount'], $r['currency']);
    $firstName = explode(' ', $r['name'])[0];
    $body = "Hi $firstName,\n\n"
          . "Thanks for booking your systems audit with Northwest Complete. "
          . "We've received your payment of $amount.\n\n"
          . "Reference: {$r['ref']}\n\n"
          . "What happens next:\n"
          . ($c['booking_url'] !== ''
                ? "1. Choose a time for your audit here: {$c['booking_url']}\n"
                : "1. We'll contact you within one working day to schedule the audit.\n")
          . "2. We review your software, integrations, hardware, security and costs.\n"
          . "3. We walk you through the findings and a prioritised plan with costs.\n\n"
          . "If you have any questions, just reply to this email.\n\n"
          . "Northwest Complete\n{$c['site_url']}\n";
    return send_mail($r['email'], "Your systems audit is booked ({$r['ref']})", $body, $c['notify_email']) ? 'sent' : 'failed';
}

function send_team_notification(array $r): string
{
    $c = nwc_config();
    $amount = format_amount((int) $r['amount'], $r['currency']);
    $body = "New paid systems audit\n\n"
          . "Reference: {$r['ref']}\n"
          . "Amount:    $amount (myPOS transaction {$r['mypos_trnref']})\n"
          . "Paid:      {$r['paid_at']}\n\n"
          . "Name:      {$r['name']}\n"
          . "Business:  " . ($r['business'] ?: '-') . "\n"
          . "Email:     {$r['email']}\n"
          . "Phone:     " . ($r['phone'] ?: '-') . "\n"
          . "Source:    " . (($r['source'] ?? '') !== '' ? $r['source'] : 'direct / unknown') . "\n\n"
          . "Notes:\n" . ($r['notes'] ?: '-') . "\n\n"
          . "Automation:\n" . implode('', array_map(
                fn ($k, $v) => sprintf("  %-13s %s\n", $k . ':', is_array($v) ? json_encode($v) : $v),
                array_keys($r['automation'] ?? []), $r['automation'] ?? []
            ));
    $replyTo = sprintf('"%s" <%s>', str_replace(['"', '\\', '<', '>'], '', $r['name']), $r['email']);
    return send_mail($c['notify_email'], "Paid audit: {$r['name']}" . ($r['business'] ? " - {$r['business']}" : ''), $body, $replyTo) ? 'sent' : 'failed';
}

/**
 * Sends the paid order to your automation platform (e.g. an n8n Webhook node),
 * which can then create the Xero invoice and payment, the HubSpot deal, the
 * booking email, and so on. Signed so the receiver can check it came from us.
 */
function post_automation_event(array $r): string
{
    $c = nwc_config();
    $payload = json_encode([
        'event'            => 'audit.paid',
        'reference'        => $r['ref'],
        'product'          => $c['audit_name'],
        'amount'           => (int) $r['amount'],
        'amount_formatted' => format_amount((int) $r['amount'], $r['currency']),
        'currency'         => $r['currency'],
        'paid_at'          => $r['paid_at'],
        'payment_provider' => 'myPOS',
        'transaction_id'   => $r['mypos_trnref'],
        'customer'         => [
            'name'     => $r['name'],
            'email'    => $r['email'],
            'business' => $r['business'],
            'phone'    => $r['phone'],
            'notes'    => $r['notes'],
            'source'   => $r['source'] ?? '',
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $timestamp = (string) time();
    $headers = ['Content-Type: application/json', 'X-NWC-Timestamp: ' . $timestamp];
    if ($c['automation_webhook_secret'] !== '') {
        $headers[] = 'X-NWC-Signature: sha256=' . hash_hmac('sha256', $timestamp . '.' . $payload, $c['automation_webhook_secret']);
    }
    $ch = curl_init($c['automation_webhook_url']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($status < 200 || $status >= 300) {
        error_log("NWC automation webhook failed for {$r['ref']}: HTTP $status");
        return "failed (HTTP $status)";
    }
    return 'sent';
}

/* ---------- HTTP helper for Xero and HubSpot ---------- */

function http_json(string $method, string $url, array $headers, $body = null, bool $form = false): array
{
    $ch = curl_init($url);
    $h = array_merge(['Accept: application/json'], $headers);
    if ($body !== null) {
        $h[] = $form ? 'Content-Type: application/x-www-form-urlencoded' : 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, $form ? http_build_query($body) : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $h,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        throw new RuntimeException("$method $url failed: $error");
    }
    $data = $raw === '' ? [] : json_decode((string) $raw, true);
    return ['status' => $status, 'data' => is_array($data) ? $data : [], 'raw' => (string) $raw];
}

function http_ok(array $res, string $what): array
{
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException("$what returned HTTP {$res['status']}: " . mb_substr($res['raw'], 0, 400));
    }
    return $res['data'];
}

/* ---------- Xero: invoice + payment ---------- */

const XERO_API = 'https://api.xero.com';
const XERO_IDENTITY = 'https://identity.xero.com';

function xero_enabled(): bool
{
    $c = nwc_config();
    return $c['xero_client_id'] !== '' && $c['xero_client_secret'] !== '' && is_readable(xero_token_path());
}

function xero_token_path(): string
{
    $dir = nwc_config()['data_dir'];
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    return $dir . '/xero-tokens.json';
}

function xero_base(string $kind): string
{
    $override = getenv('NWC_XERO_BASE');
    return $override ?: ($kind === 'identity' ? XERO_IDENTITY : XERO_API);
}

/** Exchanges an authorisation code or refresh token for new tokens. */
function xero_token_request(array $params): array
{
    $c = nwc_config();
    $res = http_json('POST', xero_base('identity') . '/connect/token', [
        'Authorization: Basic ' . base64_encode($c['xero_client_id'] . ':' . $c['xero_client_secret']),
    ], $params, true);
    return http_ok($res, 'Xero token');
}

function xero_save_tokens(array $tokens, ?string $tenantId = null): void
{
    $existing = is_readable(xero_token_path()) ? (json_decode((string) file_get_contents(xero_token_path()), true) ?: []) : [];
    $data = [
        'access_token'  => $tokens['access_token'],
        'refresh_token' => $tokens['refresh_token'],
        'expires_at'    => time() + (int) ($tokens['expires_in'] ?? 1800) - 60,
        'tenant_id'     => $tenantId ?? ($existing['tenant_id'] ?? ''),
    ];
    file_put_contents(xero_token_path(), json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
    @chmod(xero_token_path(), 0600);
}

/** Returns [access token, tenant id], refreshing the token when needed. */
function xero_session(): array
{
    $lock = fopen(xero_token_path() . '.lock', 'c');
    flock($lock, LOCK_EX); // Xero refresh tokens are single-use, so refresh one at a time.
    try {
        $t = json_decode((string) file_get_contents(xero_token_path()), true);
        if (!is_array($t) || empty($t['refresh_token'])) {
            throw new RuntimeException('Xero is not connected. Open /api/xero-connect.php?key=... to connect.');
        }
        if (time() >= (int) $t['expires_at']) {
            xero_save_tokens(xero_token_request(['grant_type' => 'refresh_token', 'refresh_token' => $t['refresh_token']]));
            $t = json_decode((string) file_get_contents(xero_token_path()), true);
        }
        return [$t['access_token'], $t['tenant_id']];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function xero_call(string $method, string $path, $body = null): array
{
    [$token, $tenant] = xero_session();
    $res = http_json($method, xero_base('api') . '/api.xro/2.0' . $path, [
        'Authorization: Bearer ' . $token,
        'xero-tenant-id: ' . $tenant,
    ], $body);
    return http_ok($res, "Xero $method $path");
}

/**
 * Creates an approved sales invoice for the audit and records the myPOS
 * payment against it, so Xero shows it as paid and it reconciles against your
 * bank feed when myPOS pays out.
 */
function xero_record_sale(array $r): array
{
    $c = nwc_config();
    $date = substr($r['paid_at'], 0, 10);
    $line = [
        'Description' => $c['audit_name'] . ' (' . $r['ref'] . ')',
        'Quantity'    => 1,
        'UnitAmount'  => round($r['amount'] / 100, 2),
        'AccountCode' => $c['xero_sales_account_code'],
    ];
    if ($c['xero_tax_type'] !== '') {
        $line['TaxType'] = $c['xero_tax_type'];
    }
    $contact = ['Name' => $r['business'] !== '' ? $r['business'] : $r['name'], 'EmailAddress' => $r['email']];
    if ($r['business'] !== '') {
        [$first, $last] = array_pad(explode(' ', $r['name'], 2), 2, '');
        $contact['FirstName'] = $first;
        $contact['LastName'] = $last;
    }
    $invoices = xero_call('POST', '/Invoices', ['Invoices' => [[
        'Type'            => 'ACCREC',
        'Contact'         => $contact,
        'Date'            => $date,
        'DueDate'         => $date,
        'Reference'       => $r['ref'],
        'CurrencyCode'    => $r['currency'],
        'Status'          => 'AUTHORISED',
        'LineAmountTypes' => $c['xero_line_amount_types'],
        'LineItems'       => [$line],
    ]]]);
    $invoice = $invoices['Invoices'][0] ?? null;
    if (!$invoice || empty($invoice['InvoiceID'])) {
        throw new RuntimeException('Xero did not return an invoice');
    }
    $result = ['invoice' => $invoice['InvoiceNumber'] ?? $invoice['InvoiceID']];

    if ($c['xero_payment_account_code'] !== '') {
        xero_call('PUT', '/Payments', ['Payments' => [[
            'Invoice'   => ['InvoiceID' => $invoice['InvoiceID']],
            'Account'   => ['Code' => $c['xero_payment_account_code']],
            'Date'      => $date,
            'Amount'    => (float) ($invoice['AmountDue'] ?? $invoice['Total'] ?? $line['UnitAmount']),
            'Reference' => 'myPOS ' . $r['mypos_trnref'],
        ]]]);
        $result['payment'] = 'recorded';
    }
    if ($c['xero_email_invoice']) {
        xero_call('POST', '/Invoices/' . $invoice['InvoiceID'] . '/Email', new stdClass());
        $result['emailed'] = true;
    }
    return $result;
}

/* ---------- HubSpot: contact + won deal ---------- */

function hubspot_call(string $method, string $path, ?array $body = null): array
{
    $base = getenv('NWC_HUBSPOT_BASE') ?: 'https://api.hubapi.com';
    return http_json($method, $base . $path, ['Authorization: Bearer ' . nwc_config()['hubspot_token']], $body);
}

function hubspot_record_sale(array $r): array
{
    $c = nwc_config();
    [$first, $last] = array_pad(explode(' ', $r['name'], 2), 2, '');
    $props = array_filter([
        'email'     => $r['email'],
        'firstname' => $first,
        'lastname'  => $last,
        'company'   => $r['business'],
        'phone'     => $r['phone'],
    ], fn ($v) => $v !== '');

    // Update the contact if the email already exists, otherwise create it.
    $res = hubspot_call('PATCH', '/crm/v3/objects/contacts/' . rawurlencode($r['email']) . '?idProperty=email', ['properties' => $props]);
    if ($res['status'] === 404) {
        $res = hubspot_call('POST', '/crm/v3/objects/contacts', ['properties' => $props]);
    }
    $contactId = http_ok($res, 'HubSpot contact')['id'] ?? null;

    $deal = http_ok(hubspot_call('POST', '/crm/v3/objects/deals', [
        'properties' => [
            'dealname'  => $c['audit_name'] . ' - ' . ($r['business'] !== '' ? $r['business'] : $r['name']),
            'amount'    => (string) round($r['amount'] / 100, 2),
            'pipeline'  => $c['hubspot_pipeline'],
            'dealstage' => $c['hubspot_dealstage'],
            'closedate' => $r['paid_at'],
            'description' => "Paid via myPOS. Reference {$r['ref']}.\n\n" . $r['notes'],
        ],
        'associations' => $contactId ? [[
            'to'    => ['id' => $contactId],
            'types' => [['associationCategory' => 'HUBSPOT_DEFINED', 'associationTypeId' => 3]],
        ]] : [],
    ]), 'HubSpot deal');
    return ['contact' => $contactId, 'deal' => $deal['id'] ?? null];
}

/** Creates or updates a HubSpot contact for a website enquiry. */
function hubspot_record_lead(string $name, string $email, string $business, string $service, string $message): array
{
    [$first, $last] = array_pad(explode(' ', $name, 2), 2, '');
    $props = array_filter([
        'email'     => $email,
        'firstname' => $first,
        'lastname'  => $last,
        'company'   => $business,
        'message'   => mb_substr(($service !== '' ? "[$service] " : '') . $message, 0, 5000),
    ], fn ($v) => $v !== '');
    $res = hubspot_call('PATCH', '/crm/v3/objects/contacts/' . rawurlencode($email) . '?idProperty=email', ['properties' => $props]);
    if ($res['status'] === 404) {
        $res = hubspot_call('POST', '/crm/v3/objects/contacts', ['properties' => $props]);
    }
    return ['contact' => http_ok($res, 'HubSpot contact')['id'] ?? null];
}
