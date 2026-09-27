<?php
/**
 * Gasworks House theme setup.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GWH_VERSION', '1.0.0' );

require get_template_directory() . '/inc/defaults.php';
require get_template_directory() . '/inc/customizer.php';
require get_template_directory() . '/inc/enquiry.php';

/**
 * Theme mod with a sensible default.
 */
function gwh_mod( $key ) {
	$defaults = gwh_defaults();
	return get_theme_mod( $key, isset( $defaults[ $key ] ) ? $defaults[ $key ] : '' );
}

/**
 * Split a textarea theme mod into lines, optionally splitting each line on "|".
 *
 * @return array Array of strings, or arrays of trimmed parts when $split is true.
 */
function gwh_lines( $key, $split = false ) {
	$lines = preg_split( '/\r\n|\r|\n/', (string) gwh_mod( $key ) );
	$out   = array();
	foreach ( $lines as $line ) {
		$line = trim( $line );
		if ( '' === $line ) {
			continue;
		}
		$out[] = $split ? array_map( 'trim', explode( '|', $line, 2 ) ) + array( '', '' ) : $line;
	}
	return $out;
}

function gwh_setup() {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'custom-logo', array( 'height' => 80, 'width' => 240, 'flex-width' => true, 'flex-height' => true ) );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );
	add_theme_support( 'responsive-embeds' );
	register_nav_menus( array( 'primary' => __( 'Primary menu', 'gasworks-house' ) ) );
}
add_action( 'after_setup_theme', 'gwh_setup' );

function gwh_assets() {
	wp_enqueue_style( 'gwh-fonts', 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Manrope:wght@400;500;700&display=swap', array(), null );
	wp_enqueue_style( 'gwh-main', get_template_directory_uri() . '/assets/css/main.css', array(), GWH_VERSION );
	wp_enqueue_script( 'gwh-main', get_template_directory_uri() . '/assets/js/main.js', array(), GWH_VERSION, true );
}
add_action( 'wp_enqueue_scripts', 'gwh_assets' );

function gwh_preconnect( $urls, $relation ) {
	if ( 'preconnect' === $relation ) {
		$urls[] = array( 'href' => 'https://fonts.gstatic.com', 'crossorigin' );
	}
	return $urls;
}
add_filter( 'wp_resource_hints', 'gwh_preconnect', 10, 2 );

/**
 * Meta description, Open Graph and structured data on the front page.
 */
function gwh_head_meta() {
	if ( ! is_front_page() ) {
		return;
	}
	$desc  = gwh_mod( 'meta_description' );
	$title = get_bloginfo( 'name' );
	$image = gwh_mod( 'hero_image' ) ? wp_get_attachment_image_url( gwh_mod( 'hero_image' ), 'large' ) : '';

	echo '<meta name="description" content="' . esc_attr( $desc ) . "\">\n";
	echo '<meta property="og:type" content="website">' . "\n";
	echo '<meta property="og:title" content="' . esc_attr( $title ) . "\">\n";
	echo '<meta property="og:description" content="' . esc_attr( $desc ) . "\">\n";
	echo '<meta property="og:url" content="' . esc_url( home_url( '/' ) ) . "\">\n";
	if ( $image ) {
		echo '<meta property="og:image" content="' . esc_url( $image ) . "\">\n";
	}

	$schema = array(
		'@context'    => 'https://schema.org',
		'@type'       => 'LodgingBusiness',
		'name'        => $title,
		'description' => $desc,
		'url'         => home_url( '/' ),
		'address'     => array(
			'@type'           => 'PostalAddress',
			'streetAddress'   => gwh_mod( 'address_street' ),
			'addressLocality' => 'Carrick-on-Shannon',
			'addressRegion'   => 'Co. Leitrim',
			'addressCountry'  => 'IE',
		),
	);
	if ( gwh_mod( 'contact_phone' ) ) {
		$schema['telephone'] = gwh_mod( 'contact_phone' );
	}
	if ( gwh_mod( 'contact_email' ) ) {
		$schema['email'] = gwh_mod( 'contact_email' );
	}
	if ( $image ) {
		$schema['image'] = $image;
	}
	echo '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "</script>\n";
}
add_action( 'wp_head', 'gwh_head_meta', 1 );

/**
 * Digits-only phone number for tel: and wa.me links.
 */
function gwh_phone_digits( $phone ) {
	$digits = preg_replace( '/[^0-9+]/', '', (string) $phone );
	return $digits;
}

function gwh_whatsapp_url() {
	$num = ltrim( gwh_phone_digits( gwh_mod( 'whatsapp' ) ), '+' );
	if ( '' === $num ) {
		return '';
	}
	// Irish numbers entered in local format (087 ...) become 35387...
	if ( 0 === strpos( $num, '0' ) ) {
		$num = '353' . substr( $num, 1 );
	}
	return 'https://wa.me/' . $num;
}

/**
 * Primary booking URL: Airbnb listing if set, otherwise the enquiry form.
 */
function gwh_book_url() {
	$airbnb = gwh_mod( 'airbnb_url' );
	return $airbnb ? $airbnb : '#enquire';
}
