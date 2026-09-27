<?php
/**
 * Enquiry form handler. Every enquiry is emailed and also saved under
 * Dashboard → Enquiries, so nothing is lost if email delivery fails.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function gwh_register_enquiries() {
	register_post_type( 'gwh_enquiry', array(
		'labels'          => array(
			'name'          => __( 'Enquiries', 'gasworks-house' ),
			'singular_name' => __( 'Enquiry', 'gasworks-house' ),
		),
		'public'          => false,
		'show_ui'         => true,
		'menu_icon'       => 'dashicons-email-alt',
		'menu_position'   => 25,
		'supports'        => array( 'title', 'editor' ),
		'capability_type' => 'post',
		'capabilities'    => array( 'create_posts' => 'do_not_allow' ),
		'map_meta_cap'    => true,
	) );
}
add_action( 'init', 'gwh_register_enquiries' );

function gwh_enquiry_fields() {
	return array(
		'name'      => __( 'Name', 'gasworks-house' ),
		'email'     => __( 'Email', 'gasworks-house' ),
		'phone'     => __( 'Phone', 'gasworks-house' ),
		'party'     => __( 'Occasion', 'gasworks-house' ),
		'arrival'   => __( 'Arrival', 'gasworks-house' ),
		'departure' => __( 'Departure', 'gasworks-house' ),
		'guests'    => __( 'Group size', 'gasworks-house' ),
		'message'   => __( 'Message', 'gasworks-house' ),
	);
}

function gwh_handle_enquiry() {
	$back = home_url( '/' );

	if ( ! isset( $_POST['gwh_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['gwh_nonce'] ) ), 'gwh_enquiry' ) ) {
		wp_safe_redirect( add_query_arg( 'enquiry', 'error', $back ) . '#enquire' );
		exit;
	}

	// Honeypot: real people never fill this in.
	if ( ! empty( $_POST['website'] ) ) {
		wp_safe_redirect( add_query_arg( 'enquiry', 'sent', $back ) . '#enquire' );
		exit;
	}

	$data = array();
	foreach ( array_keys( gwh_enquiry_fields() ) as $key ) {
		$raw          = isset( $_POST[ $key ] ) ? wp_unslash( $_POST[ $key ] ) : '';
		$data[ $key ] = 'message' === $key ? sanitize_textarea_field( $raw ) : sanitize_text_field( $raw );
	}
	$data['email'] = sanitize_email( $data['email'] );
	if ( ! in_array( $data['party'], array( 'Hen party', 'Stag party', 'Joint hen & stag', 'Other celebration' ), true ) ) {
		$data['party'] = 'Other celebration';
	}

	// Link-stuffed messages are spam.
	if ( preg_match_all( '#https?://#i', $data['message'] ) > 2 ) {
		wp_safe_redirect( add_query_arg( 'enquiry', 'sent', $back ) . '#enquire' );
		exit;
	}

	if ( '' === $data['name'] || ! is_email( $data['email'] ) ) {
		wp_safe_redirect( add_query_arg( 'enquiry', 'invalid', $back ) . '#enquire' );
		exit;
	}

	$body = '';
	foreach ( gwh_enquiry_fields() as $key => $label ) {
		if ( '' !== $data[ $key ] ) {
			$body .= $label . ': ' . $data[ $key ] . "\n";
		}
	}

	$title = sprintf( '%s – %s (%s)', $data['party'], $data['name'], $data['arrival'] ? $data['arrival'] : 'dates TBC' );

	wp_insert_post( array(
		'post_type'    => 'gwh_enquiry',
		'post_status'  => 'private',
		'post_title'   => $title,
		'post_content' => $body,
	) );

	$to = gwh_mod( 'contact_email' ) ? gwh_mod( 'contact_email' ) : get_option( 'admin_email' );
	wp_mail(
		$to,
		'New enquiry: ' . $title,
		$body,
		array( 'Reply-To: ' . $data['name'] . ' <' . $data['email'] . '>' )
	);

	wp_safe_redirect( add_query_arg( 'enquiry', 'sent', $back ) . '#enquire' );
	exit;
}
add_action( 'admin_post_nopriv_gwh_enquiry', 'gwh_handle_enquiry' );
add_action( 'admin_post_gwh_enquiry', 'gwh_handle_enquiry' );

/**
 * Fresh nonce for the form. Page caches (e.g. Hostinger's LiteSpeed Cache) can serve the
 * homepage long after its embedded nonce expires, so main.js swaps in a current one.
 */
function gwh_fresh_nonce() {
	nocache_headers();
	wp_send_json_success( wp_create_nonce( 'gwh_enquiry' ) );
}
add_action( 'wp_ajax_nopriv_gwh_nonce', 'gwh_fresh_nonce' );
add_action( 'wp_ajax_gwh_nonce', 'gwh_fresh_nonce' );
