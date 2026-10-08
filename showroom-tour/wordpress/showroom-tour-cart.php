<?php
/**
 * Plugin Name:       Showroom Tour Cart Link
 * Description:       Lets the 360° showroom tour hand its whole cart to WooCommerce. A link such as /?showroom_cart=123:1,456:2 adds those products (or variations) to the cart and opens the cart page.
 * Version:           1.0.0
 * Requires Plugins:  woocommerce
 * License:           GPL-2.0-or-later
 */

defined( 'ABSPATH' ) || exit;

// Runs at the same point as WooCommerce's own ?add-to-cart handler.
add_action( 'wp_loaded', 'showroom_tour_cart_link', 20 );

function showroom_tour_cart_link() {
	if ( empty( $_GET['showroom_cart'] ) || ! function_exists( 'WC' ) || ! WC()->cart ) {
		return;
	}

	nocache_headers();

	if ( WC()->session && ! WC()->session->has_session() ) {
		WC()->session->set_customer_session_cookie( true );
	}

	$raw   = sanitize_text_field( wp_unslash( $_GET['showroom_cart'] ) );
	$pairs = array_slice( explode( ',', $raw ), 0, 50 );

	foreach ( $pairs as $pair ) {
		$parts = array_map( 'absint', explode( ':', $pair, 2 ) );
		$id    = $parts[0] ?? 0;
		$qty   = min( $parts[1] ?? 1, 99 );
		if ( ! $id || ! $qty ) {
			continue;
		}

		$product = wc_get_product( $id );
		if ( ! $product || ! $product->is_purchasable() ) {
			wc_add_notice( __( 'A product from the showroom tour is no longer available.', 'showroom-tour' ), 'notice' );
			continue;
		}

		// WooCommerce resolves a variation id to its parent product itself.
		WC()->cart->add_to_cart( $id, $qty );
	}

	wp_safe_redirect( wc_get_cart_url() );
	exit;
}
