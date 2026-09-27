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

function gwh_rest_request( WP_REST_Request $req ) {
	gwh_no_cache();

	// Honeypot: pretend success so bots move on.
	if ( '' !== trim( (string) $req->get_param( 'website' ) ) ) {
		return rest_ensure_response( array( 'ok' => true ) );
	}

	// At most 5 successful requests per hour from one address. Failed attempts don't count,
	// so a guest fixing a typo is never locked out.
	$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$key = 'gwh_rl_' . md5( $ip );
	$hit = (int) get_transient( $key );
	if ( $hit >= 5 ) {
		return gwh_rest_error( __( 'Too many requests. Please try again later or contact us directly.', 'gasworks-house' ), 429 );
	}

	$arrival   = sanitize_text_field( (string) $req->get_param( 'arrival' ) );
	$departure = sanitize_text_field( (string) $req->get_param( 'departure' ) );
	$guests    = absint( $req->get_param( 'guests' ) );
	$name      = sanitize_text_field( (string) $req->get_param( 'name' ) );
	$email     = sanitize_email( (string) $req->get_param( 'email' ) );
	$phone     = sanitize_text_field( (string) $req->get_param( 'phone' ) );
	$message   = sanitize_textarea_field( (string) $req->get_param( 'message' ) );
	$party     = sanitize_text_field( (string) $req->get_param( 'party' ) );
	if ( ! in_array( $party, array( 'Hen party', 'Stag party', 'Joint hen & stag', 'Other celebration' ), true ) ) {
		$party = 'Other celebration';
	}

	if ( '' === $name || ! is_email( $email ) ) {
		return gwh_rest_error( __( 'Please add your name and a valid email address.', 'gasworks-house' ) );
	}
	if ( ! gwh_is_date( $arrival ) || ! gwh_is_date( $departure ) || $departure <= $arrival ) {
		return gwh_rest_error( __( 'Please choose your arrival and departure dates.', 'gasworks-house' ) );
	}
	if ( $arrival < gwh_today() ) {
		return gwh_rest_error( __( 'Your arrival date is in the past.', 'gasworks-house' ) );
	}
	if ( $arrival > gmdate( 'Y-m-d', strtotime( '+2 years' ) ) ) {
		return gwh_rest_error( __( 'We only take bookings up to two years ahead.', 'gasworks-house' ) );
	}
	$min = max( 1, absint( gwh_bset( 'min_nights' ) ) );
	if ( count( gwh_nights( $arrival, $departure ) ) < $min ) {
		/* translators: %d: minimum nights */
		return gwh_rest_error( sprintf( __( 'The minimum stay is %d nights.', 'gasworks-house' ), $min ) );
	}
	if ( $guests < 1 || $guests > gwh_max_guests() ) {
		/* translators: %d: maximum guests */
		return gwh_rest_error( sprintf( __( 'Group size must be between 1 and %d.', 'gasworks-house' ), gwh_max_guests() ) );
	}
	if ( preg_match_all( '#https?://#i', $message ) > 2 ) {
		return rest_ensure_response( array( 'ok' => true ) );
	}

	// Make sure we have Airbnb's latest bookings before holding the dates.
	gwh_maybe_sync( 600 );
	if ( ! gwh_is_available( $arrival, $departure ) ) {
		return gwh_rest_error( __( 'Sorry, those dates have just been booked. Please choose different dates.', 'gasworks-house' ), 409 );
	}

	$quote = gwh_quote( $arrival, $departure, $guests );
	$title = sprintf( '%s – %s (%s → %s)', $party, $name, $arrival, $departure );
	$id    = wp_insert_post( array(
		'post_type'   => 'gwh_booking',
		'post_status' => 'private',
		'post_title'  => $title,
	), true );
	if ( is_wp_error( $id ) ) {
		return gwh_rest_error( __( 'Sorry, something went wrong. Please try again.', 'gasworks-house' ), 500 );
	}

	$fields = array(
		'arrival'   => $arrival,
		'departure' => $departure,
		'guests'    => $guests,
		'status'    => 'pending',
		'name'      => $name,
		'email'     => $email,
		'phone'     => $phone,
		'party'     => $party,
		'message'   => $message,
		'total'     => $quote['total'],
		'created'   => time(),
	);
	foreach ( $fields as $k => $v ) {
		update_post_meta( $id, '_gwh_' . $k, $v );
	}
	set_transient( $key, $hit + 1, HOUR_IN_SECONDS );

	$b    = gwh_booking( $id );
	$hold = absint( gwh_bset( 'hold_days' ) );

	wp_mail(
		gwh_owner_email(),
		'New booking request: ' . $title,
		"You have a new booking request. The dates are held for {$hold} days.\n\n"
			. gwh_booking_summary( $b )
			. "\n\nName:  {$name}\nEmail: {$email}\nPhone: {$phone}\n\nMessage:\n{$message}\n\n"
			. "Confirm or decline it here:\n" . admin_url( 'edit.php?post_type=gwh_booking' ),
		array( 'Reply-To: ' . $name . ' <' . $email . '>' )
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
