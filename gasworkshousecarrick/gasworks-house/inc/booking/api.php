<?php
/**
 * Public REST endpoints used by the booking calendar:
 *   GET  /wp-json/gwh/v1/availability
 *   POST /wp-json/gwh/v1/request
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function gwh_register_routes() {
	register_rest_route( 'gwh/v1', '/availability', array(
		'methods'             => 'GET',
		'callback'            => 'gwh_rest_availability',
		'permission_callback' => '__return_true',
	) );
	register_rest_route( 'gwh/v1', '/request', array(
		'methods'             => 'POST',
		'callback'            => 'gwh_rest_request',
		'permission_callback' => '__return_true',
	) );
}
add_action( 'rest_api_init', 'gwh_register_routes' );

function gwh_no_cache() {
	nocache_headers();
	do_action( 'litespeed_control_set_nocache', 'live availability' );
}

/**
 * Settings the calendar needs. Shared by the REST endpoint and the inline page data.
 */
function gwh_calendar_config() {
	return array(
		'today'        => gwh_today(),
		'blocked'      => gwh_blocked_ranges(),
		'minNights'    => max( 1, absint( gwh_bset( 'min_nights' ) ) ),
		'maxGuests'    => gwh_max_guests(),
		'pricing'      => gwh_pricing(),
		'checkin'      => gwh_bset( 'checkin_time' ),
		'checkout'     => gwh_bset( 'checkout_time' ),
		'availability' => rest_url( 'gwh/v1/availability' ),
		'request'      => rest_url( 'gwh/v1/request' ),
		'checkoutUrl'  => rest_url( 'gwh/v1/checkout' ),
		'statusUrl'    => rest_url( 'gwh/v1/checkout-status' ),
		'payments'     => gwh_payments_enabled(),
		'depositPct'   => (float) gwh_bset( 'deposit_percent' ),
		'balanceDays'  => absint( gwh_bset( 'balance_days' ) ),
		'holdBefore'   => GWH_HOLD_DAYS_BEFORE,
		'releaseAfter' => GWH_RELEASE_DAYS_AFTER,
		'cruise'       => gwh_cruise(),
	);
}

function gwh_rest_availability() {
	gwh_no_cache();
	gwh_maybe_sync( 3600 );
	return rest_ensure_response( gwh_calendar_config() );
}

function gwh_rest_error( $message, $code = 400 ) {
	return new WP_Error( 'gwh_booking', $message, array( 'status' => $code ) );
}

/**
 * Validate a booking form submission (shared by requests and paid checkout).
 *
 * @return array|WP_Error Clean data, array( 'spam' => true ) for bots, or an error for the guest.
 */
function gwh_validate_booking_request( WP_REST_Request $req ) {
	// Honeypot: pretend success so bots move on.
	if ( '' !== trim( (string) $req->get_param( 'website' ) ) ) {
		return array( 'spam' => true );
	}

	// At most 5 successful bookings per hour from one address. Failed attempts don't count,
	// so a guest fixing a typo is never locked out.
	if ( (int) get_transient( gwh_rate_key() ) >= 5 ) {
		return gwh_rest_error( __( 'Too many requests. Please try again later or contact us directly.', 'gasworks-house' ), 429 );
	}

	$d = array(
		'arrival'       => sanitize_text_field( (string) $req->get_param( 'arrival' ) ),
		'departure'     => sanitize_text_field( (string) $req->get_param( 'departure' ) ),
		'guests'        => absint( $req->get_param( 'guests' ) ),
		'name'          => sanitize_text_field( (string) $req->get_param( 'name' ) ),
		'email'         => sanitize_email( (string) $req->get_param( 'email' ) ),
		'phone'         => sanitize_text_field( (string) $req->get_param( 'phone' ) ),
		'message'       => sanitize_textarea_field( (string) $req->get_param( 'message' ) ),
		'party'         => sanitize_text_field( (string) $req->get_param( 'party' ) ),
		'cruise_people' => 0,
		'cruise_date'   => '',
	);
	if ( ! in_array( $d['party'], array( 'Hen party', 'Stag party', 'Joint hen & stag', 'Other celebration' ), true ) ) {
		$d['party'] = 'Other celebration';
	}

	if ( '' === $d['name'] || ! is_email( $d['email'] ) ) {
		return gwh_rest_error( __( 'Please add your name and a valid email address.', 'gasworks-house' ) );
	}
	if ( ! gwh_is_date( $d['arrival'] ) || ! gwh_is_date( $d['departure'] ) || $d['departure'] <= $d['arrival'] ) {
		return gwh_rest_error( __( 'Please choose your arrival and departure dates.', 'gasworks-house' ) );
	}
	if ( $d['arrival'] < gwh_today() ) {
		return gwh_rest_error( __( 'Your arrival date is in the past.', 'gasworks-house' ) );
	}
	if ( $d['arrival'] > gmdate( 'Y-m-d', strtotime( '+2 years' ) ) ) {
		return gwh_rest_error( __( 'We only take bookings up to two years ahead.', 'gasworks-house' ) );
	}
	$min = max( 1, absint( gwh_bset( 'min_nights' ) ) );
	if ( count( gwh_nights( $d['arrival'], $d['departure'] ) ) < $min ) {
		/* translators: %d: minimum nights */
		return gwh_rest_error( sprintf( __( 'The minimum stay is %d nights.', 'gasworks-house' ), $min ) );
	}
	if ( $d['guests'] < 1 || $d['guests'] > gwh_max_guests() ) {
		/* translators: %d: maximum guests */
		return gwh_rest_error( sprintf( __( 'Group size must be between 1 and %d.', 'gasworks-house' ), gwh_max_guests() ) );
	}
	if ( preg_match_all( '#https?://#i', $d['message'] ) > 2 ) {
		return array( 'spam' => true );
	}

	// Cruise add-on: a headcount (up to the group size) and a day of the stay.
	if ( gwh_cruise() && $req->get_param( 'cruise' ) ) {
		$people = absint( $req->get_param( 'cruise_people' ) );
		$day    = sanitize_text_field( (string) $req->get_param( 'cruise_date' ) );
		if ( $people < 1 || $people > $d['guests'] ) {
			return gwh_rest_error( __( 'Please choose how many people are coming on the cruise (up to your group size).', 'gasworks-house' ) );
		}
		if ( ! gwh_is_date( $day ) || $day < $d['arrival'] || $day > $d['departure'] ) {
			return gwh_rest_error( __( 'Please pick a cruise day during your stay.', 'gasworks-house' ) );
		}
		$d['cruise_people'] = $people;
		$d['cruise_date']   = $day;
	}

	// Make sure we have Airbnb's latest bookings before holding the dates.
	gwh_maybe_sync( 600 );
	if ( ! gwh_is_available( $d['arrival'], $d['departure'] ) ) {
		return gwh_rest_error( __( 'Sorry, those dates have just been booked. Please choose different dates.', 'gasworks-house' ), 409 );
	}
	return $d;
}

function gwh_rate_key() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	return 'gwh_rl_' . md5( $ip );
}

/**
 * Save a booking from validated form data.
 *
 * @return int|WP_Error Booking ID.
 */
function gwh_create_booking( $d, $status, $total ) {
	$id = wp_insert_post( array(
		'post_type'   => 'gwh_booking',
		'post_status' => 'private',
		'post_title'  => sprintf( '%s – %s (%s → %s)', $d['party'], $d['name'], $d['arrival'], $d['departure'] ),
	), true );
	if ( is_wp_error( $id ) ) {
		return gwh_rest_error( __( 'Sorry, something went wrong. Please try again.', 'gasworks-house' ), 500 );
	}
	foreach ( array_merge( $d, array(
		'status'  => $status,
		'total'   => $total,
		'created' => time(),
		'token'   => wp_generate_password( 32, false ),
	) ) as $k => $v ) {
		update_post_meta( $id, '_gwh_' . $k, $v );
	}
	$key = gwh_rate_key();
	set_transient( $key, (int) get_transient( $key ) + 1, HOUR_IN_SECONDS );
	return $id;
}

/**
 * Request to book (used when online payments aren't set up).
 */
function gwh_rest_request( WP_REST_Request $req ) {
	gwh_no_cache();
	$d = gwh_validate_booking_request( $req );
	if ( is_wp_error( $d ) || isset( $d['spam'] ) ) {
		return is_wp_error( $d ) ? $d : rest_ensure_response( array( 'ok' => true ) );
	}

	$quote = gwh_quote( $d['arrival'], $d['departure'], $d['guests'], $d['cruise_people'] );
	$id    = gwh_create_booking( $d, 'pending', $quote['total'] );
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	$b    = gwh_booking( $id );
	$hold = absint( gwh_bset( 'hold_days' ) );

	wp_mail(
		gwh_owner_email(),
		'New booking request: ' . get_post_field( 'post_title', $id ),
		"You have a new booking request. The dates are held for {$hold} days.\n\n"
			. gwh_booking_summary( $b )
			. "\n\nName:  {$b['name']}\nEmail: {$b['email']}\nPhone: {$b['phone']}\n\nMessage:\n{$b['message']}\n\n"
			. "Confirm or decline it here:\n" . admin_url( 'edit.php?post_type=gwh_booking' ),
		array( 'Reply-To: ' . $b['name'] . ' <' . $b['email'] . '>' )
	);

	gwh_mail_guest(
		$b,
		'We got your booking request',
		"Thanks for your request! We're holding these dates for you while we check everything, and we'll be in touch within 24 hours.\n\n"
			. gwh_booking_summary( $b )
			. "\n\nYour booking isn't confirmed until you hear back from us."
	);

	return rest_ensure_response( array(
		'ok'      => true,
		'message' => __( 'Request sent! We\'re holding your dates and will be in touch within 24 hours. Check your inbox for a copy.', 'gasworks-house' ),
	) );
}
