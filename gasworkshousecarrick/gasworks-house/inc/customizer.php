<?php
/**
 * Customizer: Appearance → Customize → Gasworks House.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function gwh_customize_register( $wp_customize ) {
	$wp_customize->add_panel( 'gwh', array(
		'title'    => __( 'Gasworks House', 'gasworks-house' ),
		'priority' => 20,
	) );

	$lines_help = __( 'One item per line.', 'gasworks-house' );
	$pipe_help  = __( 'One per line, as: Title | Description', 'gasworks-house' );

	$sections = array(
		'gwh_hero'    => array(
			'title'  => __( 'Hero & SEO', 'gasworks-house' ),
			'fields' => array(
				'hero_image'       => array( 'image', __( 'Hero photo (landscape, at least 2000px wide)', 'gasworks-house' ) ),
				'hero_eyebrow'     => array( 'text', __( 'Small text above heading', 'gasworks-house' ) ),
				'hero_heading'     => array( 'text', __( 'Heading', 'gasworks-house' ) ),
				'hero_text'        => array( 'textarea', __( 'Intro text', 'gasworks-house' ) ),
				'meta_description' => array( 'textarea', __( 'Google description (about 155 characters)', 'gasworks-house' ) ),
			),
		),
		'gwh_contact' => array(
			'title'  => __( 'Booking & contact', 'gasworks-house' ),
			'fields' => array(
				'airbnb_url'    => array( 'url', __( 'Airbnb listing URL', 'gasworks-house' ) ),
				'contact_email' => array( 'email', __( 'Email (enquiries are sent here; defaults to the site admin email)', 'gasworks-house' ) ),
				'contact_phone' => array( 'text', __( 'Phone', 'gasworks-house' ) ),
				'whatsapp'      => array( 'text', __( 'WhatsApp number (e.g. 087 123 4567)', 'gasworks-house' ) ),
				'instagram_url' => array( 'url', __( 'Instagram URL', 'gasworks-house' ) ),
				'facebook_url'  => array( 'url', __( 'Facebook URL', 'gasworks-house' ) ),
				'tiktok_url'    => array( 'url', __( 'TikTok URL', 'gasworks-house' ) ),
			),
		),
		'gwh_house'   => array(
			'title'  => __( 'The house', 'gasworks-house' ),
			'fields' => array(
				'sleeps'        => array( 'text', __( 'Sleeps (guests)', 'gasworks-house' ) ),
				'bedrooms'      => array( 'text', __( 'Bedrooms', 'gasworks-house' ) ),
				'bathrooms'     => array( 'text', __( 'Bathrooms', 'gasworks-house' ) ),
				'min_nights'    => array( 'text', __( 'Minimum nights', 'gasworks-house' ) ),
				'about_heading' => array( 'text', __( 'Heading', 'gasworks-house' ) ),
				'about_text'    => array( 'textarea', __( 'Description (blank line between paragraphs)', 'gasworks-house' ) ),
				'features'      => array( 'textarea', __( 'Features. ', 'gasworks-house' ) . $lines_help ),
			),
		),
		'gwh_gallery' => array(
			'title'  => __( 'Photo gallery', 'gasworks-house' ),
			'fields' => array(),
		),
		'gwh_parties' => array(
			'title'  => __( 'Hens & stags', 'gasworks-house' ),
			'fields' => array(
				'hen_intro'  => array( 'text', __( 'Hen intro', 'gasworks-house' ) ),
				'hen_items'  => array( 'textarea', __( 'Hen ideas. ', 'gasworks-house' ) . $lines_help ),
				'stag_intro' => array( 'text', __( 'Stag intro', 'gasworks-house' ) ),
				'stag_items' => array( 'textarea', __( 'Stag ideas. ', 'gasworks-house' ) . $lines_help ),
			),
		),
		'gwh_area'    => array(
			'title'  => __( 'Things to do & location', 'gasworks-house' ),
			'fields' => array(
				'things'         => array( 'textarea', __( 'Things to do. ', 'gasworks-house' ) . $pipe_help ),
				'address_street' => array( 'text', __( 'Street address (optional, used for Google)', 'gasworks-house' ) ),
				'map_query'      => array( 'text', __( 'Map location (address or Eircode)', 'gasworks-house' ) ),
				'getting_here'   => array( 'textarea', __( 'Getting here. ', 'gasworks-house' ) . $pipe_help ),
			),
		),
		'gwh_social'  => array(
			'title'  => __( 'Reviews & FAQ', 'gasworks-house' ),
			'fields' => array(
				'reviews' => array( 'textarea', __( 'Guest reviews, one per line, as: Quote | Name. Section is hidden while empty.', 'gasworks-house' ) ),
				'faq'     => array( 'textarea', __( 'FAQ, one per line, as: Question | Answer', 'gasworks-house' ) ),
			),
		),
	);

	for ( $i = 1; $i <= 8; $i++ ) {
		/* translators: %d: photo number */
		$sections['gwh_gallery']['fields'][ 'gallery_' . $i ] = array( 'image', sprintf( __( 'Photo %d', 'gasworks-house' ), $i ) );
	}

	$defaults  = gwh_defaults();
	$sanitizer = array(
		'text'     => 'sanitize_text_field',
		'textarea' => 'sanitize_textarea_field',
		'url'      => 'esc_url_raw',
		'email'    => 'sanitize_email',
		'image'    => 'absint',
	);

	foreach ( $sections as $section_id => $section ) {
		$wp_customize->add_section( $section_id, array(
			'title' => $section['title'],
			'panel' => 'gwh',
		) );

		foreach ( $section['fields'] as $key => $field ) {
			list( $type, $label ) = $field;
			$wp_customize->add_setting( $key, array(
				'default'           => isset( $defaults[ $key ] ) ? $defaults[ $key ] : '',
				'sanitize_callback' => $sanitizer[ $type ],
			) );

			if ( 'image' === $type ) {
				$wp_customize->add_control( new WP_Customize_Media_Control( $wp_customize, $key, array(
					'label'     => $label,
					'section'   => $section_id,
					'mime_type' => 'image',
				) ) );
			} else {
				$wp_customize->add_control( $key, array(
					'label'   => $label,
					'section' => $section_id,
					'type'    => $type,
				) );
			}
		}
	}
}
add_action( 'customize_register', 'gwh_customize_register' );
