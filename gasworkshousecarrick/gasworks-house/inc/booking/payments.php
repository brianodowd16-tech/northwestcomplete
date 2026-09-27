<?php
/**
 * Stripe payments: Checkout for the deposit, automatic balance charge, and the damage-deposit hold.
 *
 * Money flow for a booking:
 *   1. Guest pays the deposit (or everything, if arrival is close) in Stripe Checkout. Their card
 *      is saved to a Stripe customer for later off-session charges.
 *   2. On the balance date the rest is charged to the saved card.
 *   3. The day before arrival a damage-deposit hold (manual-capture PaymentIntent) is placed.
 *      It's released two days after check-out unless the owner captures some or all of it.
 * Whenever the card needs the guest's approval (common for Irish cards under SCA), the guest is
 * emailed a link that opens a fresh Checkout page for that payment.
 *
 * Keys come from wp-config.php constants GWH_STRIPE_SECRET_KEY / GWH_STRIPE_WEBHOOK_SECRET
 * if defined, otherwise from Bookings → Settings.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Card holds generally lapse after 7 days, so keep the hold window short.
const GWH_HOLD_DAYS_BEFORE  = 1;
const GWH_RELEASE_DAYS_AFTER = 2;

function gwh_stripe_key() {
	return defined( 'GWH_STRIPE_SECRET_KEY' ) ? GWH_STRIPE_SECRET_KEY : (string) gwh_bset( 'stripe_secret_key' );
}

function gwh_stripe_webhook_secret() {
	return defined( 'GWH_STRIPE_WEBHOOK_SECRET' ) ? GWH_STRIPE_WEBHOOK_SECRET : (string) gwh_bset( 'stripe_webhook_secret' );
}

function gwh_payments_enabled() {
	return (bool) preg_match( '/^(sk|rk)_(test|live)_/', gwh_stripe_key() );
}

function gwh_stripe_test_mode() {
	return 0 === strpos( gwh_stripe_key(), 'sk_test_' ) || 0 === strpos( gwh_stripe_key(), 'rk_test_' );
}

function gwh_cents( $euros ) {
	return (int) round( (float) $euros * 100 );
}

/**
 * Call the Stripe API.
 *
 * @return array|WP_Error Decoded response, or an error carrying Stripe's code and decline_code.
 */
function gwh_stripe( $method, $path, $params = array(), $idempotency_key = '' ) {
	$base    = apply_filters( 'gwh_stripe_api_base', 'https://api.stripe.com/v1/' );
	$url     = $base . ltrim( $path, '/' );
	$headers = array(
		'Authorization'  => 'Bearer ' . gwh_stripe_key(),
		'Stripe-Version' => '2024-06-20',
	);
	if ( $idempotency_key ) {
		$headers['Idempotency-Key'] = $idempotency_key;
	}
	$args = array( 'method' => $method, 'headers' => $headers, 'timeout' => 30 );
	if ( 'GET' === $method ) {
		$url = $params ? $url . '?' . http_build_query( $params ) : $url;
	} else {
		$args['body'] = http_build_query( $params );
	}

	$res = wp_remote_request( $url, $args );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$body = json_decode( wp_remote_retrieve_body( $res ), true );
	$code = wp_remote_retrieve_response_code( $res );
	if ( $code >= 400 || ! is_array( $body ) ) {
		$err = isset( $body['error'] ) ? $body['error'] : array();
		return new WP_Error(
			isset( $err['code'] ) ? $err['code'] : 'stripe_error',
			isset( $err['message'] ) ? $err['message'] : 'Stripe error (HTTP ' . $code . ')',
			array(
				'status'         => $code,
				'decline_code'   => isset( $err['decline_code'] ) ? $err['decline_code'] : '',
				'payment_intent' => isset( $err['payment_intent'] ) ? $err['payment_intent'] : null,
			)
		);
	}
	return $body;
}

function gwh_booking_meta( $id, $data ) {
	foreach ( $data as $k => $v ) {
		update_post_meta( $id, '_gwh_' . $k, $v );
	}
}

function gwh_booking_by( $key, $value ) {
	if ( '' === (string) $value ) {
		return null;
	}
	$ids = get_posts( array(
		'post_type'      => 'gwh_booking',
		'post_status'    => 'any',
		'posts_per_page' => 1,
		'fields'         => 'ids',
		'meta_key'       => '_gwh_' . $key, // phpcs:ignore WordPress.DB.SlowDBQuery
		'meta_value'     => $value, // phpcs:ignore WordPress.DB.SlowDBQuery
	) );
	return $ids ? gwh_booking( $ids[0] ) : null;
}

function gwh_payment_link( $b, $purpose ) {
	return add_query_arg( array( 'gwh_pay' => $b['token'], 'for' => $purpose ), home_url( '/' ) );
}

/* ---------- Checkout ---------- */

/**
 * Start Stripe Checkout for a booking's first payment.
 *
 * @return string|WP_Error Checkout URL.
 */
function gwh_create_checkout( $b, $amount, $purpose, $label ) {
	$params = array(
		'mode'                 => 'payment',
		'customer_email'       => $b['customer'] ? null : $b['email'],
		'customer'             => $b['customer'] ? $b['customer'] : null,
		'client_reference_id'  => (string) $b['id'],
		'line_items'           => array(
			array(
				'quantity'   => 1,
				'price_data' => array(
					'currency'     => 'eur',
					'unit_amount'  => gwh_cents( $amount ),
					'product_data' => array(
						'name'        => $label,
						'description' => gwh_nice_date( $b['arrival'] ) . ' → ' . gwh_nice_date( $b['departure'] ) . ' · ' . $b['guests'] . ' guests',
					),
				),
			),
		),
		'payment_intent_data'  => array(
			'metadata'    => array( 'booking_id' => $b['id'], 'purpose' => $purpose ),
			'description' => get_bloginfo( 'name' ) . ' – ' . $label . ' – booking #' . $b['id'],
		),
		'metadata'             => array( 'booking_id' => $b['id'], 'purpose' => $purpose ),
		'expires_at'           => time() + 31 * MINUTE_IN_SECONDS,
		'success_url'          => add_query_arg( array( 'booking' => 'success', 'session_id' => '{CHECKOUT_SESSION_ID}' ), home_url( '/' ) ) . '#book',
		'cancel_url'           => add_query_arg( 'booking', 'cancelled', home_url( '/' ) ) . '#book',
	);

	if ( 'booking' === $purpose ) {
		// Save the card for the balance and the damage hold.
		$params['customer_creation']                             = 'always';
		$params['payment_intent_data']['setup_future_usage']     = 'off_session';
	} elseif ( 'hold' === $purpose ) {
		$params['payment_intent_data']['capture_method'] = 'manual';
	}
	if ( $b['customer'] ) {
		unset( $params['customer_creation'] );
	}

	$session = gwh_stripe( 'POST', 'checkout/sessions', array_filter( $params, function ( $v ) {
		return null !== $v;
	} ) );
	if ( is_wp_error( $session ) ) {
		return $session;
	}
	if ( 'booking' === $purpose ) {
		gwh_booking_meta( $b['id'], array( 'session' => $session['id'] ) );
	}
	return $session['url'];
}

/**
 * Handle a completed Checkout Session. Safe to call more than once (webhook and return page
 * can race), so it checks state and takes a lock before doing anything.
 */
function gwh_handle_session( $session ) {
	$id      = isset( $session['metadata']['booking_id'] ) ? absint( $session['metadata']['booking_id'] ) : 0;
	$purpose = isset( $session['metadata']['purpose'] ) ? $session['metadata']['purpose'] : '';
	if ( ! $id || 'gwh_booking' !== get_post_type( $id ) ) {
		return null;
	}
	$b = gwh_booking( $id );

	if ( 'booking' === $purpose ) {
		if ( 'paid' !== $session['payment_status'] || 'confirmed' === $b['status'] ) {
			return $b;
		}
		if ( ! add_post_meta( $id, '_gwh_finalizing', time(), true ) ) {
			return $b;
		}
		$pi = gwh_stripe( 'GET', 'payment_intents/' . $session['payment_intent'] );
		$pm = is_wp_error( $pi ) ? '' : ( is_array( $pi['payment_method'] ) ? $pi['payment_method']['id'] : $pi['payment_method'] );

		$paid  = round( $session['amount_total'] / 100, 2 );
		$split = gwh_payment_split( (float) $b['total'], $b['arrival'] );
		$bal   = max( 0, round( (float) $b['total'] - $paid, 2 ) );
		gwh_booking_meta( $id, array(
			'status'         => 'confirmed',
			'customer'       => $session['customer'],
			'payment_intent' => $session['payment_intent'],
			'payment_method' => $pm,
			'paid'           => $paid,
			'balance'        => $bal,
			'balance_date'   => $bal > 0 ? ( $split['balance_date'] ? $split['balance_date'] : gwh_today() ) : '',
			'balance_status' => $bal > 0 ? 'scheduled' : 'paid',
		) );
		$b = gwh_booking( $id );

		if ( ! gwh_is_available( $b['arrival'], $b['departure'], $id ) ) {
			// Someone booked the same dates on Airbnb in the minutes before Airbnb synced.
			wp_mail( gwh_owner_email(), '⚠️ Double booking: ' . get_post_field( 'post_title', $id ), "A guest has just paid for dates that now clash with another booking (probably from Airbnb). Please contact them and refund in Stripe if needed.\n\n" . gwh_booking_summary( $b ) . "\n\n" . admin_url( 'post.php?action=edit&post=' . $id ) );
		}

		gwh_mail_guest( $b, 'Your booking is confirmed',
			"You're booked! We can't wait to host your group.\n\n" . gwh_booking_summary( $b )
			. ( gwh_pricing()['deposit'] > 0 ? "\n\nThe day before you arrive we'll place a " . gwh_money( gwh_pricing()['deposit'] ) . " damage-deposit hold on the same card. It's a hold, not a charge, and it's released " . GWH_RELEASE_DAYS_AFTER . " days after check-out." : '' )
			. "\n\nWe'll send the address and check-in details before you arrive. Any questions, just reply to this email." );
		wp_mail( gwh_owner_email(), 'New booking (paid): ' . get_post_field( 'post_title', $id ),
			gwh_booking_summary( $b ) . "\n\nName:  {$b['name']}\nEmail: {$b['email']}\nPhone: {$b['phone']}\n\nMessage:\n{$b['message']}\n\n" . admin_url( 'post.php?action=edit&post=' . $id ),
			array( 'Reply-To: ' . $b['name'] . ' <' . $b['email'] . '>' ) );
		return gwh_booking( $id );
	}

	if ( 'balance' === $purpose && 'paid' === $session['payment_status'] && 'paid' !== $b['balance_status'] ) {
		gwh_booking_meta( $id, array( 'balance_status' => 'paid', 'paid' => round( (float) $b['paid'] + $session['amount_total'] / 100, 2 ) ) );
		gwh_mail_guest( gwh_booking( $id ), 'Balance paid', "Thanks, we've received your balance of " . gwh_money( $session['amount_total'] / 100 ) . ". You're all paid up." );
	}

	if ( 'hold' === $purpose && 'held' !== $b['hold_status'] ) {
		$pi = gwh_stripe( 'GET', 'payment_intents/' . $session['payment_intent'] );
		if ( ! is_wp_error( $pi ) && 'requires_capture' === $pi['status'] ) {
			gwh_booking_meta( $id, array( 'hold_status' => 'held', 'hold_pi' => $pi['id'] ) );
		}
	}
	return gwh_booking( $id );
}

/**
 * ?gwh_pay=<token>&for=balance|hold: open a fresh Checkout page for a payment that needs the
 * guest (card declined, or their bank asked them to approve it). Links in emails never expire.
 */
function gwh_serve_pay_link() {
	if ( empty( $_GET['gwh_pay'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	nocache_headers();
	$b   = gwh_booking_by( 'token', sanitize_text_field( wp_unslash( $_GET['gwh_pay'] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$for = isset( $_GET['for'] ) ? sanitize_key( $_GET['for'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	if ( ! $b || ! gwh_payments_enabled() || 'confirmed' !== $b['status'] ) {
		wp_safe_redirect( home_url( '/' ) );
		exit;
	}

	$url = null;
	if ( 'balance' === $for && (float) $b['balance'] > 0 && 'paid' !== $b['balance_status'] ) {
		$url = gwh_create_checkout( $b, $b['balance'], 'balance', __( 'Balance', 'gasworks-house' ) );
	} elseif ( 'hold' === $for && 'held' !== $b['hold_status'] && gwh_pricing()['deposit'] > 0 ) {
		$url = gwh_create_checkout( $b, gwh_pricing()['deposit'], 'hold', __( 'Damage deposit (hold only, not charged)', 'gasworks-house' ) );
	}
	if ( is_string( $url ) ) {
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect -- Stripe Checkout URL.
		exit;
	}
	wp_safe_redirect( add_query_arg( 'booking', 'nothing-due', home_url( '/' ) ) . '#book' );
	exit;
}
add_action( 'init', 'gwh_serve_pay_link', 2 );

/* ---------- Webhook ---------- */

function gwh_verify_stripe_signature( $payload, $header, $secret, $tolerance = 300 ) {
	if ( ! $secret || ! $header ) {
		return false;
	}
	$t  = null;
	$v1 = array();
	foreach ( explode( ',', $header ) as $part ) {
		$kv = explode( '=', trim( $part ), 2 );
		if ( 2 !== count( $kv ) ) {
			continue;
		}
		if ( 't' === $kv[0] ) {
			$t = (int) $kv[1];
		} elseif ( 'v1' === $kv[0] ) {
			$v1[] = $kv[1];
		}
	}
	if ( ! $t || ! $v1 || abs( time() - $t ) > $tolerance ) {
		return false;
	}
	$expected = hash_hmac( 'sha256', $t . '.' . $payload, $secret );
	foreach ( $v1 as $sig ) {
		if ( hash_equals( $expected, $sig ) ) {
			return true;
		}
	}
	return false;
}

function gwh_rest_stripe_webhook( WP_REST_Request $req ) {
	$payload = $req->get_body();
	if ( ! gwh_verify_stripe_signature( $payload, $req->get_header( 'stripe_signature' ), gwh_stripe_webhook_secret() ) ) {
		return new WP_Error( 'bad_signature', 'Invalid signature', array( 'status' => 400 ) );
	}
	$event  = json_decode( $payload, true );
	$object = isset( $event['data']['object'] ) ? $event['data']['object'] : array();

	switch ( isset( $event['type'] ) ? $event['type'] : '' ) {
		case 'checkout.session.completed':
		case 'checkout.session.async_payment_succeeded':
			gwh_handle_session( $object );
			break;
		case 'checkout.session.expired':
			$id = isset( $object['metadata']['booking_id'] ) ? absint( $object['metadata']['booking_id'] ) : 0;
			if ( $id && 'checkout' === get_post_meta( $id, '_gwh_status', true ) && ( $object['metadata']['purpose'] ?? '' ) === 'booking' ) {
				update_post_meta( $id, '_gwh_status', 'abandoned' );
			}
			break;
	}
	return rest_ensure_response( array( 'received' => true ) );
}

/* ---------- Guest-facing REST: start checkout, check status ---------- */

function gwh_register_payment_routes() {
	register_rest_route( 'gwh/v1', '/checkout', array(
		'methods'             => 'POST',
		'callback'            => 'gwh_rest_checkout',
		'permission_callback' => '__return_true',
	) );
	register_rest_route( 'gwh/v1', '/checkout-status', array(
		'methods'             => 'GET',
		'callback'            => 'gwh_rest_checkout_status',
		'permission_callback' => '__return_true',
	) );
	register_rest_route( 'gwh/v1', '/stripe-webhook', array(
		'methods'             => 'POST',
		'callback'            => 'gwh_rest_stripe_webhook',
		'permission_callback' => '__return_true',
	) );
}
add_action( 'rest_api_init', 'gwh_register_payment_routes' );

function gwh_rest_checkout( WP_REST_Request $req ) {
	gwh_no_cache();
	if ( ! gwh_payments_enabled() ) {
		return gwh_rest_error( __( 'Online booking isn\'t available right now. Please send a request instead.', 'gasworks-house' ) );
	}
	$data = gwh_validate_booking_request( $req );
	if ( is_wp_error( $data ) || isset( $data['spam'] ) ) {
		return is_wp_error( $data ) ? $data : rest_ensure_response( array( 'ok' => true ) );
	}
	$quote = gwh_quote( $data['arrival'], $data['departure'], $data['guests'], $data['cruise_people'] );
	if ( ! $quote['priced'] ) {
		return gwh_rest_error( __( 'We can\'t price those dates online. Please send us a request instead.', 'gasworks-house' ) );
	}

	$id = gwh_create_booking( $data, 'checkout', $quote['total'] );
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	$b     = gwh_booking( $id );
	$split = gwh_payment_split( $quote['total'], $b['arrival'] );
	$label = $split['balance'] > 0
		/* translators: %s: percent */
		? sprintf( __( '%s%% deposit – Gasworks House stay', 'gasworks-house' ), gwh_bset( 'deposit_percent' ) )
		: __( 'Gasworks House stay – paid in full', 'gasworks-house' );

	$url = gwh_create_checkout( $b, $split['now'], 'booking', $label );
	if ( is_wp_error( $url ) ) {
		update_post_meta( $id, '_gwh_status', 'abandoned' );
		return gwh_rest_error( __( 'We couldn\'t open the payment page. Please try again in a moment.', 'gasworks-house' ), 502 );
	}
	return rest_ensure_response( array( 'ok' => true, 'url' => $url ) );
}

function gwh_rest_checkout_status( WP_REST_Request $req ) {
	gwh_no_cache();
	$session_id = sanitize_text_field( (string) $req->get_param( 'session_id' ) );
	$b          = gwh_booking_by( 'session', $session_id );
	if ( ! $b || ! gwh_payments_enabled() ) {
		return gwh_rest_error( __( 'Booking not found.', 'gasworks-house' ), 404 );
	}
	// Don't wait for the webhook: ask Stripe directly.
	if ( 'confirmed' !== $b['status'] ) {
		$session = gwh_stripe( 'GET', 'checkout/sessions/' . rawurlencode( $session_id ) );
		if ( ! is_wp_error( $session ) ) {
			$b = gwh_handle_session( $session );
		}
	}
	return rest_ensure_response( array(
		'status'    => $b['status'],
		'arrival'   => $b['arrival'],
		'departure' => $b['departure'],
		'paid'      => (float) $b['paid'],
		'balance'   => 'paid' === $b['balance_status'] ? 0 : (float) $b['balance'],
		'balanceOn' => $b['balance_date'],
		'email'     => $b['email'],
	) );
}

/* ---------- Scheduled charges ---------- */

/**
 * Charge a saved card off-session.
 *
 * @return array|WP_Error PaymentIntent.
 */
function gwh_charge_saved_card( $b, $amount, $purpose, $manual_capture = false ) {
	// If the card wasn't recorded at checkout (e.g. Stripe was slow to answer), look it up now.
	if ( ! $b['payment_method'] && $b['payment_intent'] ) {
		$pi = gwh_stripe( 'GET', 'payment_intents/' . $b['payment_intent'] );
		if ( ! is_wp_error( $pi ) && ! empty( $pi['payment_method'] ) ) {
			$b['payment_method'] = is_array( $pi['payment_method'] ) ? $pi['payment_method']['id'] : $pi['payment_method'];
			update_post_meta( $b['id'], '_gwh_payment_method', $b['payment_method'] );
		}
	}
	if ( ! $b['customer'] || ! $b['payment_method'] ) {
		return new WP_Error( 'no_card', 'No saved card on file' );
	}
	$params = array(
		'amount'         => gwh_cents( $amount ),
		'currency'       => 'eur',
		'customer'       => $b['customer'],
		'payment_method' => $b['payment_method'],
		'off_session'    => 'true',
		'confirm'        => 'true',
		'description'    => get_bloginfo( 'name' ) . ' – ' . $purpose . ' – booking #' . $b['id'],
		'metadata'       => array( 'booking_id' => $b['id'], 'purpose' => $purpose ),
	);
	if ( $manual_capture ) {
		$params['capture_method'] = 'manual';
	}
	return gwh_stripe( 'POST', 'payment_intents', $params, 'gwh-' . $purpose . '-' . $b['id'] . '-' . gmdate( 'Ymd' ) );
}

function gwh_due_bookings( $meta_query ) {
	return get_posts( array(
		'post_type'      => 'gwh_booking',
		'post_status'    => 'any',
		'posts_per_page' => 50,
		'fields'         => 'ids',
		'meta_query'     => array_merge( array( array( 'key' => '_gwh_status', 'value' => 'confirmed' ) ), $meta_query ), // phpcs:ignore WordPress.DB.SlowDBQuery
	) );
}

function gwh_charge_balance( $id ) {
	$b = gwh_booking( $id );
	if ( 'confirmed' !== $b['status'] || (float) $b['balance'] <= 0 || in_array( $b['balance_status'], array( 'paid', 'processing' ), true ) ) {
		return;
	}
	update_post_meta( $id, '_gwh_balance_status', 'processing' );
	$pi = gwh_charge_saved_card( $b, $b['balance'], 'balance' );

	if ( ! is_wp_error( $pi ) && 'succeeded' === $pi['status'] ) {
		gwh_booking_meta( $id, array( 'balance_status' => 'paid', 'paid' => round( (float) $b['paid'] + (float) $b['balance'], 2 ) ) );
		gwh_mail_guest( gwh_booking( $id ), 'Balance paid', "We've charged your balance of " . gwh_money( $b['balance'] ) . " to your saved card. You're all paid up. See you soon!" );
		return;
	}
	update_post_meta( $id, '_gwh_balance_status', 'failed' );
	$why = is_wp_error( $pi ) ? $pi->get_error_message() : 'status ' . $pi['status'];
	gwh_mail_guest( $b, 'Action needed: your balance payment',
		"We tried to charge your balance of " . gwh_money( $b['balance'] ) . " but your card needs your approval (or was declined).\n\nPlease pay here:\n" . gwh_payment_link( $b, 'balance' ) );
	wp_mail( gwh_owner_email(), 'Balance payment failed: ' . get_post_field( 'post_title', $id ), "The automatic balance charge failed ({$why}). The guest has been emailed a payment link.\n\n" . admin_url( 'post.php?action=edit&post=' . $id ) );
}

function gwh_place_hold( $id ) {
	$b       = gwh_booking( $id );
	$deposit = gwh_pricing()['deposit'];
	// Only bookings paid online have a saved card; phone bookings and blocked dates are skipped.
	if ( 'confirmed' !== $b['status'] || $deposit <= 0 || '' !== (string) $b['hold_status'] || ! $b['customer'] ) {
		return;
	}
	update_post_meta( $id, '_gwh_hold_status', 'processing' );
	$pi = gwh_charge_saved_card( $b, $deposit, 'hold', true );

	if ( ! is_wp_error( $pi ) && 'requires_capture' === $pi['status'] ) {
		gwh_booking_meta( $id, array( 'hold_status' => 'held', 'hold_pi' => $pi['id'] ) );
		return;
	}
	update_post_meta( $id, '_gwh_hold_status', 'failed' );
	gwh_mail_guest( $b, 'Action needed: damage deposit',
		"Before your stay we place a " . gwh_money( $deposit ) . " damage-deposit hold on your card (a hold, not a charge). Your bank needs you to approve it.\n\nPlease approve it here before you arrive:\n" . gwh_payment_link( $b, 'hold' ) );
	wp_mail( gwh_owner_email(), 'Damage deposit hold failed: ' . get_post_field( 'post_title', $id ), "The damage-deposit hold couldn't be placed automatically. The guest has been emailed a link to approve it.\n\n" . admin_url( 'post.php?action=edit&post=' . $id ) );
}

function gwh_release_hold( $id ) {
	$b = gwh_booking( $id );
	if ( 'held' !== $b['hold_status'] || ! $b['hold_pi'] ) {
		return new WP_Error( 'no_hold', 'No active hold' );
	}
	$res = gwh_stripe( 'POST', 'payment_intents/' . $b['hold_pi'] . '/cancel' );
	if ( ! is_wp_error( $res ) ) {
		update_post_meta( $id, '_gwh_hold_status', 'released' );
	}
	return $res;
}

function gwh_capture_hold( $id, $amount ) {
	$b = gwh_booking( $id );
	if ( 'held' !== $b['hold_status'] || ! $b['hold_pi'] ) {
		return new WP_Error( 'no_hold', 'No active hold' );
	}
	$amount = min( (float) $amount, gwh_pricing()['deposit'] );
	$res    = gwh_stripe( 'POST', 'payment_intents/' . $b['hold_pi'] . '/capture', array( 'amount_to_capture' => gwh_cents( $amount ) ) );
	if ( ! is_wp_error( $res ) ) {
		gwh_booking_meta( $id, array( 'hold_status' => 'captured', 'hold_captured' => $amount ) );
	}
	return $res;
}

/**
 * Hourly: charge balances that are due, place holds for tomorrow's arrivals, release old holds.
 */
function gwh_process_payments() {
	if ( ! gwh_payments_enabled() ) {
		return;
	}
	$today = gwh_today();

	foreach ( gwh_due_bookings( array(
		array( 'key' => '_gwh_balance_status', 'value' => 'scheduled' ),
		array( 'key' => '_gwh_balance_date', 'value' => $today, 'compare' => '<=' ),
	) ) as $id ) {
		gwh_charge_balance( $id );
	}

	$hold_from = gmdate( 'Y-m-d', strtotime( $today . ' +' . GWH_HOLD_DAYS_BEFORE . ' days' ) );
	foreach ( gwh_due_bookings( array(
		array( 'key' => '_gwh_arrival', 'value' => $hold_from, 'compare' => '<=' ),
		array( 'key' => '_gwh_departure', 'value' => $today, 'compare' => '>=' ),
		array( 'key' => '_gwh_hold_status', 'compare' => 'NOT EXISTS' ),
	) ) as $id ) {
		gwh_place_hold( $id );
	}

	$release_before = gmdate( 'Y-m-d', strtotime( $today . ' -' . GWH_RELEASE_DAYS_AFTER . ' days' ) );
	foreach ( gwh_due_bookings( array(
		array( 'key' => '_gwh_hold_status', 'value' => 'held' ),
		array( 'key' => '_gwh_departure', 'value' => $release_before, 'compare' => '<=' ),
	) ) as $id ) {
		gwh_release_hold( $id );
	}
}
add_action( 'gwh_hourly', 'gwh_process_payments' );
