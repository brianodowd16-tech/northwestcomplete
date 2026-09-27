<?php
/**
 * Booking admin: Bookings list with Confirm / Decline, booking editor, and Bookings → Settings.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* ---------- Bookings list ---------- */

function gwh_booking_columns() {
	return array(
		'cb'           => '<input type="checkbox">',
		'title'        => __( 'Booking', 'gasworks-house' ),
		'gwh_dates'    => __( 'Dates', 'gasworks-house' ),
		'gwh_guests'   => __( 'Guests', 'gasworks-house' ),
		'gwh_status'   => __( 'Status', 'gasworks-house' ),
		'gwh_total'    => __( 'Total', 'gasworks-house' ),
		'gwh_contact'  => __( 'Contact', 'gasworks-house' ),
	);
}
add_filter( 'manage_gwh_booking_posts_columns', 'gwh_booking_columns' );

function gwh_booking_column( $column, $post_id ) {
	$b = gwh_booking( $post_id );
	switch ( $column ) {
		case 'gwh_dates':
			if ( gwh_is_date( $b['arrival'] ) && gwh_is_date( $b['departure'] ) ) {
				echo esc_html( gwh_nice_date( $b['arrival'] ) . ' → ' . gwh_nice_date( $b['departure'] ) );
				echo '<br><span class="description">' . esc_html( count( gwh_nights( $b['arrival'], $b['departure'] ) ) . ' nights' ) . '</span>';
			}
			break;
		case 'gwh_guests':
			echo esc_html( $b['guests'] );
			break;
		case 'gwh_status':
			$labels = gwh_booking_statuses();
			$status = isset( $labels[ $b['status'] ] ) ? $b['status'] : 'pending';
			printf( '<span class="gwh-pill gwh-%1$s">%2$s</span>', esc_attr( $status ), esc_html( $labels[ $status ] ) );
			if ( 'pending' === $status && $b['created'] ) {
				$left = (int) $b['created'] + absint( gwh_bset( 'hold_days' ) ) * DAY_IN_SECONDS - time();
				/* translators: %s: time left */
				echo '<br><span class="description">' . esc_html( $left > 0 ? sprintf( __( 'Hold ends in %s', 'gasworks-house' ), human_time_diff( time(), time() + $left ) ) : __( 'Hold ended', 'gasworks-house' ) ) . '</span>';
			}
			break;
		case 'gwh_total':
			echo (float) $b['total'] > 0 ? esc_html( gwh_money( $b['total'] ) ) : '–';
			break;
		case 'gwh_contact':
			if ( $b['email'] ) {
				echo '<a href="mailto:' . esc_attr( $b['email'] ) . '">' . esc_html( $b['email'] ) . '</a><br>';
			}
			echo esc_html( $b['phone'] );
			break;
	}
}
add_action( 'manage_gwh_booking_posts_custom_column', 'gwh_booking_column', 10, 2 );

/**
 * Upcoming stays first.
 */
function gwh_booking_list_order( $query ) {
	if ( is_admin() && $query->is_main_query() && 'gwh_booking' === $query->get( 'post_type' ) && ! $query->get( 'orderby' ) ) {
		$query->set( 'meta_key', '_gwh_arrival' );
		$query->set( 'orderby', 'meta_value' );
		$query->set( 'order', 'DESC' );
	}
}
add_action( 'pre_get_posts', 'gwh_booking_list_order' );

function gwh_action_url( $action, $post_id ) {
	return wp_nonce_url( admin_url( 'admin-post.php?action=gwh_' . $action . '&post=' . $post_id ), 'gwh_' . $action . '_' . $post_id );
}

function gwh_booking_row_actions( $actions, $post ) {
	if ( 'gwh_booking' !== $post->post_type ) {
		return $actions;
	}
	$status = get_post_meta( $post->ID, '_gwh_status', true );
	$new    = array();
	if ( in_array( $status, array( 'pending', 'expired' ), true ) ) {
		$new['gwh_confirm'] = '<a href="' . esc_url( gwh_action_url( 'confirm', $post->ID ) ) . '"><strong>' . esc_html__( 'Confirm & email guest', 'gasworks-house' ) . '</strong></a>';
		$new['gwh_decline'] = '<a href="' . esc_url( gwh_action_url( 'decline', $post->ID ) ) . '" onclick="return confirm(\'Decline this request and email the guest?\')">' . esc_html__( 'Decline', 'gasworks-house' ) . '</a>';
	}
	unset( $actions['inline hide-if-no-js'] );
	return $new + $actions;
}
add_filter( 'post_row_actions', 'gwh_booking_row_actions', 10, 2 );

function gwh_handle_status_action( $action ) {
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;
	check_admin_referer( 'gwh_' . $action . '_' . $post_id );
	if ( ! $post_id || 'gwh_booking' !== get_post_type( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( esc_html__( 'Sorry, you can\'t do that.', 'gasworks-house' ) );
	}

	$b      = gwh_booking( $post_id );
	$notice = '';

	if ( 'confirm' === $action ) {
		if ( ! gwh_is_available( $b['arrival'], $b['departure'], $post_id ) ) {
			$notice = 'conflict';
		} else {
			update_post_meta( $post_id, '_gwh_status', 'confirmed' );
			$b['status'] = 'confirmed';
			gwh_mail_guest(
				$b,
				'Your booking is confirmed',
				"Great news: your stay at " . get_bloginfo( 'name' ) . " is confirmed!\n\n"
					. gwh_booking_summary( $b )
					. "\n\n" . gwh_bset( 'payment_instructions' )
					. "\n\nWe'll send the address and check-in details before you arrive. Any questions, just reply to this email."
			);
			$notice = 'confirmed';
		}
	} else {
		update_post_meta( $post_id, '_gwh_status', 'declined' );
		gwh_mail_guest(
			$b,
			'About your booking request',
			"Thanks for your interest in " . get_bloginfo( 'name' ) . ". Unfortunately we can't accept your request for "
				. gwh_nice_date( $b['arrival'] ) . ' to ' . gwh_nice_date( $b['departure'] )
				. ".\n\nIf your dates are flexible, have a look at the calendar on our website or reply to this email and we'll help you find another weekend."
		);
		$notice = 'declined';
	}

	wp_safe_redirect( admin_url( 'edit.php?post_type=gwh_booking&gwh_notice=' . $notice ) );
	exit;
}
add_action( 'admin_post_gwh_confirm', function () {
	gwh_handle_status_action( 'confirm' );
} );
add_action( 'admin_post_gwh_decline', function () {
	gwh_handle_status_action( 'decline' );
} );

function gwh_booking_admin_notices() {
	$screen = get_current_screen();
	if ( ! $screen || 'gwh_booking' !== $screen->post_type ) {
		return;
	}
	$notice   = isset( $_GET['gwh_notice'] ) ? sanitize_key( $_GET['gwh_notice'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	$messages = array(
		'confirmed' => array( 'success', __( 'Booking confirmed. The guest has been emailed your payment instructions.', 'gasworks-house' ) ),
		'declined'  => array( 'info', __( 'Request declined and the guest has been emailed.', 'gasworks-house' ) ),
		'conflict'  => array( 'error', __( 'Not confirmed: those dates now clash with another booking (possibly from Airbnb). Check the calendar before confirming.', 'gasworks-house' ) ),
		'overlap'   => array( 'warning', __( 'Saved, but heads up: these dates overlap another booking or an Airbnb reservation.', 'gasworks-house' ) ),
	);
	if ( isset( $messages[ $notice ] ) ) {
		printf( '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>', esc_attr( $messages[ $notice ][0] ), esc_html( $messages[ $notice ][1] ) );
	}
	if ( ! gwh_bset( 'ical_import' ) ) {
		printf(
			'<div class="notice notice-warning"><p>%1$s <a href="%2$s">%3$s</a></p></div>',
			esc_html__( 'Your Airbnb calendar isn\'t connected yet, so Airbnb bookings won\'t block dates on your website.', 'gasworks-house' ),
			esc_url( admin_url( 'edit.php?post_type=gwh_booking&page=gwh-booking-settings' ) ),
			esc_html__( 'Connect it now', 'gasworks-house' )
		);
	}
}
add_action( 'admin_notices', 'gwh_booking_admin_notices' );

function gwh_booking_admin_css() {
	$screen = get_current_screen();
	if ( ! $screen || 'gwh_booking' !== $screen->post_type ) {
		return;
	}
	echo '<style>
		.gwh-pill{display:inline-block;padding:2px 10px;border-radius:99px;font-weight:600;background:#eee}
		.gwh-pending{background:#fff3cd;color:#7a5b00}.gwh-confirmed{background:#d1f5e4;color:#0b6b3f}
		.gwh-declined,.gwh-cancelled,.gwh-expired{background:#f1f1f1;color:#777}
		.gwh-fields th{width:170px}.gwh-fields input[type=text],.gwh-fields input[type=email],.gwh-fields textarea{width:100%;max-width:480px}
		.gwh-settings textarea{width:100%;max-width:640px}.gwh-code{display:block;padding:10px;background:#f6f7f7;border:1px solid #dcdcde;word-break:break-all;max-width:640px}
	</style>';
}
add_action( 'admin_head', 'gwh_booking_admin_css' );

/* ---------- Booking editor ---------- */

function gwh_booking_meta_box() {
	add_meta_box( 'gwh_booking_details', __( 'Booking details', 'gasworks-house' ), 'gwh_render_booking_box', 'gwh_booking', 'normal', 'high' );
}
add_action( 'add_meta_boxes', 'gwh_booking_meta_box' );

function gwh_render_booking_box( $post ) {
	$b = gwh_booking( $post->ID );
	if ( ! $b['status'] ) {
		$b['status'] = 'confirmed';
	}
	wp_nonce_field( 'gwh_save_booking', 'gwh_booking_nonce' );
	echo '<p class="description">' . esc_html__( 'Use this for phone or email bookings, or to block dates (e.g. for maintenance). Confirmed bookings and held requests block the dates on your website and on Airbnb.', 'gasworks-house' ) . '</p>';
	echo '<table class="form-table gwh-fields"><tbody>';

	$row = function ( $label, $html ) {
		echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td>' . $html . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput
	};
	$row( __( 'Arrival', 'gasworks-house' ), '<input type="date" name="gwh[arrival]" value="' . esc_attr( $b['arrival'] ) . '" required>' );
	$row( __( 'Departure', 'gasworks-house' ), '<input type="date" name="gwh[departure]" value="' . esc_attr( $b['departure'] ) . '" required>' );

	$options = '';
	foreach ( gwh_booking_statuses() as $value => $label ) {
		$options .= '<option value="' . esc_attr( $value ) . '"' . selected( $b['status'], $value, false ) . '>' . esc_html( $label ) . '</option>';
	}
	$row( __( 'Status', 'gasworks-house' ), '<select name="gwh[status]">' . $options . '</select>' );
	$row( __( 'Guests', 'gasworks-house' ), '<input type="number" min="0" name="gwh[guests]" value="' . esc_attr( $b['guests'] ) . '">' );
	$row( __( 'Total (€)', 'gasworks-house' ), '<input type="number" min="0" step="0.01" name="gwh[total]" value="' . esc_attr( $b['total'] ) . '">' );
	$row( __( 'Name', 'gasworks-house' ), '<input type="text" name="gwh[name]" value="' . esc_attr( $b['name'] ) . '">' );
	$row( __( 'Email', 'gasworks-house' ), '<input type="email" name="gwh[email]" value="' . esc_attr( $b['email'] ) . '">' );
	$row( __( 'Phone', 'gasworks-house' ), '<input type="text" name="gwh[phone]" value="' . esc_attr( $b['phone'] ) . '">' );
	$row( __( 'Occasion', 'gasworks-house' ), '<input type="text" name="gwh[party]" value="' . esc_attr( $b['party'] ) . '">' );
	$row( __( 'Message / notes', 'gasworks-house' ), '<textarea rows="5" name="gwh[message]">' . esc_textarea( $b['message'] ) . '</textarea>' );
	echo '</tbody></table>';

	if ( in_array( $b['status'], array( 'pending', 'expired' ), true ) && $b['email'] ) {
		echo '<p><a class="button button-primary" href="' . esc_url( gwh_action_url( 'confirm', $post->ID ) ) . '">' . esc_html__( 'Confirm & email guest', 'gasworks-house' ) . '</a> ';
		echo '<a class="button" href="' . esc_url( gwh_action_url( 'decline', $post->ID ) ) . '">' . esc_html__( 'Decline & email guest', 'gasworks-house' ) . '</a></p>';
	}
}

function gwh_save_booking( $post_id, $post ) {
	if ( ! isset( $_POST['gwh_booking_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['gwh_booking_nonce'] ) ), 'gwh_save_booking' ) ) {
		return;
	}
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	$in = isset( $_POST['gwh'] ) && is_array( $_POST['gwh'] ) ? wp_unslash( $_POST['gwh'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput

	$data = array(
		'arrival'   => gwh_is_date( $in['arrival'] ?? '' ) ? $in['arrival'] : '',
		'departure' => gwh_is_date( $in['departure'] ?? '' ) ? $in['departure'] : '',
		'status'    => array_key_exists( $in['status'] ?? '', gwh_booking_statuses() ) ? $in['status'] : 'confirmed',
		'guests'    => absint( $in['guests'] ?? 0 ),
		'total'     => max( 0, (float) ( $in['total'] ?? 0 ) ),
		'name'      => sanitize_text_field( $in['name'] ?? '' ),
		'email'     => sanitize_email( $in['email'] ?? '' ),
		'phone'     => sanitize_text_field( $in['phone'] ?? '' ),
		'party'     => sanitize_text_field( $in['party'] ?? '' ),
		'message'   => sanitize_textarea_field( $in['message'] ?? '' ),
	);
	if ( $data['arrival'] && $data['departure'] && $data['departure'] <= $data['arrival'] ) {
		$data['departure'] = '';
	}
	foreach ( $data as $k => $v ) {
		update_post_meta( $post_id, '_gwh_' . $k, $v );
	}
	if ( ! get_post_meta( $post_id, '_gwh_created', true ) ) {
		update_post_meta( $post_id, '_gwh_created', time() );
	}

	// Give untitled bookings a readable title.
	if ( '' === trim( $post->post_title ) || __( 'Auto Draft' ) === $post->post_title ) {
		remove_action( 'save_post_gwh_booking', 'gwh_save_booking', 10 );
		wp_update_post( array(
			'ID'         => $post_id,
			'post_title' => trim( ( $data['name'] ? $data['name'] : __( 'Blocked dates', 'gasworks-house' ) ) . ' (' . $data['arrival'] . ' → ' . $data['departure'] . ')' ),
		) );
		add_action( 'save_post_gwh_booking', 'gwh_save_booking', 10, 2 );
	}

	if ( $data['arrival'] && $data['departure'] && in_array( $data['status'], GWH_BLOCKING_STATUSES, true ) && ! gwh_is_available( $data['arrival'], $data['departure'], $post_id ) ) {
		add_filter( 'redirect_post_location', function ( $location ) {
			return add_query_arg( 'gwh_notice', 'overlap', $location );
		} );
	}
}
add_action( 'save_post_gwh_booking', 'gwh_save_booking', 10, 2 );

/* ---------- Settings ---------- */

function gwh_booking_settings_menu() {
	add_submenu_page( 'edit.php?post_type=gwh_booking', __( 'Booking settings', 'gasworks-house' ), __( 'Settings & Airbnb sync', 'gasworks-house' ), 'manage_options', 'gwh-booking-settings', 'gwh_render_booking_settings' );
}
add_action( 'admin_menu', 'gwh_booking_settings_menu' );

function gwh_register_booking_settings() {
	register_setting( 'gwh_booking', 'gwh_booking', array( 'sanitize_callback' => 'gwh_sanitize_booking_settings' ) );
}
add_action( 'admin_init', 'gwh_register_booking_settings' );

function gwh_sanitize_booking_settings( $in ) {
	$in  = is_array( $in ) ? $in : array();
	$out = array();
	$urls = array();
	foreach ( preg_split( '/\s+/', (string) ( $in['ical_import'] ?? '' ) ) as $url ) {
		$url = esc_url_raw( trim( $url ), array( 'https', 'http' ) );
		if ( $url ) {
			$urls[] = $url;
		}
	}
	$out['ical_import'] = implode( "\n", $urls );
	foreach ( array( 'nightly_rate', 'weekend_rate', 'cleaning_fee', 'damage_deposit' ) as $k ) {
		$out[ $k ] = '' === trim( (string) ( $in[ $k ] ?? '' ) ) ? '' : (string) max( 0, (float) $in[ $k ] );
	}
	$out['min_nights']           = (string) max( 1, absint( $in['min_nights'] ?? 1 ) );
	$out['hold_days']            = (string) max( 1, absint( $in['hold_days'] ?? 3 ) );
	$out['notify_email']         = sanitize_email( $in['notify_email'] ?? '' );
	$out['checkin_time']         = sanitize_text_field( $in['checkin_time'] ?? '' );
	$out['checkout_time']        = sanitize_text_field( $in['checkout_time'] ?? '' );
	$out['payment_instructions'] = sanitize_textarea_field( $in['payment_instructions'] ?? '' );
	return $out;
}

/**
 * Sync right after the settings are saved, and on "Sync now".
 */
add_action( 'update_option_gwh_booking', 'gwh_sync_calendars' );
add_action( 'add_option_gwh_booking', 'gwh_sync_calendars' );

function gwh_handle_sync_now() {
	check_admin_referer( 'gwh_sync_now' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'Sorry, you can\'t do that.', 'gasworks-house' ) );
	}
	gwh_sync_calendars();
	wp_safe_redirect( admin_url( 'edit.php?post_type=gwh_booking&page=gwh-booking-settings' ) );
	exit;
}
add_action( 'admin_post_gwh_sync_now', 'gwh_handle_sync_now' );

function gwh_render_booking_settings() {
	$sync = get_option( 'gwh_ical_sync', array() );
	$val  = function ( $key ) {
		$saved = get_option( 'gwh_booking', array() );
		return isset( $saved[ $key ] ) ? $saved[ $key ] : gwh_bset( $key );
	};
	?>
	<div class="wrap gwh-settings">
		<h1><?php esc_html_e( 'Booking settings & Airbnb sync', 'gasworks-house' ); ?></h1>

		<h2><?php esc_html_e( '1. Airbnb → your website', 'gasworks-house' ); ?></h2>
		<p><?php esc_html_e( 'In Airbnb go to Calendar → Availability → Connect to another website (Sync calendars) → Export calendar, copy the link, and paste it below. Airbnb bookings will then block dates on your website. The site re-checks every hour and right before accepting a request.', 'gasworks-house' ); ?></p>

		<?php if ( ! empty( $sync['time'] ) ) : ?>
			<p>
				<strong><?php esc_html_e( 'Last sync:', 'gasworks-house' ); ?></strong>
				<?php echo esc_html( human_time_diff( (int) $sync['time'] ) . ' ago – ' . ( $sync['ok'] ? '✅ ' : '⚠️ failed: ' ) . $sync['message'] ); ?>
			</p>
		<?php endif; ?>
		<?php if ( gwh_bset( 'ical_import' ) ) : ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="gwh_sync_now">
				<?php wp_nonce_field( 'gwh_sync_now' ); ?>
				<?php submit_button( __( 'Sync now', 'gasworks-house' ), 'secondary', 'submit', false ); ?>
			</form>
		<?php endif; ?>

		<h2><?php esc_html_e( '2. Your website → Airbnb', 'gasworks-house' ); ?></h2>
		<p><?php esc_html_e( 'In Airbnb go to Calendar → Availability → Connect to another website (Sync calendars) → Import calendar, paste this link and name it "Website". Airbnb will then block dates booked on your website. Airbnb refreshes imported calendars every few hours.', 'gasworks-house' ); ?></p>
		<code class="gwh-code"><?php echo esc_html( gwh_ical_export_url() ); ?></code>

		<form method="post" action="options.php">
			<?php settings_fields( 'gwh_booking' ); ?>
			<table class="form-table" role="presentation"><tbody>
				<tr>
					<th scope="row"><label for="gwh-ical"><?php esc_html_e( 'Airbnb calendar link (export)', 'gasworks-house' ); ?></label></th>
					<td>
						<textarea id="gwh-ical" name="gwh_booking[ical_import]" rows="3" placeholder="https://www.airbnb.ie/calendar/ical/50016674.ics?s=..."><?php echo esc_textarea( $val( 'ical_import' ) ); ?></textarea>
						<p class="description"><?php esc_html_e( 'One link per line. You can add other sites (e.g. Booking.com) too.', 'gasworks-house' ); ?></p>
					</td>
				</tr>
			</tbody></table>

			<h2><?php esc_html_e( '3. Prices & rules', 'gasworks-house' ); ?></h2>
			<table class="form-table" role="presentation"><tbody>
				<?php
				$fields = array(
					'nightly_rate'   => array( __( 'Price per night (€)', 'gasworks-house' ), __( 'For the whole house. Leave blank to hide prices and just take requests.', 'gasworks-house' ) ),
					'weekend_rate'   => array( __( 'Friday & Saturday night price (€)', 'gasworks-house' ), __( 'Optional. Leave blank to use the normal price.', 'gasworks-house' ) ),
					'cleaning_fee'   => array( __( 'Cleaning fee (€)', 'gasworks-house' ), '' ),
					'damage_deposit' => array( __( 'Refundable damage deposit (€)', 'gasworks-house' ), __( 'Shown to guests; not added to the total.', 'gasworks-house' ) ),
					'min_nights'     => array( __( 'Minimum nights', 'gasworks-house' ), '' ),
					'hold_days'      => array( __( 'Hold requested dates for (days)', 'gasworks-house' ), __( 'Requests block the dates for this long. If you don\'t confirm in time they expire and the dates free up.', 'gasworks-house' ) ),
				);
				foreach ( $fields as $key => $f ) :
					?>
					<tr>
						<th scope="row"><label for="gwh-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $f[0] ); ?></label></th>
						<td>
							<input id="gwh-<?php echo esc_attr( $key ); ?>" type="number" min="0" step="<?php echo in_array( $key, array( 'min_nights', 'hold_days' ), true ) ? '1' : '0.01'; ?>" name="gwh_booking[<?php echo esc_attr( $key ); ?>]" value="<?php echo esc_attr( $val( $key ) ); ?>" class="small-text" style="width:120px">
							<?php if ( $f[1] ) : ?><p class="description"><?php echo esc_html( $f[1] ); ?></p><?php endif; ?>
						</td>
					</tr>
				<?php endforeach; ?>
				<tr>
					<th scope="row"><?php esc_html_e( 'Check-in / check-out', 'gasworks-house' ); ?></th>
					<td>
						<input type="text" name="gwh_booking[checkin_time]" value="<?php echo esc_attr( $val( 'checkin_time' ) ); ?>" style="width:100px"> /
						<input type="text" name="gwh_booking[checkout_time]" value="<?php echo esc_attr( $val( 'checkout_time' ) ); ?>" style="width:100px">
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="gwh-notify"><?php esc_html_e( 'Send requests to', 'gasworks-house' ); ?></label></th>
					<td><input id="gwh-notify" type="email" name="gwh_booking[notify_email]" value="<?php echo esc_attr( $val( 'notify_email' ) ); ?>" class="regular-text" placeholder="<?php echo esc_attr( gwh_owner_email() ); ?>"></td>
				</tr>
				<tr>
					<th scope="row"><label for="gwh-pay"><?php esc_html_e( 'Payment instructions', 'gasworks-house' ); ?></label></th>
					<td>
						<textarea id="gwh-pay" name="gwh_booking[payment_instructions]" rows="9"><?php echo esc_textarea( $val( 'payment_instructions' ) ); ?></textarea>
						<p class="description"><?php esc_html_e( 'Emailed to the guest when you confirm. Add your bank details or a Stripe/Revolut payment link.', 'gasworks-house' ); ?></p>
					</td>
				</tr>
			</tbody></table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
