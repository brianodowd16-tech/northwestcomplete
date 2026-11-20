<?php
/**
 * myPOS Checkout: the same money flow as Stripe (deposit now, balance later, damage hold),
 * built on myPOS's signed IPC API (version 1.4).
 *
 *   1. Deposit: hosted myPOS page (IPCPurchase) that also stores the card (CardTokenRequest=2).
 *      myPOS tells us the result server-to-server (IPCPurchaseNotify); we answer "OK".
 *   2. Balance: charged to the stored card (IPCIAPurchase with CardToken) when myPOS has
 *      switched on token payments for the account. Otherwise, or if the card is declined,
 *      the guest is emailed a link to a hosted myPOS page for the balance.
 *   3. Damage hold: pre-authorisation on the stored card (IPCIAPreAuthorization), or a hosted
 *      IPCPreAuthorization page via an emailed link. Released with IPCPreAuthCancellation,
 *      captured with IPCPreAuthCompletion.
 *
 * Credentials: the "configuration pack" from the myPOS account (Online → Online stores →
 * your store → Keys / Configuration pack). Put it in wp-config.php as GWH_MYPOS_CONFIG_PACK,
 * or paste it in Bookings → Settings. It holds the store ID, wallet, key index, your private
 * key and myPOS's public certificate.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GWH_MYPOS_VERSION = '1.4';

/* ---------- Configuration ---------- */

function gwh_mypos_pack() {
	return defined( 'GWH_MYPOS_CONFIG_PACK' ) ? (string) GWH_MYPOS_CONFIG_PACK : (string) gwh_bset( 'mypos_config_pack' );
}

/**
 * Decode a configuration pack.
 *
 * @return array|null sid, cn (wallet), idx (key index), pk (private key PEM), pc (myPOS cert PEM), appid, pid.
 */
function gwh_mypos_parse_pack( $pack ) {
	$json = base64_decode( trim( (string) $pack ), true );
	$data = $json ? json_decode( $json, true ) : null;
	if ( ! is_array( $data ) || empty( $data['sid'] ) || empty( $data['cn'] ) || empty( $data['pk'] ) || empty( $data['pc'] ) || ! isset( $data['idx'] ) ) {
		return null;
	}
	if ( ! function_exists( 'openssl_sign' ) || ! openssl_pkey_get_private( $data['pk'] ) || ! openssl_pkey_get_public( $data['pc'] ) ) {
		return null;
	}
	return array(
		'sid'   => (string) $data['sid'],
		'cn'    => (string) $data['cn'],
		'idx'   => (string) $data['idx'],
		'pk'    => (string) $data['pk'],
		'pc'    => (string) $data['pc'],
		'appid' => isset( $data['appid'] ) ? (string) $data['appid'] : '',
		'pid'   => isset( $data['pid'] ) ? (string) $data['pid'] : '',
	);
}

function gwh_mypos_config() {
	static $cache = array();
	$pack = gwh_mypos_pack();
	if ( ! array_key_exists( $pack, $cache ) ) {
		$cache[ $pack ] = '' === $pack ? null : gwh_mypos_parse_pack( $pack );
	}
	return $cache[ $pack ];
}

function gwh_mypos_ready() {
	return null !== gwh_mypos_config();
}

function gwh_mypos_test_mode() {
	return '1' === (string) gwh_bset( 'mypos_test' );
}

/** Whether myPOS has enabled charging stored cards without the guest (needed for full automation). */
function gwh_mypos_token_charges() {
	return '1' === (string) gwh_bset( 'mypos_token_charges' );
}

function gwh_mypos_url() {
	$url = gwh_mypos_test_mode() ? 'https://www.mypos.com/vmp/checkout-test' : 'https://www.mypos.com/vmp/checkout';
	return apply_filters( 'gwh_mypos_url', $url );
}

function gwh_mypos_notify_url() {
	return add_query_arg( 'gwh_mypos', 'notify', home_url( '/' ) );
}

/* ---------- Signing ---------- */

function gwh_mypos_amount( $euros ) {
	return number_format( (float) $euros, 2, '.', '' );
}

/** myPOS signs base64(values joined with "-") with SHA-256 RSA. */
function gwh_mypos_sign( array $params, array $cfg ) {
	$data = base64_encode( implode( '-', array_values( $params ) ) );
	$sig  = '';
	openssl_sign( $data, $sig, $cfg['pk'], OPENSSL_ALGO_SHA256 );
	return base64_encode( $sig );
}

function gwh_mypos_flatten( $values ) {
	$out = array();
	foreach ( $values as $v ) {
		if ( is_array( $v ) ) {
			$out = array_merge( $out, gwh_mypos_flatten( $v ) );
		} else {
			$out[] = (string) $v;
		}
	}
	return $out;
}

/**
 * Check myPOS's signature on data it sent us (a notify POST or an API reply), in the order received.
 */
function gwh_mypos_verify( array $data, array $cfg ) {
	$signature = '';
	foreach ( $data as $k => $v ) {
		if ( 'signature' === strtolower( (string) $k ) ) {
			$signature = (string) $v;
			unset( $data[ $k ] );
		}
	}
	if ( '' === $signature ) {
		return false;
	}
	$signed = base64_encode( implode( '-', gwh_mypos_flatten( $data ) ) );
	return 1 === openssl_verify( $signed, base64_decode( $signature ), $cfg['pc'], OPENSSL_ALGO_SHA256 );
}

function gwh_mypos_base( $method, array $cfg ) {
	return array(
		'IPCmethod'    => $method,
		'IPCVersion'   => GWH_MYPOS_VERSION,
		'IPCLanguage'  => 'EN',
		'SID'          => $cfg['sid'],
		'WalletNumber' => $cfg['cn'],
		'KeyIndex'     => $cfg['idx'],
		'Source'       => 'gasworks-house',
	);
}

function gwh_mypos_partner( array $params, array $cfg ) {
	if ( $cfg['appid'] && $cfg['pid'] ) {
		$params['ApplicationID'] = $cfg['appid'];
		$params['PartnerID']     = $cfg['pid'];
	}
	return $params;
}

/** Plain ASCII-ish text for item names and notes (signatures are byte-exact, keep them simple). */
function gwh_mypos_text( $text, $max = 100 ) {
	$text = str_replace( array( '&', '–', '—', '→', '·' ), array( 'and', '-', '-', 'to', '|' ), wp_strip_all_tags( (string) $text ) );
	$text = preg_replace( '/[^\p{L}\p{N} \-\.,:|#\'\/()%]+/u', '', $text );
	return mb_substr( trim( preg_replace( '/\s+/', ' ', $text ) ), 0, $max );
}

/* ---------- Orders ---------- */

/**
 * Every myPOS payment gets its own OrderID, recorded on the booking with its purpose and amount
 * so the notify can be checked against what we asked for.
 */
function gwh_mypos_new_order( $b, $purpose, $amount ) {
	$codes  = array( 'booking' => 'D', 'balance' => 'B', 'hold' => 'H' );
	$oid    = 'GWH' . $b['id'] . ( isset( $codes[ $purpose ] ) ? $codes[ $purpose ] : 'X' ) . strtoupper( wp_generate_password( 8, false ) );
	$orders = gwh_mypos_orders( $b['id'] );

	$orders[ $oid ] = array( 'purpose' => $purpose, 'amount' => gwh_mypos_amount( $amount ), 'state' => 'open', 'created' => time() );
	update_post_meta( $b['id'], '_gwh_mypos_orders', $orders );
	add_post_meta( $b['id'], '_gwh_mypos_order', $oid );
	return $oid;
}

function gwh_mypos_orders( $id ) {
	$orders = get_post_meta( $id, '_gwh_mypos_orders', true );
	return is_array( $orders ) ? $orders : array();
}

function gwh_mypos_set_order( $id, $oid, $fields ) {
	$orders = gwh_mypos_orders( $id );
	if ( isset( $orders[ $oid ] ) ) {
		$orders[ $oid ] = array_merge( $orders[ $oid ], $fields );
		update_post_meta( $id, '_gwh_mypos_orders', $orders );
	}
}

/* ---------- Hosted payment page ---------- */

/**
 * Signed fields for a hosted myPOS page.
 *
 * @return array|WP_Error
 */
function gwh_mypos_hosted_params( $b, $amount, $purpose, $label ) {
	$cfg = gwh_mypos_config();
	if ( ! $cfg ) {
		return new WP_Error( 'mypos_config', 'myPOS is not configured' );
	}
	$oid  = gwh_mypos_new_order( $b, $purpose, $amount );
	$back = 'booking' === $purpose && $b['session']
		? array( 'booking' => 'success', 'session_id' => $b['session'] )
		: array( 'booking' => 'paid' );
	$ok     = add_query_arg( $back, home_url( '/' ) );
	$cancel = add_query_arg( 'booking' === $purpose && $b['session'] ? array( 'booking' => 'cancelled', 'session_id' => $b['session'] ) : array( 'booking' => 'pay-cancelled' ), home_url( '/' ) );
	$label  = gwh_mypos_text( $label );
	$note   = gwh_mypos_text( 'Booking #' . $b['id'] . ' | ' . $b['arrival'] . ' to ' . $b['departure'] . ' | ' . $b['guests'] . ' guests', 250 );

	if ( 'hold' === $purpose ) {
		$p = gwh_mypos_base( 'IPCPreAuthorization', $cfg ) + array(
			'ItemName'   => $label,
			'Currency'   => 'EUR',
			'Amount'     => gwh_mypos_amount( $amount ),
			'OrderID'    => $oid,
			'URL_OK'     => $ok,
			'URL_Cancel' => $cancel,
			'URL_Notify' => gwh_mypos_notify_url(),
			'Note'       => $note,
		);
		$p = gwh_mypos_partner( $p, $cfg );
	} else {
		$names = preg_split( '/\s+/', trim( (string) $b['name'] ), 2 );
		$p     = gwh_mypos_base( 'IPCPurchase', $cfg ) + array(
			'Currency'   => 'EUR',
			'Amount'     => gwh_mypos_amount( $amount ),
			'OrderID'    => $oid,
			'URL_OK'     => $ok,
			'URL_Cancel' => $cancel,
			'URL_Notify' => gwh_mypos_notify_url(),
			'Note'       => $note,
		);
		$p = gwh_mypos_partner( $p, $cfg ) + array(
			'customeremail'      => (string) $b['email'],
			'customerphone'      => preg_replace( '/[^\d+]/', '', (string) $b['phone'] ),
			'customerfirstnames' => gwh_mypos_text( $names[0], 50 ),
			'customerfamilyname' => gwh_mypos_text( isset( $names[1] ) ? $names[1] : $names[0], 50 ),
			'customercountry'    => 'IRL',
			'CartItems'          => '1',
			'Article_1'          => $label,
			'Quantity_1'         => '1',
			'Price_1'            => gwh_mypos_amount( $amount ),
			'Amount_1'           => gwh_mypos_amount( $amount ),
			'Currency_1'         => 'EUR',
			// Store the card on the first payment so the balance and the hold can use it.
			'CardTokenRequest'          => 'booking' === $purpose ? '2' : '0',
			'PaymentParametersRequired' => '1',
			'PaymentMethod'             => '1',
		);
	}
	$p['Signature'] = gwh_mypos_sign( $p, $cfg );
	return $p;
}

/**
 * Output a page that posts the signed fields to myPOS. Values are posted exactly as signed.
 */
function gwh_mypos_render_redirect( array $params ) {
	nocache_headers();
	header( 'Content-Type: text/html; charset=utf-8' );
	header( 'Referrer-Policy: no-referrer' );
	$h = function ( $s ) {
		return htmlspecialchars( (string) $s, ENT_QUOTES, 'UTF-8' );
	};
	echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">';
	echo '<title>' . $h( __( 'Opening secure payment…', 'gasworks-house' ) ) . '</title>';
	echo '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14110f;color:#f6efe6;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:16px}button{margin-top:16px;padding:12px 22px;border:0;border-radius:999px;background:linear-gradient(90deg,#ff6a2b,#e0245e);color:#fff;font-weight:700;font-size:16px;cursor:pointer}.s{width:34px;height:34px;margin:0 auto 18px;border:3px solid #ffffff33;border-top-color:#ff6a2b;border-radius:50%;animation:r 1s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body><div>';
	echo '<div class="s" aria-hidden="true"></div><p>' . $h( __( 'Taking you to our secure myPOS payment page…', 'gasworks-house' ) ) . '</p>';
	echo '<form id="gwh-mypos" action="' . $h( gwh_mypos_url() ) . '" method="post">';
	foreach ( $params as $k => $v ) {
		echo '<input type="hidden" name="' . $h( $k ) . '" value="' . $h( $v ) . '">';
	}
	echo '<noscript><button type="submit">' . $h( __( 'Continue to payment', 'gasworks-house' ) ) . '</button></noscript></form>';
	echo '<script>document.getElementById("gwh-mypos").submit();</script></div></body></html>';
	exit;
}

/* ---------- Server-to-server calls ---------- */

/**
 * Signed API call. Replies are XML so every value is checked exactly as myPOS signed it.
 *
 * @return array|WP_Error Reply fields.
 */
function gwh_mypos_call( array $params ) {
	$cfg = gwh_mypos_config();
	if ( ! $cfg ) {
		return new WP_Error( 'mypos_config', 'myPOS is not configured' );
	}
	$params['OutputFormat'] = 'xml';
	$params['Signature']    = gwh_mypos_sign( $params, $cfg );

	$res = wp_remote_post( gwh_mypos_url(), array( 'body' => $params, 'timeout' => 30 ) );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$data = gwh_mypos_parse_xml( wp_remote_retrieve_body( $res ) );
	if ( ! $data ) {
		return new WP_Error( 'mypos_reply', 'myPOS sent an unreadable reply (HTTP ' . wp_remote_retrieve_response_code( $res ) . ')' );
	}
	$has_sig = false;
	foreach ( array_keys( $data ) as $k ) {
		$has_sig = $has_sig || 'signature' === strtolower( $k );
	}
	if ( $has_sig && ! gwh_mypos_verify( $data, $cfg ) ) {
		return new WP_Error( 'mypos_signature', 'myPOS reply failed the signature check' );
	}
	$status = isset( $data['Status'] ) ? (string) $data['Status'] : '';
	if ( '0' !== $status ) {
		$msg = isset( $data['StatusMsg'] ) ? (string) $data['StatusMsg'] : 'Error';
		return new WP_Error( 'mypos_' . ( '' === $status ? 'error' : $status ), 'myPOS: ' . $msg . ( '' !== $status ? ' (status ' . $status . ')' : '' ) );
	}
	if ( ! $has_sig ) {
		return new WP_Error( 'mypos_signature', 'myPOS reply was not signed' );
	}
	return $data;
}

function gwh_mypos_parse_xml( $xml ) {
	if ( '' === trim( (string) $xml ) || ! function_exists( 'simplexml_load_string' ) ) {
		return null;
	}
	$prev = libxml_use_internal_errors( true );
	$doc  = simplexml_load_string( $xml, 'SimpleXMLElement', LIBXML_NONET );
	libxml_use_internal_errors( $prev );
	return false === $doc ? null : gwh_mypos_xml_array( $doc );
}

function gwh_mypos_xml_array( SimpleXMLElement $node ) {
	$out = array();
	foreach ( $node->children() as $name => $child ) {
		$value = $child->count() ? gwh_mypos_xml_array( $child ) : (string) $child;
		if ( array_key_exists( $name, $out ) ) {
			$out[ $name ] = is_array( $out[ $name ] ) && isset( $out[ $name ][0] ) ? array_merge( $out[ $name ], array( $value ) ) : array( $out[ $name ], $value );
		} else {
			$out[ $name ] = $value;
		}
	}
	return $out;
}

/**
 * Charge the stored card (balance) without the guest.
 *
 * @return true|WP_Error
 */
function gwh_mypos_charge_token( $b, $amount, $purpose ) {
	$cfg = gwh_mypos_config();
	if ( ! $cfg || ! gwh_mypos_token_charges() || ! $b['payment_method'] ) {
		return new WP_Error( 'needs_guest', 'Automatic card charges are off' );
	}
	$oid   = gwh_mypos_new_order( $b, $purpose, $amount );
	$label = gwh_mypos_text( 'Balance - Gasworks House booking #' . $b['id'] );
	$p     = gwh_mypos_base( 'IPCIAPurchase', $cfg ) + array(
		'OrderID'   => $oid,
		'Amount'    => gwh_mypos_amount( $amount ),
		'Currency'  => 'EUR',
		'CardToken' => $b['payment_method'],
		'Note'      => $label,
	);
	$p = gwh_mypos_partner( $p, $cfg ) + array(
		'CartItems'  => '1',
		'Article_1'  => $label,
		'Quantity_1' => '1',
		'Price_1'    => gwh_mypos_amount( $amount ),
		'Amount_1'   => gwh_mypos_amount( $amount ),
		'Currency_1' => 'EUR',
	);
	$res = gwh_mypos_call( $p );
	if ( is_wp_error( $res ) ) {
		gwh_mypos_set_order( $b['id'], $oid, array( 'state' => 'failed', 'error' => $res->get_error_message() ) );
		return $res;
	}
	gwh_mypos_set_order( $b['id'], $oid, array( 'state' => 'paid', 'trnref' => isset( $res['IPC_Trnref'] ) ? $res['IPC_Trnref'] : '' ) );
	return true;
}

/**
 * Pre-authorise the damage deposit on the stored card.
 *
 * @return string|WP_Error OrderID of the hold.
 */
function gwh_mypos_hold_token( $b, $amount ) {
	$cfg = gwh_mypos_config();
	if ( ! $cfg || ! gwh_mypos_token_charges() || ! $b['payment_method'] ) {
		return new WP_Error( 'needs_guest', 'Automatic card charges are off' );
	}
	$oid = gwh_mypos_new_order( $b, 'hold', $amount );
	$p   = gwh_mypos_base( 'IPCIAPreAuthorization', $cfg ) + array(
		'OrderID'   => $oid,
		'ItemName'  => gwh_mypos_text( 'Damage deposit hold - booking #' . $b['id'] ),
		'Amount'    => gwh_mypos_amount( $amount ),
		'Currency'  => 'EUR',
		'CardToken' => $b['payment_method'],
		'Note'      => gwh_mypos_text( 'Hold only, released after check-out' ),
	);
	$res = gwh_mypos_call( gwh_mypos_partner( $p, $cfg ) );
	if ( is_wp_error( $res ) ) {
		gwh_mypos_set_order( $b['id'], $oid, array( 'state' => 'failed', 'error' => $res->get_error_message() ) );
		return $res;
	}
	gwh_mypos_set_order( $b['id'], $oid, array( 'state' => 'held' ) );
	return $oid;
}

/** Amount pre-authorised for a booking's current hold. */
function gwh_mypos_hold_amount( $b ) {
	$orders = gwh_mypos_orders( $b['id'] );
	return isset( $orders[ $b['hold_pi'] ] ) ? $orders[ $b['hold_pi'] ]['amount'] : gwh_mypos_amount( gwh_pricing()['deposit'] );
}

/** Release (cancel) or capture (complete) a pre-authorisation. */
function gwh_mypos_finish_hold( $oid, $amount, $capture ) {
	$cfg = gwh_mypos_config();
	if ( ! $cfg ) {
		return new WP_Error( 'mypos_config', 'myPOS is not configured' );
	}
	$p = gwh_mypos_base( $capture ? 'IPCPreAuthCompletion' : 'IPCPreAuthCancellation', $cfg ) + array(
		'OrderID'  => $oid,
		'Amount'   => gwh_mypos_amount( $amount ),
		'Currency' => 'EUR',
	);
	return gwh_mypos_call( gwh_mypos_partner( $p, $cfg ) );
}

/* ---------- Notifications from myPOS ---------- */

/**
 * Handle a signed POST from myPOS.
 *
 * @return bool Whether to answer "OK". Answering anything else makes myPOS reverse the payment,
 *              which is what we want when the amount is wrong or the dates were taken meanwhile.
 */
function gwh_mypos_handle_notify( array $data ) {
	$cfg = gwh_mypos_config();
	if ( ! $cfg || ! gwh_mypos_verify( $data, $cfg ) ) {
		return false;
	}
	$method = isset( $data['IPCmethod'] ) ? (string) $data['IPCmethod'] : '';
	$oid    = isset( $data['OrderID'] ) ? (string) $data['OrderID'] : '';
	$b      = gwh_booking_by( 'mypos_order', $oid );
	if ( ! $b ) {
		return false;
	}
	$orders = gwh_mypos_orders( $b['id'] );
	$order  = isset( $orders[ $oid ] ) ? $orders[ $oid ] : null;
	if ( ! $order ) {
		return false;
	}
	$id = $b['id'];

	if ( 'IPCPurchaseRollback' === $method ) {
		// myPOS didn't get our OK in time and reversed the payment.
		if ( 'paid' === $order['state'] ) {
			gwh_mypos_set_order( $id, $oid, array( 'state' => 'rolled_back' ) );
			if ( 'booking' === $order['purpose'] ) {
				gwh_booking_meta( $id, array( 'status' => 'abandoned', 'paid' => 0, 'balance_status' => '' ) );
			} elseif ( 'balance' === $order['purpose'] ) {
				gwh_booking_meta( $id, array( 'balance_status' => 'failed', 'paid' => max( 0, round( (float) $b['paid'] - (float) $order['amount'], 2 ) ) ) );
			}
			wp_mail( gwh_owner_email(), 'myPOS reversed a payment: ' . get_post_field( 'post_title', $id ), "myPOS reversed payment {$oid} (" . gwh_money( $order['amount'] ) . ') because it could not reach the website in time. Please check the booking.' . "\n\n" . admin_url( 'post.php?action=edit&post=' . $id ) );
		}
		return true;
	}

	if ( ! in_array( $method, array( 'IPCPurchaseNotify', 'IPCPreAuthorizationNotify' ), true ) ) {
		return true; // Nothing for us to do; acknowledge so myPOS stops retrying.
	}
	if ( in_array( $order['state'], array( 'paid', 'held' ), true ) ) {
		return true; // Repeat notification.
	}
	$amount   = isset( $data['Amount'] ) ? gwh_mypos_amount( $data['Amount'] ) : '';
	$currency = isset( $data['Currency'] ) ? strtoupper( (string) $data['Currency'] ) : '';
	if ( $amount !== $order['amount'] || 'EUR' !== $currency ) {
		return false;
	}
	$trnref = isset( $data['IPC_Trnref'] ) ? (string) $data['IPC_Trnref'] : '';

	if ( 'IPCPreAuthorizationNotify' === $method ) {
		if ( 'hold' !== $order['purpose'] ) {
			return false;
		}
		gwh_mypos_set_order( $id, $oid, array( 'state' => 'held', 'trnref' => $trnref ) );
		gwh_booking_meta( $id, array( 'hold_status' => 'held', 'hold_pi' => $oid ) );
		return true;
	}

	if ( 'booking' === $order['purpose'] ) {
		if ( 'confirmed' === $b['status'] ) {
			return false; // Already paid through another order: reverse this one.
		}
		if ( ! in_array( $b['status'], array( 'checkout', 'abandoned' ), true ) || ! gwh_is_available( $b['arrival'], $b['departure'], $id ) ) {
			// The dates went (usually to Airbnb) while the guest was paying. Refuse, so myPOS reverses it.
			gwh_mypos_set_order( $id, $oid, array( 'state' => 'refused' ) );
			update_post_meta( $id, '_gwh_status', 'abandoned' );
			gwh_mail_guest( $b, 'Sorry, those dates were just taken', "Someone booked the same dates moments before your payment went through, so we couldn't confirm your stay and your payment has been reversed: you have not been charged.\n\nPlease have a look at other dates, or reply to this email and we'll help." );
			wp_mail( gwh_owner_email(), 'Payment refused (dates taken): ' . get_post_field( 'post_title', $id ), "A guest paid for dates that were no longer free. myPOS has been told to reverse it and the guest has been emailed.\n\n" . gwh_booking_summary( $b ) );
			return false;
		}
		gwh_mypos_set_order( $id, $oid, array( 'state' => 'paid', 'trnref' => $trnref ) );
		gwh_confirm_paid_booking( $id, (float) $order['amount'], array(
			'gateway'        => 'mypos',
			'payment_intent' => $trnref,
			'payment_method' => isset( $data['CardToken'] ) ? (string) $data['CardToken'] : '',
		) );
		return true;
	}

	if ( 'balance' === $order['purpose'] ) {
		gwh_mypos_set_order( $id, $oid, array( 'state' => 'paid', 'trnref' => $trnref ) );
		if ( 'paid' !== $b['balance_status'] ) {
			gwh_booking_meta( $id, array( 'balance_status' => 'paid', 'paid' => round( (float) $b['paid'] + (float) $order['amount'], 2 ) ) );
			gwh_mail_guest( gwh_booking( $id ), 'Balance paid', "Thanks, we've received your balance of " . gwh_money( $order['amount'] ) . ". You're all paid up." );
		}
		return true;
	}
	return false;
}

/**
 * Listener: ?gwh_mypos=notify (server-to-server), and the cancel return that frees the dates.
 */
function gwh_mypos_listener() {
	// phpcs:disable WordPress.Security.NonceVerification -- myPOS posts are authenticated by signature.
	if ( isset( $_GET['gwh_mypos'] ) && 'notify' === $_GET['gwh_mypos'] ) {
		$ok = 'POST' === ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '' ) && gwh_mypos_handle_notify( wp_unslash( $_POST ) );
		nocache_headers();
		status_header( 200 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		echo $ok ? 'OK' : 'NOK'; // phpcs:ignore WordPress.Security.EscapeOutput
		exit;
	}
	if ( isset( $_GET['booking'], $_GET['session_id'] ) && 'cancelled' === $_GET['booking'] && 'mypos' === gwh_gateway() ) {
		$b = gwh_booking_by( 'session', sanitize_text_field( wp_unslash( $_GET['session_id'] ) ) );
		if ( $b && 'checkout' === $b['status'] ) {
			update_post_meta( $b['id'], '_gwh_status', 'abandoned' );
		}
	}
	// phpcs:enable
}
add_action( 'init', 'gwh_mypos_listener', 1 );

/** LiteSpeed and other page caches must never answer for the notify URL. */
function gwh_mypos_nocache() {
	if ( isset( $_GET['gwh_mypos'] ) || isset( $_GET['gwh_pay'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		do_action( 'litespeed_control_set_nocache', 'gwh payment' );
	}
}
add_action( 'init', 'gwh_mypos_nocache', 0 );
