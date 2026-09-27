<?php
/**
 * Booking system core: settings, availability, pricing, and calendar sync with Airbnb (iCal).
 *
 * Dates are stored as Y-m-d strings. A booking covers the nights from arrival up to, but not
 * including, departure, so one group can check out on the day the next checks in.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GWH_BLOCKING_STATUSES = array( 'pending', 'checkout', 'confirmed' );

// Minutes a stay is held while the guest is paying in Stripe Checkout (Stripe's minimum session life is 30).
const GWH_CHECKOUT_HOLD_MINUTES = 35;

function gwh_booking_defaults() {
	return array(
		'ical_import'          => '',
		'weekday_rate'         => '500',
		'weekend_rate'         => '700',
		'base_guests'          => '12',
		'weekday_extra'        => '60',
		'weekend_extra'        => '70',
		'cleaning_fee'         => '60',
		'damage_deposit'       => '300',
		'min_nights'           => '2',
		'hold_days'            => '3',
		'deposit_percent'      => '30',
		'balance_days'         => '14',
		'stripe_secret_key'    => '',
		'stripe_webhook_secret' => '',
		'cruise_enabled'       => '1',
		'cruise_name'          => 'Moon River cruise',
		'cruise_price'         => '25',
		'cruise_description'   => 'Cruise the Shannon on the Moon River. Subject to availability: we\'ll confirm your sailing time.',
		'notify_email'         => '',
		'checkin_time'         => '4pm',
		'checkout_time'        => '11am',
		'payment_instructions' => "To secure your dates, please pay a 30% deposit within 3 days by bank transfer:\n\nAccount name:\nIBAN:\nBIC:\nReference: your name and arrival date\n\nThe balance is due 14 days before arrival.",
	);
}

/**
 * Booking setting with default.
 */
function gwh_bset( $key ) {
	$saved    = get_option( 'gwh_booking', array() );
	$defaults = gwh_booking_defaults();
	if ( isset( $saved[ $key ] ) && '' !== $saved[ $key ] ) {
		return $saved[ $key ];
	}
	return isset( $defaults[ $key ] ) ? $defaults[ $key ] : '';
}

function gwh_max_guests() {
	$max = absint( gwh_mod( 'sleeps' ) );
	return $max ? $max : 30;
}

function gwh_owner_email() {
	$email = gwh_bset( 'notify_email' );
	if ( ! $email ) {
		$email = gwh_mod( 'contact_email' );
	}
	return $email ? $email : get_option( 'admin_email' );
}

function gwh_money( $amount ) {
	$amount = (float) $amount;
	return '€' . number_format( $amount, floor( $amount ) == $amount ? 0 : 2 ); // phpcs:ignore Universal.Operators.StrictComparisons
}

/* ---------- Dates ---------- */

function gwh_is_date( $value ) {
	if ( ! is_string( $value ) || ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m ) ) {
		return false;
	}
	return checkdate( (int) $m[2], (int) $m[3], (int) $m[1] );
}

function gwh_today() {
	return wp_date( 'Y-m-d' );
}

/**
 * Nights between two dates, as Y-m-d strings (arrival included, departure excluded).
 */
function gwh_nights( $arrival, $departure ) {
	$nights = array();
	$day    = new DateTimeImmutable( $arrival, new DateTimeZone( 'UTC' ) );
	$end    = new DateTimeImmutable( $departure, new DateTimeZone( 'UTC' ) );
	while ( $day < $end && count( $nights ) < 400 ) {
		$nights[] = $day->format( 'Y-m-d' );
		$day      = $day->modify( '+1 day' );
	}
	return $nights;
}

function gwh_nice_date( $ymd ) {
	$d = DateTimeImmutable::createFromFormat( 'Y-m-d', $ymd, new DateTimeZone( 'UTC' ) );
	return $d ? $d->format( 'D j M Y' ) : $ymd;
}

function gwh_overlaps( $a_start, $a_end, $b_start, $b_end ) {
	return $a_start < $b_end && $b_start < $a_end;
}

/* ---------- Pricing ---------- */

function gwh_pricing() {
	return array(
		'weekday'    => (float) gwh_bset( 'weekday_rate' ),
		'weekend'    => (float) gwh_bset( 'weekend_rate' ),
		'baseGuests'   => max( 1, absint( gwh_bset( 'base_guests' ) ) ),
		'weekdayExtra' => (float) gwh_bset( 'weekday_extra' ),
		'weekendExtra' => (float) gwh_bset( 'weekend_extra' ),
		'cleaning'   => (float) gwh_bset( 'cleaning_fee' ),
		'deposit'    => (float) gwh_bset( 'damage_deposit' ),
	);
}

/**
 * Price for a stay, per night:
 *   base price for up to the base number of guests
 *   + a per-person fee for each guest over that number,
 * with Friday & Saturday nights at weekend prices and Sunday–Thursday at midweek prices,
 * plus a one-off cleaning fee. If any night has no price set, the stay is unpriced and
 * the guest is told we'll confirm the price.
 */
function gwh_quote( $arrival, $departure, $guests = 0, $cruise_people = 0 ) {
	$p      = gwh_pricing();
	$nights = gwh_nights( $arrival, $departure );
	$extra  = max( 0, (int) $guests - $p['baseGuests'] );
	$base   = 0;
	$extras = 0;
	$priced = count( $nights ) > 0;

	foreach ( $nights as $night ) {
		$dow     = (int) gmdate( 'N', strtotime( $night . ' 00:00:00 UTC' ) );
		$weekend = 5 === $dow || 6 === $dow;
		$rate    = $weekend ? $p['weekend'] : $p['weekday'];
		if ( $rate <= 0 ) {
			$priced = false;
		}
		$base   += $rate;
		$extras += $extra * ( $weekend ? $p['weekendExtra'] : $p['weekdayExtra'] );
	}

	$cruise = gwh_cruise();
	$cruise = $cruise ? min( max( 0, (int) $cruise_people ), max( (int) $guests, 0 ) ) * $cruise['price'] : 0;

	return array(
		'nights'       => count( $nights ),
		'priced'       => $priced,
		'base'         => $base,
		'extra_guests' => $extra,
		'extras'       => $extras,
		'cleaning'     => $p['cleaning'],
		'cruise'       => $cruise,
		'total'        => $priced ? $base + $extras + $p['cleaning'] + $cruise : 0,
		'deposit'      => $p['deposit'],
	);
}

/**
 * The cruise add-on, or null when it's switched off.
 */
function gwh_cruise() {
	$price = (float) gwh_bset( 'cruise_price' );
	if ( ! gwh_bset( 'cruise_enabled' ) || $price <= 0 ) {
		return null;
	}
	return array(
		'name'        => gwh_bset( 'cruise_name' ),
		'price'       => $price,
		'description' => gwh_bset( 'cruise_description' ),
	);
}

/**
 * What to charge at booking. Bookings closer than the balance window pay in full.
 *
 * @return array now, balance, balance_date (Y-m-d or '').
 */
function gwh_payment_split( $total, $arrival ) {
	$pct          = min( 100, max( 0, (float) gwh_bset( 'deposit_percent' ) ) );
	$balance_date = gmdate( 'Y-m-d', strtotime( $arrival . ' 00:00:00 UTC' ) - absint( gwh_bset( 'balance_days' ) ) * DAY_IN_SECONDS );
	if ( $pct <= 0 || $pct >= 100 || $balance_date <= gwh_today() ) {
		return array( 'now' => round( $total, 2 ), 'balance' => 0.0, 'balance_date' => '' );
	}
	$now = round( $total * $pct / 100, 2 );
	return array( 'now' => $now, 'balance' => round( $total - $now, 2 ), 'balance_date' => $balance_date );
}

/* ---------- Bookings ---------- */

function gwh_register_bookings() {
	register_post_type( 'gwh_booking', array(
		'labels'          => array(
			'name'               => __( 'Bookings', 'gasworks-house' ),
			'singular_name'      => __( 'Booking', 'gasworks-house' ),
			'add_new'            => __( 'Add booking', 'gasworks-house' ),
			'add_new_item'       => __( 'Add booking or block dates', 'gasworks-house' ),
			'edit_item'          => __( 'Booking', 'gasworks-house' ),
			'not_found'          => __( 'No bookings yet.', 'gasworks-house' ),
			'search_items'       => __( 'Search bookings', 'gasworks-house' ),
		),
		'public'          => false,
		'show_ui'         => true,
		'menu_icon'       => 'dashicons-calendar-alt',
		'menu_position'   => 3,
		'supports'        => array( 'title' ),
		'capability_type' => 'post',
		'map_meta_cap'    => true,
	) );
}
add_action( 'init', 'gwh_register_bookings' );

function gwh_booking_statuses() {
	return array(
		'pending'   => __( 'Request (dates held)', 'gasworks-house' ),
		'confirmed' => __( 'Confirmed', 'gasworks-house' ),
		'declined'  => __( 'Declined', 'gasworks-house' ),
		'cancelled' => __( 'Cancelled', 'gasworks-house' ),
		'expired'   => __( 'Expired request', 'gasworks-house' ),
		'checkout'  => __( 'Paying now', 'gasworks-house' ),
		'abandoned' => __( 'Checkout abandoned', 'gasworks-house' ),
	);
}

function gwh_booking( $post_id ) {
	$keys = array(
		'arrival', 'departure', 'guests', 'status', 'name', 'email', 'phone', 'party', 'message', 'total', 'created',
		'cruise_people', 'cruise_date', 'token',
		// Payments.
		'session', 'customer', 'payment_intent', 'payment_method', 'paid', 'balance', 'balance_date', 'balance_status',
		'hold_status', 'hold_pi', 'hold_captured',
	);
	$out  = array( 'id' => (int) $post_id );
	foreach ( $keys as $key ) {
		$out[ $key ] = get_post_meta( $post_id, '_gwh_' . $key, true );
	}
	return $out;
}

/**
 * Whether a request (or a stay being paid for) is still within its hold period.
 */
function gwh_hold_active( $booking ) {
	$created = (int) $booking['created'];
	if ( 'checkout' === $booking['status'] ) {
		return time() < $created + GWH_CHECKOUT_HOLD_MINUTES * MINUTE_IN_SECONDS;
	}
	if ( 'pending' !== $booking['status'] ) {
		return true;
	}
	return ! $created || time() < $created + absint( gwh_bset( 'hold_days' ) ) * DAY_IN_SECONDS;
}

/**
 * Direct bookings that currently block dates.
 */
function gwh_direct_bookings( $exclude_id = 0 ) {
	$ids = get_posts( array(
		'post_type'      => 'gwh_booking',
		'post_status'    => array( 'publish', 'private', 'draft' ),
		'posts_per_page' => -1,
		'fields'         => 'ids',
		'no_found_rows'  => true,
		'post__not_in'   => $exclude_id ? array( $exclude_id ) : array(),
		'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery
			array( 'key' => '_gwh_status', 'value' => GWH_BLOCKING_STATUSES, 'compare' => 'IN' ),
			array( 'key' => '_gwh_departure', 'value' => gwh_today(), 'compare' => '>' ),
		),
	) );

	$out = array();
	foreach ( $ids as $id ) {
		$b = gwh_booking( $id );
		if ( gwh_is_date( $b['arrival'] ) && gwh_is_date( $b['departure'] ) && gwh_hold_active( $b ) ) {
			$out[] = $b;
		}
	}
	return $out;
}

/**
 * All blocked ranges: [ [start, end], ... ] with end exclusive.
 */
function gwh_blocked_ranges( $exclude_id = 0 ) {
	$ranges = array();
	foreach ( (array) get_option( 'gwh_ical_blocks', array() ) as $r ) {
		$ranges[] = array( $r[0], $r[1] );
	}
	foreach ( gwh_direct_bookings( $exclude_id ) as $b ) {
		$ranges[] = array( $b['arrival'], $b['departure'] );
	}
	$today  = gwh_today();
	$ranges = array_values( array_filter( $ranges, function ( $r ) use ( $today ) {
		return $r[1] > $today;
	} ) );
	usort( $ranges, function ( $a, $b ) {
		return strcmp( $a[0], $b[0] );
	} );
	return $ranges;
}

function gwh_is_available( $arrival, $departure, $exclude_id = 0 ) {
	foreach ( gwh_blocked_ranges( $exclude_id ) as $r ) {
		if ( gwh_overlaps( $arrival, $departure, $r[0], $r[1] ) ) {
			return false;
		}
	}
	return true;
}

/**
 * Release holds that have run out: unanswered requests expire, unpaid checkouts are abandoned.
 */
function gwh_expire_requests() {
	$ids = get_posts( array(
		'post_type'      => 'gwh_booking',
		'post_status'    => 'any',
		'posts_per_page' => -1,
		'fields'         => 'ids',
		'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery
			array( 'key' => '_gwh_status', 'value' => array( 'pending', 'checkout' ), 'compare' => 'IN' ),
		),
	) );
	foreach ( $ids as $id ) {
		$b = gwh_booking( $id );
		if ( ! gwh_hold_active( $b ) ) {
			update_post_meta( $id, '_gwh_status', 'checkout' === $b['status'] ? 'abandoned' : 'expired' );
		}
	}
}

/* ---------- iCal import (Airbnb → website) ---------- */

/**
 * Parse all-day ranges out of an iCal feed.
 */
function gwh_parse_ical( $ics ) {
	$ics    = preg_replace( "/\r?\n[ \t]/", '', (string) $ics );
	$ranges = array();
	if ( ! preg_match_all( '/BEGIN:VEVENT(.*?)END:VEVENT/s', $ics, $events ) ) {
		return $ranges;
	}
	foreach ( $events[1] as $event ) {
		if ( ! preg_match( '/^DTSTART[^:\r\n]*:(\d{4})(\d{2})(\d{2})/m', $event, $s ) ) {
			continue;
		}
		$start = "$s[1]-$s[2]-$s[3]";
		if ( preg_match( '/^DTEND[^:\r\n]*:(\d{4})(\d{2})(\d{2})/m', $event, $e ) ) {
			$end = "$e[1]-$e[2]-$e[3]";
		} else {
			$end = gmdate( 'Y-m-d', strtotime( $start . ' +1 day' ) );
		}
		if ( gwh_is_date( $start ) && gwh_is_date( $end ) && $end > $start ) {
			$ranges[] = array( $start, $end );
		}
	}
	return $ranges;
}

/**
 * Fetch every import feed. On any failure the previous blocks are kept, so a
 * temporary outage never makes booked dates look free.
 */
function gwh_sync_calendars() {
	$urls   = array_filter( array_map( 'trim', preg_split( '/\s+/', (string) gwh_bset( 'ical_import' ) ) ) );
	$ranges = array();

	foreach ( $urls as $url ) {
		$res = wp_safe_remote_get( $url, array( 'timeout' => 20 ) );
		if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) || false === strpos( wp_remote_retrieve_body( $res ), 'BEGIN:VCALENDAR' ) ) {
			$msg = is_wp_error( $res ) ? $res->get_error_message() : 'HTTP ' . wp_remote_retrieve_response_code( $res );
			update_option( 'gwh_ical_sync', array( 'time' => time(), 'ok' => false, 'message' => $msg ), false );
			return false;
		}
		$ranges = array_merge( $ranges, gwh_parse_ical( wp_remote_retrieve_body( $res ) ) );
	}

	update_option( 'gwh_ical_blocks', $ranges, false );
	update_option( 'gwh_ical_sync', array( 'time' => time(), 'ok' => true, 'message' => count( $ranges ) . ' blocked periods' ), false );
	return true;
}

/**
 * Re-sync if the last sync is older than $max_age seconds.
 */
function gwh_maybe_sync( $max_age = 900 ) {
	if ( ! gwh_bset( 'ical_import' ) ) {
		return;
	}
	$sync = get_option( 'gwh_ical_sync', array() );
	if ( empty( $sync['time'] ) || time() - (int) $sync['time'] > $max_age ) {
		gwh_sync_calendars();
	}
}

function gwh_cron_tasks() {
	gwh_sync_calendars();
	gwh_expire_requests();
}
add_action( 'gwh_hourly', 'gwh_cron_tasks' );

function gwh_schedule_cron() {
	if ( ! wp_next_scheduled( 'gwh_hourly' ) ) {
		wp_schedule_event( time() + 60, 'hourly', 'gwh_hourly' );
	}
}
add_action( 'init', 'gwh_schedule_cron' );

function gwh_unschedule_cron() {
	wp_clear_scheduled_hook( 'gwh_hourly' );
}
add_action( 'switch_theme', 'gwh_unschedule_cron' );

/* ---------- iCal export (website → Airbnb) ---------- */

function gwh_ical_token() {
	$token = get_option( 'gwh_ical_token' );
	if ( ! $token ) {
		$token = wp_generate_password( 24, false );
		update_option( 'gwh_ical_token', $token, false );
	}
	return $token;
}

function gwh_ical_export_url() {
	return add_query_arg( 'gwh_ical', gwh_ical_token(), home_url( '/' ) );
}

/**
 * Serve direct bookings as an iCal feed for Airbnb to import. Only dates are
 * shared; guest details never leave the site.
 */
function gwh_serve_ical() {
	if ( empty( $_GET['gwh_ical'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	if ( ! hash_equals( gwh_ical_token(), sanitize_text_field( wp_unslash( $_GET['gwh_ical'] ) ) ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		status_header( 404 );
		exit;
	}

	nocache_headers();
	do_action( 'litespeed_control_set_nocache', 'calendar feed' );
	header( 'Content-Type: text/calendar; charset=utf-8' );
	header( 'Content-Disposition: inline; filename="gasworks-house.ics"' );

	$host  = wp_parse_url( home_url(), PHP_URL_HOST );
	$stamp = gmdate( 'Ymd\THis\Z' );
	$lines = array( 'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gasworks House//Bookings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH' );
	foreach ( gwh_direct_bookings() as $b ) {
		// A half-hour checkout hold would outlive itself on Airbnb, which only refreshes every few hours.
		if ( 'checkout' === $b['status'] ) {
			continue;
		}
		$lines[] = 'BEGIN:VEVENT';
		$lines[] = 'UID:booking-' . $b['id'] . '@' . $host;
		$lines[] = 'DTSTAMP:' . $stamp;
		$lines[] = 'DTSTART;VALUE=DATE:' . str_replace( '-', '', $b['arrival'] );
		$lines[] = 'DTEND;VALUE=DATE:' . str_replace( '-', '', $b['departure'] );
		$lines[] = 'SUMMARY:' . ( 'confirmed' === $b['status'] ? 'Direct booking' : 'Direct booking (held)' );
		$lines[] = 'END:VEVENT';
	}
	$lines[] = 'END:VCALENDAR';
	echo implode( "\r\n", $lines ) . "\r\n"; // phpcs:ignore WordPress.Security.EscapeOutput
	exit;
}
add_action( 'init', 'gwh_serve_ical', 1 );

/* ---------- Emails ---------- */

function gwh_booking_summary( $b ) {
	$q     = gwh_quote( $b['arrival'], $b['departure'], (int) $b['guests'], (int) $b['cruise_people'] );
	$lines = array(
		'Arrival:    ' . gwh_nice_date( $b['arrival'] ) . ' (check-in from ' . gwh_bset( 'checkin_time' ) . ')',
		'Departure:  ' . gwh_nice_date( $b['departure'] ) . ' (check-out by ' . gwh_bset( 'checkout_time' ) . ')',
		'Nights:     ' . $q['nights'],
		'Guests:     ' . $b['guests'],
		'Occasion:   ' . $b['party'],
	);
	if ( (int) $b['cruise_people'] > 0 && gwh_is_date( $b['cruise_date'] ) ) {
		$lines[] = 'Add-on:     ' . gwh_bset( 'cruise_name' ) . ' for ' . (int) $b['cruise_people'] . ' on ' . gwh_nice_date( $b['cruise_date'] ) . ' (subject to availability)';
	}
	if ( (float) $b['total'] > 0 ) {
		$lines[] = 'Total:      ' . gwh_money( $b['total'] ) . ' (incl. ' . gwh_money( $q['cleaning'] ) . ' cleaning)';
	} else {
		$lines[] = 'Total:      to be confirmed';
	}
	if ( (float) $b['paid'] > 0 ) {
		$lines[] = 'Paid:       ' . gwh_money( $b['paid'] );
		if ( (float) $b['balance'] > 0 && 'paid' !== $b['balance_status'] ) {
			$lines[] = 'Balance:    ' . gwh_money( $b['balance'] ) . ', charged automatically to your card on ' . gwh_nice_date( $b['balance_date'] );
		}
	}
	if ( $q['deposit'] > 0 ) {
		$lines[] = 'Damage deposit: ' . gwh_money( $q['deposit'] ) . ' card pre-authorisation (a hold, not a charge), released after the stay';
	}
	return implode( "\n", $lines );
}

function gwh_mail_guest( $b, $subject, $body ) {
	if ( ! is_email( $b['email'] ) ) {
		return false;
	}
	$site = get_bloginfo( 'name' );
	return wp_mail(
		$b['email'],
		$subject . ' – ' . $site,
		"Hi " . $b['name'] . ",\n\n" . $body . "\n\n" . $site . "\n" . home_url( '/' ),
		array( 'Reply-To: ' . $site . ' <' . gwh_owner_email() . '>' )
	);
}
