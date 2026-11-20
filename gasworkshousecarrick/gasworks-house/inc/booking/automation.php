<?php
/**
 * Guest emails that run themselves, on the hourly schedule:
 *   - Arrival details a few days before check-in (to the guest), with a heads-up to the owner.
 *   - Thank-you and review request the day after check-out.
 *
 * Each email is sent once per booking. Turn them off or edit the wording in Bookings → Settings.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function gwh_default_arrival_info() {
	return "Address: Gasworks House, Station Road, Carrick-on-Shannon, Co. Roscommon, N41 DW99\n"
		. "Check-in from 4pm, check-out by 11am.\n"
		. "Parking: [where guests should park]\n"
		. "Getting in: [key safe / meet & greet details]\n"
		. "Wi-Fi: [network and password]\n\n"
		. "The town centre, pubs and the marina are a short walk away. If you need anything during your stay, call or WhatsApp 086 174 2808.";
}

function gwh_review_link() {
	$url = (string) gwh_bset( 'review_url' );
	return $url ? $url : (string) gwh_mod( 'maps_listing_url' );
}

function gwh_automation_bookings( $meta_query ) {
	return get_posts( array(
		'post_type'      => 'gwh_booking',
		'post_status'    => 'any',
		'posts_per_page' => 50,
		'fields'         => 'ids',
		'meta_query'     => array_merge( array( // phpcs:ignore WordPress.DB.SlowDBQuery
			array( 'key' => '_gwh_status', 'value' => 'confirmed' ),
			array( 'key' => '_gwh_email', 'value' => '', 'compare' => '!=' ),
		), $meta_query ),
	) );
}

function gwh_send_arrival_email( $id ) {
	if ( ! add_post_meta( $id, '_gwh_arrival_sent', time(), true ) ) {
		return;
	}
	$b    = gwh_booking( $id );
	$todo = array();
	if ( (float) $b['balance'] > 0 && 'paid' !== $b['balance_status'] && in_array( $b['balance_status'], array( 'failed', 'link_sent' ), true ) ) {
		$todo[] = 'Your balance of ' . gwh_money( $b['balance'] ) . " is still outstanding. Pay securely here:\n" . gwh_payment_link( $b, 'balance' );
	}
	if ( (int) $b['cruise_people'] > 0 ) {
		$todo[] = gwh_cruise()['name'] . ': ' . (int) $b['cruise_people'] . ' people' . ( gwh_is_date( $b['cruise_date'] ) ? ' on ' . gwh_nice_date( $b['cruise_date'] ) : '' ) . ". We'll confirm your sailing time.";
	}

	gwh_mail_guest( $b, 'Your stay is nearly here: arrival details',
		'Not long now! Here is everything you need for ' . gwh_nice_date( $b['arrival'] ) . ".\n\n"
		. trim( (string) gwh_bset( 'arrival_info' ) )
		. ( $todo ? "\n\n" . implode( "\n\n", $todo ) : '' )
		. "\n\n" . gwh_booking_summary( $b ) );

	wp_mail( gwh_owner_email(), 'Arriving ' . gwh_nice_date( $b['arrival'] ) . ': ' . get_post_field( 'post_title', $id ),
		"Heads-up: this group arrives soon and has been sent the arrival details.\n\n"
		. gwh_booking_summary( $b ) . "\n\nName:  {$b['name']}\nPhone: {$b['phone']}\n"
		. ( function_exists( 'gwh_payment_lines' ) ? "\n" . implode( "\n", gwh_payment_lines( $b ) ) : '' )
		. "\n\n" . admin_url( 'post.php?action=edit&post=' . $id ) );
}

function gwh_send_review_email( $id ) {
	if ( ! add_post_meta( $id, '_gwh_review_sent', time(), true ) ) {
		return;
	}
	$b    = gwh_booking( $id );
	$link = gwh_review_link();
	gwh_mail_guest( $b, 'Thanks for staying at Gasworks House',
		"Thank you for choosing Gasworks House. We hope the celebrations were everything you wanted!\n\n"
		. ( $link ? "If you have a minute, a quick review really helps a small business like ours:\n{$link}\n\n" : '' )
		. 'Planning another one? Book direct any time at ' . home_url( '/' ) . '. Just reply to this email if you have any questions.' );
}

/**
 * Hourly. Arrival details go out N days before; review requests the day after check-out
 * (but never for stays that ended more than a week ago, e.g. when first switched on).
 */
function gwh_run_automation() {
	$today = gwh_today();

	if ( '1' === (string) gwh_bset( 'arrival_email' ) ) {
		$until = gmdate( 'Y-m-d', strtotime( $today . ' +' . max( 1, absint( gwh_bset( 'arrival_days' ) ) ) . ' days' ) );
		foreach ( gwh_automation_bookings( array(
			array( 'key' => '_gwh_arrival', 'value' => array( $today, $until ), 'compare' => 'BETWEEN' ),
			array( 'key' => '_gwh_arrival_sent', 'compare' => 'NOT EXISTS' ),
		) ) as $id ) {
			gwh_send_arrival_email( $id );
		}
	}

	if ( '1' === (string) gwh_bset( 'review_email' ) ) {
		$from = gmdate( 'Y-m-d', strtotime( $today . ' -7 days' ) );
		$to   = gmdate( 'Y-m-d', strtotime( $today . ' -1 day' ) );
		foreach ( gwh_automation_bookings( array(
			array( 'key' => '_gwh_departure', 'value' => array( $from, $to ), 'compare' => 'BETWEEN' ),
			array( 'key' => '_gwh_review_sent', 'compare' => 'NOT EXISTS' ),
		) ) as $id ) {
			gwh_send_review_email( $id );
		}
	}
}
add_action( 'gwh_hourly', 'gwh_run_automation', 20 );

/**
 * Health check shown on the settings page: whether the hourly jobs are actually running.
 */
function gwh_mark_cron_ran() {
	update_option( 'gwh_cron_last_run', time(), false );
}
add_action( 'gwh_hourly', 'gwh_mark_cron_ran', 99 );

function gwh_cron_health() {
	$last = (int) get_option( 'gwh_cron_last_run', 0 );
	return array(
		'last'    => $last,
		'healthy' => $last && time() - $last < 3 * HOUR_IN_SECONDS,
		'server'  => defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON,
	);
}
