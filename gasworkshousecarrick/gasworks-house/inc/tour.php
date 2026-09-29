<?php
/**
 * Photo tour: rooms in order, each with its photos.
 *
 * Built-in photos live in assets/img/tour/. A photo only appears once its file exists, so new
 * shots can be dropped in without code changes. Photos chosen in Appearance → Customize →
 * Gasworks House → Photo tour replace the built-in set.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GWH_TOUR_SLOTS = 20;

/**
 * Built-in rooms. 'beds' is shown as a badge; leave empty for rooms without beds.
 */
function gwh_tour_rooms_default() {
	// Ordered as a walk through the house: downstairs, up the stairwell, then upstairs.
	return array(
		array(
			'name'   => __( 'Kitchen & living', 'gasworks-house' ),
			'note'   => __( 'Open-plan kitchen, dining and lounge around a wood-burning stove, with one big table for the whole group.', 'gasworks-house' ),
			'photos' => array(
				'kitchen-living' => __( 'Open-plan kitchen and living room with the wood-burning stove lit and a long dining table', 'gasworks-house' ),
				'kitchen-stove'  => __( 'Kitchen units, wood-burning stove and sofa', 'gasworks-house' ),
				'kitchen-dining' => __( 'Dining table looking through to the lounge and hallway', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'The Long Room', 'gasworks-house' ),
			'beds'   => __( '6 singles + 2 add-in beds · sleeps 8', 'gasworks-house' ),
			'note'   => __( 'The big one: a row of single beds, bedside lockers and space for everyone\'s cases, plus two add-in beds.', 'gasworks-house' ),
			'photos' => array(
				'long-room' => __( 'Long bedroom with six single beds in a row', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'The Window Room', 'gasworks-house' ),
			'beds'   => __( '4 single beds', 'gasworks-house' ),
			'note'   => __( 'Bright and airy, with a big window, a dressing table and mirror, and fresh linen and towels on every bed.', 'gasworks-house' ),
			'photos' => array(
				'bedroom-window' => __( 'Bedroom with four single beds, large window and dressing table', 'gasworks-house' ),
				'bedroom-quad'   => __( 'The same bedroom from the doorway, towels laid out on each bed', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'The Bunk Room', 'gasworks-house' ),
			'beds'   => __( '2 bunk beds · sleeps 4', 'gasworks-house' ),
			'note'   => __( 'Downstairs. Two sets of bunks for the crew who\'ll be up latest.', 'gasworks-house' ),
			'photos' => array(
				'bunk-room' => __( 'Downstairs bunk room', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'The Stairwell', 'gasworks-house' ),
			'note'   => __( 'A striking white staircase with turned spindles, rising from the tiled hall to the mezzanine.', 'gasworks-house' ),
			'photos' => array(
				'stairwell' => __( 'White staircase with turned spindles rising from the tiled entrance hall', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'The Mezzanine', 'gasworks-house' ),
			'beds'   => __( '3 double sofa beds · sleeps 6', 'gasworks-house' ),
			'note'   => __( 'Upstairs. A lounge on the landing with red leather sofas under a skylight, which fold out into three sofa beds sleeping two each.', 'gasworks-house' ),
			'photos' => array(
				'mezzanine' => __( 'Upstairs mezzanine lounge with red leather sofas, pine floor and skylight', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'The Attic Room', 'gasworks-house' ),
			'beds'   => __( '3 singles + 2 add-in beds · sleeps 5', 'gasworks-house' ),
			'note'   => __( 'Tucked under the eaves, with a sloped ceiling, pine floorboards and room for two add-in beds.', 'gasworks-house' ),
			'photos' => array(
				'attic-room' => __( 'Attic bedroom with three single beds and a sloped timber ceiling', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'The Twin Room', 'gasworks-house' ),
			'beds'   => __( '2 singles + 1 add-in bed · sleeps 3', 'gasworks-house' ),
			'note'   => __( 'Upstairs, under a big skylight. Two single beds and an add-in bed.', 'gasworks-house' ),
			'photos' => array(
				'twin-room' => __( 'Upstairs twin bedroom with two single beds under a skylight', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'Main bathroom', 'gasworks-house' ),
			'note'   => __( 'A big bathroom with a walk-in shower and a full-length mirror.', 'gasworks-house' ),
			'photos' => array(
				'bathroom' => __( 'Large bathroom with corner shower and full-length mirror', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'Shower room', 'gasworks-house' ),
			'note'   => __( 'A tiled wet-room shower, so nobody queues for long.', 'gasworks-house' ),
			'photos' => array(
				'shower-room' => __( 'Tiled wet-room shower with pedestal basin', 'gasworks-house' ),
			),
		),
		array(
			'name'   => __( 'Party room', 'gasworks-house' ),
			'note'   => __( 'A big open room with sliding doors: a blank canvas for decorations, games and pre-drinks.', 'gasworks-house' ),
			'photos' => array(
				'party-room' => __( 'Large open room with tiled floor and sliding doors', 'gasworks-house' ),
			),
		),
	);
}

/**
 * Rooms with resolved photo URLs. A room may have no photos yet.
 *
 * @return array[] Each: name, note, beds, photos[] (full, thumb, alt).
 */
function gwh_tour() {
	$custom = gwh_tour_from_customizer();
	if ( $custom ) {
		return $custom;
	}
	$dir   = get_template_directory() . '/assets/img/tour/';
	$uri   = get_template_directory_uri() . '/assets/img/tour/';
	$rooms = array();
	foreach ( gwh_tour_rooms_default() as $room ) {
		$photos = array();
		foreach ( $room['photos'] as $file => $alt ) {
			if ( file_exists( $dir . $file . '.webp' ) ) {
				$photos[] = array(
					'full'  => $uri . $file . '.webp',
					'thumb' => $uri . $file . '-720.webp',
					'alt'   => $alt,
				);
			}
		}
		// Rooms stay in the tour before their photos arrive; the page shows a card for them.
		$rooms[] = array(
			'name'   => $room['name'],
			'note'   => $room['note'],
			'beds'   => isset( $room['beds'] ) ? $room['beds'] : '',
			'photos' => $photos,
		);
	}
	return $rooms;
}

/**
 * Photos picked in the Customizer, grouped into rooms by their "Room | description" label.
 */
function gwh_tour_from_customizer() {
	$rooms = array();
	for ( $i = 1; $i <= GWH_TOUR_SLOTS; $i++ ) {
		$id = absint( get_theme_mod( 'tour_photo_' . $i ) );
		if ( ! $id || ! wp_get_attachment_image_url( $id, 'full' ) ) {
			continue;
		}
		$parts = array_map( 'trim', explode( '|', (string) get_theme_mod( 'tour_label_' . $i, '' ), 2 ) ) + array( '', '' );
		$name  = '' !== $parts[0] ? $parts[0] : __( 'The house', 'gasworks-house' );
		if ( ! isset( $rooms[ $name ] ) ) {
			$rooms[ $name ] = array( 'name' => $name, 'note' => $parts[1], 'beds' => '', 'photos' => array() );
		}
		if ( '' === $rooms[ $name ]['note'] ) {
			$rooms[ $name ]['note'] = $parts[1];
		}
		$alt                        = get_post_meta( $id, '_wp_attachment_image_alt', true );
		$rooms[ $name ]['photos'][] = array(
			'full'  => wp_get_attachment_image_url( $id, 'full' ),
			'thumb' => wp_get_attachment_image_url( $id, 'medium_large' ),
			'alt'   => $alt ? $alt : $name,
		);
	}
	return array_values( $rooms );
}
