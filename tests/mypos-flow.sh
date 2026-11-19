#!/usr/bin/env bash
# End-to-end check of the myPOS checkout, with throwaway keys and a local PHP server.
# Verifies: signed checkout form, notification signature checks, amount checks,
# fulfilment running exactly once, and the status endpoint. No network needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'kill $SRV 2>/dev/null || true; rm -rf "$T"' EXIT
PORT=${PORT:-8765}; BASE="http://127.0.0.1:$PORT"
fail() { echo "FAIL: $*" >&2; exit 1; }

# Two key pairs: "merchant" (we sign checkout) and "mypos" (they sign notifications).
for k in merchant mypos; do
  openssl genrsa -out "$T/$k.key" 2048 2>/dev/null
  openssl rsa -in "$T/$k.key" -pubout -out "$T/$k.pub" 2>/dev/null
  openssl req -new -x509 -key "$T/$k.key" -subj "/CN=$k" -days 2 -out "$T/$k.crt"
done
cat > "$T/config.php" <<PHP
<?php return [
  'mypos_sid' => '000000000000010', 'mypos_wallet' => '61938166610', 'mypos_key_index' => 1,
  'mypos_private_key' => '$T/merchant.key', 'mypos_public_cert' => '$T/mypos.crt',
  'site_url' => 'https://northwestcomplete.com', 'data_dir' => '$T/data',
  'notify_email' => 'team@example.test', 'from_email' => 'hello@example.test',
];
PHP
cat > "$T/sendmail" <<SH
#!/bin/sh
cat >> "$T/mail.log"; echo "-----" >> "$T/mail.log"
SH
chmod +x "$T/sendmail"

NWC_CONFIG="$T/config.php" php -d "sendmail_path=$T/sendmail -t" -S "127.0.0.1:$PORT" -t "$ROOT" >"$T/server.log" 2>&1 & SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/order-status.php" && break; sleep 0.2; done

# 1. Start checkout.
R=$(curl -s -H 'X-Requested-With: fetch' --data-urlencode 'name=Pat Murphy' --data-urlencode 'business=Murphy Hotels' \
  --data-urlencode 'email=pat@example.com' --data-urlencode 'agree=1' "$BASE/api/checkout.php")
echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); exit($d["ok"]??false?0:1);' || fail "checkout: $R"
REF=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["reference"];')
echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach($d["fields"] as $k=>$v){ if($k!=="Signature") echo $v,"\n"; }' > "$T/values.txt"
SIG=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["fields"]["Signature"];')
ACTION=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["action"];')
[ "$ACTION" = "https://www.mypos.com/vmp/checkout-test" ] || fail "unexpected action $ACTION"
echo "$R" | grep -q '"Amount":"500.00"' || fail "amount not 500.00"

# 2. Independently check the checkout signature with the openssl CLI.
paste -sd- "$T/values.txt" | tr -d '\n' | base64 -w0 > "$T/payload.txt"
echo "$SIG" | base64 -d > "$T/sig.bin"
openssl dgst -sha256 -verify "$T/merchant.pub" -signature "$T/sig.bin" "$T/payload.txt" >/dev/null || fail "checkout signature invalid"
echo "ok  checkout form signed correctly ($REF)"

# 3. Notifications. Sign with the myPOS key the same way myPOS does.
notify() { # amount signature_mode
  local amount=$1 mode=${2:-good}
  local vals="IPCPurchaseNotify-000000000000010-$amount-EUR-$REF-IPC_TRN_123-STAN1-2026-11-19 10:00:00"
  printf '%s' "$vals" | base64 -w0 > "$T/np.txt"
  openssl dgst -sha256 -sign "$T/mypos.key" -out "$T/np.sig" "$T/np.txt"
  local sig; sig=$(base64 -w0 < "$T/np.sig")
  [ "$mode" = bad ] && sig=$(printf 'AAAA%s' "${sig:4}")
  curl -s -o "$T/n.out" -w '%{http_code}' --data-urlencode 'IPCmethod=IPCPurchaseNotify' --data-urlencode 'SID=000000000000010' \
    --data-urlencode "Amount=$amount" --data-urlencode 'Currency=EUR' --data-urlencode "OrderID=$REF" \
    --data-urlencode 'IPC_Trnref=IPC_TRN_123' --data-urlencode 'RequestSTAN=STAN1' --data-urlencode 'RequestDateTime=2026-11-19 10:00:00' \
    --data-urlencode "Signature=$sig" "$BASE/api/mypos-notify.php"
}
[ "$(notify 500.00 bad)" = 401 ] || fail "forged notification was not rejected"
echo "ok  forged notification rejected"
S=$(curl -s "$BASE/api/order-status.php?ref=$REF"); echo "$S" | grep -q '"pending"' || fail "should still be pending: $S"
[ "$(notify 1.00)" = 200 ] || fail "wrong-amount notification"
S=$(curl -s "$BASE/api/order-status.php?ref=$REF"); echo "$S" | grep -q '"pending"' || fail "wrong amount must not mark paid: $S"
echo "ok  wrong amount not accepted"
[ "$(notify 500.00)" = 200 ] && grep -qx OK "$T/n.out" || fail "valid notification not acknowledged"
S=$(curl -s "$BASE/api/order-status.php?ref=$REF"); echo "$S" | grep -q '"paid"' || fail "should be paid: $S"
[ "$(notify 500.00)" = 200 ] || fail "repeat notification"
CLIENT=$(grep -c "^To: pat@example.com" "$T/mail.log" || true)
[ "$CLIENT" = 1 ] || fail "client email sent $CLIENT times (expected once)"
grep -q 'myPOS transaction IPC_TRN_123' "$T/mail.log" || fail "team email missing transaction"
echo "ok  paid once, repeat notification harmless, emails sent once"
echo "ALL PASSED"
