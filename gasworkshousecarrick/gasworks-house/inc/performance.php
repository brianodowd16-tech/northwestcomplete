<?php
/**
 * Speed: trim what WordPress adds to every page, and get the hero photo moving first.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function gwh_trim_head() {
	remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
	remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
	remove_action( 'admin_print_styles', 'print_emoji_styles' );
	remove_filter( 'the_content_feed', 'wp_staticize_emoji' );
	remove_filter( 'wp_mail', 'wp_staticize_emoji_for_email' );
	remove_action( 'wp_head', 'wp_generator' );
	remove_action( 'wp_head', 'rsd_link' );
	remove_action( 'wp_head', 'wlwmanifest_link' );
	remove_action( 'wp_head', 'wp_shortlink_wp_head' );
	remove_action( 'wp_head', 'wp_oembed_add_discovery_links' );
	remove_action( 'wp_head', 'rest_output_link_wp_head' );
	remove_action( 'wp_head', 'feed_links_extra', 3 );
}
add_action( 'init', 'gwh_trim_head' );

/**
 * Block editor styles are only needed on pages written with blocks (the policy pages).
 * The designed pages are built by the theme and don't use them.
 */
function gwh_trim_styles() {
	$designed = is_front_page() || is_404() || ( is_page() && get_page_template_slug() );
	if ( $designed || ( is_singular() && ! has_blocks( get_queried_object_id() ) ) ) {
		wp_dequeue_style( 'wp-block-library' );
		wp_dequeue_style( 'wp-block-library-theme' );
		wp_dequeue_style( 'global-styles' );
		wp_dequeue_style( 'classic-theme-styles' );
	}
}
add_action( 'wp_enqueue_scripts', 'gwh_trim_styles', 100 );

/**
 * Preload the hero photo (the largest thing on screen) so it starts with the HTML.
 */
function gwh_preload_hero() {
	if ( ! is_front_page() && ! is_page() ) {
		return;
	}
	$priority = is_front_page() ? ' fetchpriority="high"' : '';
	printf( '<link rel="preload" as="image" href="%s" media="(max-width: 760px)"%s>' . "\n", esc_url( gwh_hero_url( 'small' ) ), $priority ); // phpcs:ignore WordPress.Security.EscapeOutput
	printf( '<link rel="preload" as="image" href="%s" media="(min-width: 761px)"%s>' . "\n", esc_url( gwh_hero_url() ), $priority ); // phpcs:ignore WordPress.Security.EscapeOutput
}
add_action( 'wp_head', 'gwh_preload_hero', 2 );

/** Let the browser open the font connection early too. */
function gwh_preconnect_fonts( $urls, $relation ) {
	if ( 'preconnect' === $relation ) {
		$urls[] = 'https://fonts.googleapis.com';
	}
	return $urls;
}
add_filter( 'wp_resource_hints', 'gwh_preconnect_fonts', 10, 2 );

/** Bookings are private: keep them (and the booking CPT) out of the XML sitemap and search. */
function gwh_sitemap_post_types( $types ) {
	unset( $types['gwh_booking'] );
	return $types;
}
add_filter( 'wp_sitemaps_post_types', 'gwh_sitemap_post_types' );

/** Payment return pages (?booking=…) are the home page with a message: don't index them. */
function gwh_robots( $robots ) {
	if ( isset( $_GET['booking'] ) || isset( $_GET['gwh_pay'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		$robots['noindex'] = true;
	}
	return $robots;
}
add_filter( 'wp_robots', 'gwh_robots' );
