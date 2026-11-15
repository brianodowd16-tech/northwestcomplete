<?php
/**
 * Site pages and menus.
 *
 * The homepage shows every section. Each section also has its own page (The House, Hens &
 * Stags, and so on) so they appear under Pages in WordPress, get their own address for Google,
 * and can carry your own intro text. Pages and menus are created once, the first time an admin
 * opens the dashboard after this theme version is installed. Nothing that already exists is
 * changed or duplicated.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GWH_PAGES_VERSION = 1;

/**
 * Pages the theme provides, keyed by section.
 */
function gwh_site_pages() {
	return array(
		'house'        => array(
			'slug'     => 'the-house',
			'title'    => __( 'The House', 'gasworks-house' ),
			'template' => 'page-templates/house.php',
			'menu'     => 'primary',
			'intro'    => __( 'A whole-house stay for up to 30 on Station Road, Carrick-on-Shannon: six bedrooms, two lounges, a big open party room and a kitchen built around a wood-burning stove. Take the tour, room by room.', 'gasworks-house' ),
		),
		'parties'      => array(
			'slug'     => 'hens-and-stags',
			'title'    => __( 'Hens & Stags', 'gasworks-house' ),
			'template' => 'page-templates/parties.php',
			'menu'     => 'primary',
			'intro'    => __( 'Carrick-on-Shannon is made for celebrations, and Gasworks House is made for the group. Here are a few ideas for the weekend.', 'gasworks-house' ),
		),
		'carrick'      => array(
			'slug'     => 'carrick-on-shannon',
			'title'    => __( 'Carrick-on-Shannon', 'gasworks-house' ),
			'template' => 'page-templates/carrick.php',
			'menu'     => 'primary',
			'intro'    => __( 'Boats, pubs, live music and the River Shannon, all a short walk from the house.', 'gasworks-house' ),
		),
		'faq'          => array(
			'slug'     => 'faq',
			'title'    => __( 'FAQ', 'gasworks-house' ),
			'template' => 'page-templates/faq.php',
			'menu'     => 'primary',
			'intro'    => __( 'Everything groups usually ask before they book. Can\'t see your question? Message us on WhatsApp.', 'gasworks-house' ),
		),
		'book'         => array(
			'slug'     => 'book',
			'title'    => __( 'Book', 'gasworks-house' ),
			'template' => 'page-templates/book.php',
			'menu'     => '', // The header's "Check dates" button already links here.
			'intro'    => __( 'Pick your dates, see your price, and book direct.', 'gasworks-house' ),
		),
		'contact'      => array(
			'slug'     => 'contact',
			'title'    => __( 'Contact', 'gasworks-house' ),
			'template' => 'page-templates/contact.php',
			'menu'     => 'primary',
			'intro'    => __( 'Questions about dates, the house or your plans? Message, call or email us, we\'re happy to help.', 'gasworks-house' ),
		),
		'terms'        => array(
			'slug'     => 'terms-and-conditions',
			'title'    => __( 'Terms & Conditions', 'gasworks-house' ),
			'menu'     => 'footer',
			'draft'    => true,
		),
		'cancellation' => array(
			'slug'     => 'cancellation-policy',
			'title'    => __( 'Cancellation Policy', 'gasworks-house' ),
			'menu'     => 'footer',
			'draft'    => true,
		),
		'privacy'      => array(
			'slug'     => 'privacy-policy',
			'title'    => __( 'Privacy Policy', 'gasworks-house' ),
			'menu'     => 'footer',
			'draft'    => true,
		),
	);
}

/**
 * The page for a section, if it exists and is published.
 */
function gwh_site_page( $key ) {
	$ids = get_option( 'gwh_page_ids', array() );
	if ( 'privacy' === $key && (int) get_option( 'wp_page_for_privacy_policy' ) ) {
		$ids['privacy'] = (int) get_option( 'wp_page_for_privacy_policy' );
	}
	$id = isset( $ids[ $key ] ) ? (int) $ids[ $key ] : 0;
	return $id && 'publish' === get_post_status( $id ) ? get_post( $id ) : null;
}

/**
 * Where a section lives: an anchor on the homepage, otherwise its own page, otherwise the
 * homepage section.
 */
function gwh_section_url( $key, $anchor = '' ) {
	$anchor = $anchor ? $anchor : $key;
	if ( is_front_page() ) {
		return '#' . $anchor;
	}
	$page = gwh_site_page( $key );
	return $page ? get_permalink( $page ) : home_url( '/#' . $anchor );
}

function gwh_register_footer_menu() {
	register_nav_menus( array( 'footer' => __( 'Footer links', 'gasworks-house' ) ) );
}
add_action( 'after_setup_theme', 'gwh_register_footer_menu' );

/**
 * Create any missing pages and menus. Safe to run more than once.
 */
function gwh_setup_site_pages() {
	if ( ! current_user_can( 'edit_pages' ) ) {
		return;
	}
	$ids = get_option( 'gwh_page_ids', array() );

	foreach ( gwh_site_pages() as $key => $page ) {
		if ( ! empty( $ids[ $key ] ) && get_post( $ids[ $key ] ) && 'trash' !== get_post_status( $ids[ $key ] ) ) {
			continue;
		}

		// Use the privacy page WordPress already made, filling it with our draft only if it's untouched.
		if ( 'privacy' === $key && (int) get_option( 'wp_page_for_privacy_policy' ) ) {
			$wp_privacy = get_post( (int) get_option( 'wp_page_for_privacy_policy' ) );
			if ( $wp_privacy && 'trash' !== $wp_privacy->post_status ) {
				if ( 'draft' === $wp_privacy->post_status && $wp_privacy->post_modified === $wp_privacy->post_date ) {
					wp_update_post( array( 'ID' => $wp_privacy->ID, 'post_content' => gwh_draft_content( 'privacy' ) ) );
				}
				$ids[ $key ] = $wp_privacy->ID;
				continue;
			}
		}

		// Reuse a page with the same address rather than making a duplicate.
		$existing = get_posts( array(
			'post_type'   => 'page',
			'name'        => $page['slug'],
			'post_status' => array( 'publish', 'draft', 'private', 'pending' ),
			'numberposts' => 1,
		) );
		if ( $existing ) {
			$ids[ $key ] = $existing[0]->ID;
			if ( ! empty( $page['template'] ) && ! get_page_template_slug( $existing[0]->ID ) ) {
				update_post_meta( $existing[0]->ID, '_wp_page_template', $page['template'] );
			}
			continue;
		}

		$id = wp_insert_post( array(
			'post_type'    => 'page',
			'post_status'  => empty( $page['draft'] ) ? 'publish' : 'draft',
			'post_title'   => $page['title'],
			'post_name'    => $page['slug'],
			'post_content' => empty( $page['draft'] ) ? '<!-- wp:paragraph --><p>' . esc_html( $page['intro'] ) . '</p><!-- /wp:paragraph -->' : gwh_draft_content( $key ),
		) );
		if ( $id && ! is_wp_error( $id ) ) {
			$ids[ $key ] = $id;
			if ( ! empty( $page['template'] ) ) {
				update_post_meta( $id, '_wp_page_template', $page['template'] );
			}
		}
	}
	update_option( 'gwh_page_ids', $ids, false );

	gwh_setup_menu( 'primary', __( 'Main menu', 'gasworks-house' ), $ids );
	gwh_setup_menu( 'footer', __( 'Footer links', 'gasworks-house' ), $ids );
	update_option( 'gwh_pages_version', GWH_PAGES_VERSION );
}

/**
 * Build a menu for a location, unless the location already has one.
 */
function gwh_setup_menu( $location, $name, $ids ) {
	$locations = get_theme_mod( 'nav_menu_locations', array() );
	$assigned  = ! empty( $locations[ $location ] ) ? wp_get_nav_menu_object( $locations[ $location ] ) : false;
	if ( $assigned && wp_get_nav_menu_items( $assigned->term_id ) ) {
		return; // A menu with links is already in place: leave it alone.
	}
	// An empty menu (e.g. carried over from a previous theme) gets filled; otherwise make one.
	$menu    = $assigned ? $assigned : wp_get_nav_menu_object( $name );
	$menu_id = $menu ? $menu->term_id : wp_create_nav_menu( $name );
	if ( is_wp_error( $menu_id ) ) {
		return;
	}
	if ( ! wp_get_nav_menu_items( $menu_id ) ) {
		$position = 1;
		foreach ( gwh_site_pages() as $key => $page ) {
			if ( $page['menu'] !== $location || empty( $ids[ $key ] ) ) {
				continue;
			}
			wp_update_nav_menu_item( $menu_id, 0, array(
				'menu-item-object-id' => $ids[ $key ],
				'menu-item-object'    => 'page',
				'menu-item-type'      => 'post_type',
				'menu-item-status'    => 'publish',
				'menu-item-position'  => $position++,
			) );
		}
	}
	$locations[ $location ] = $menu_id;
	set_theme_mod( 'nav_menu_locations', $locations );
}

function gwh_maybe_setup_site_pages() {
	if ( (int) get_option( 'gwh_pages_version' ) < GWH_PAGES_VERSION ) {
		gwh_setup_site_pages();
	}
}
add_action( 'admin_init', 'gwh_maybe_setup_site_pages' );
add_action( 'after_switch_theme', 'gwh_maybe_setup_site_pages' );

/**
 * Remind the owner that the policy pages are drafts awaiting review.
 */
function gwh_draft_pages_notice() {
	$screen = get_current_screen();
	if ( ! $screen || ! in_array( $screen->id, array( 'dashboard', 'edit-page' ), true ) || ! current_user_can( 'edit_pages' ) ) {
		return;
	}
	$ids    = get_option( 'gwh_page_ids', array() );
	$drafts = array();
	foreach ( array( 'terms', 'cancellation', 'privacy' ) as $key ) {
		if ( ! empty( $ids[ $key ] ) && 'draft' === get_post_status( $ids[ $key ] ) ) {
			$drafts[] = '<a href="' . esc_url( get_edit_post_link( $ids[ $key ] ) ) . '">' . esc_html( get_the_title( $ids[ $key ] ) ) . '</a>';
		}
	}
	if ( $drafts ) {
		echo '<div class="notice notice-warning"><p><strong>' . esc_html__( 'Gasworks House:', 'gasworks-house' ) . '</strong> ' .
			esc_html__( 'these policy pages are drafts written for you to review. Fill in the [bracketed] parts, have them checked, then publish them. They appear in the footer once published:', 'gasworks-house' ) .
			' ' . implode( ', ', $drafts ) . '</p></div>'; // phpcs:ignore WordPress.Security.EscapeOutput
	}
}
add_action( 'admin_notices', 'gwh_draft_pages_notice' );

/**
 * Starter text for the policy pages. Written to match how the site actually works, with
 * [brackets] where the owner must decide. To be reviewed before publishing.
 */
function gwh_draft_content( $key ) {
	$p   = function ( $text ) {
		return '<!-- wp:paragraph --><p>' . $text . '</p><!-- /wp:paragraph -->';
	};
	$h   = function ( $text ) {
		return '<!-- wp:heading --><h2 class="wp-block-heading">' . $text . '</h2><!-- /wp:heading -->';
	};
	$ul  = function ( $items ) {
		return '<!-- wp:list --><ul class="wp-block-list"><li>' . implode( '</li><li>', $items ) . '</li></ul><!-- /wp:list -->';
	};
	$note = $p( '<strong>Draft for review:</strong> this text was written to match how bookings work on this website. Fill in the [bracketed] parts and have it checked before publishing. Delete this paragraph when you publish.' );
	$who  = 'Gasworks House, Station Road, Carrick-on-Shannon, Co. Roscommon, N41 DW99 (stay@gasworkshousecarrick.com, 086 174 2808)';

	switch ( $key ) {
		case 'terms':
			return $note
				. $p( 'These terms apply to bookings of Gasworks House made through this website. By booking, the lead guest accepts them on behalf of the whole group. Gasworks House is run by [legal name of owner or company], ' . $who . '.' )
				. $h( 'Booking and payment' )
				. $ul( array(
					'A booking is confirmed when we receive your deposit of 30% of the total and send you a confirmation email.',
					'The balance is charged automatically to the card used for the deposit 14 days before arrival. Bookings made within 14 days of arrival are paid in full at the time of booking.',
					'If the balance payment fails, we will email you a link to pay. If it is still unpaid [X] days before arrival, we may cancel the booking under our Cancellation Policy.',
					'Prices are for the whole house and include up to 12 guests; additional guests are charged per person per night as shown at the time of booking.',
				) )
				. $h( 'Damage deposit' )
				. $p( 'The day before arrival we place a hold of €300 on your card. It is a hold, not a charge, and is released automatically 2 days after check-out. If there is damage, breakages, excessive cleaning or a breach of the house rules, we may take some or all of it and will tell you why.' )
				. $h( 'Your stay' )
				. $ul( array(
					'Check-in is from 4pm and check-out is by 11am.',
					'The maximum number of guests is 30. Only guests named in the booking may stay overnight.',
					'The lead guest must be [18 / 21] or over and present for the stay, and is responsible for the group.',
					'Please keep noise down late at night out of respect for our neighbours.',
					'No confetti, glitter or anything stuck to the walls. [No smoking inside the house.] [Pets policy.]',
					'We may end a stay without refund in the case of serious damage, danger to others or repeated breach of these terms.',
				) )
				. $h( 'Add-ons' )
				. $p( 'Add-ons such as the Moon River cruise are subject to availability. We will confirm your sailing time. If an add-on cannot go ahead, we will refund its price.' )
				. $h( 'Liability' )
				. $p( '[Your liability wording, for example: we are not responsible for loss of or damage to guests\' belongings, except where caused by our negligence. Nothing in these terms affects your statutory rights as a consumer.]' )
				. $h( 'Questions' )
				. $p( 'Contact us at ' . $who . '.' );

		case 'cancellation':
			return $note
				. $p( 'We understand plans change. This policy applies to bookings made directly through this website. Bookings made through Airbnb follow the policy shown on Airbnb.' )
				. $h( 'If you cancel' )
				. $ul( array(
					'More than [X] days before arrival: [the 30% deposit is non-refundable / refunded less €X].',
					'Between [X] and 14 days before arrival: [the deposit is non-refundable].',
					'Less than 14 days before arrival (after the balance is paid): [no refund, unless we can re-let the dates].',
				) )
				. $p( 'To cancel, email stay@gasworkshousecarrick.com. Refunds go back to the card used to pay within [5–10] working days.' )
				. $h( 'If we cancel' )
				. $p( 'If we have to cancel for reasons within our control, we will refund everything you have paid in full.' )
				. $h( 'Changing your dates' )
				. $p( '[Whether date changes are allowed, and any fee.]' );

		case 'privacy':
			return $note
				. $p( 'This policy explains what personal data Gasworks House collects through this website and how we use it. The data controller is [legal name of owner or company], ' . $who . '.' )
				. $h( 'What we collect' )
				. $ul( array(
					'When you book or send a request: your name, email address, phone number, dates, group size, occasion and any message you send.',
					'When you pay: payments are handled by Stripe. We do not see or store your full card number. Stripe stores your card so the balance and damage-deposit hold can be taken, as explained when you book.',
					'When you contact us by WhatsApp, phone or email: the details you choose to share.',
				) )
				. $h( 'How we use it' )
				. $p( 'We use your details to manage your booking, take payments, send booking emails and answer your questions (to perform our contract with you), and to keep records we are legally required to keep. We do not sell your data or use it for marketing without your consent.' )
				. $h( 'Who we share it with' )
				. $ul( array(
					'Stripe, to process payments.',
					'Our website host [Hostinger] and email provider, to run the site and send emails.',
					'Airbnb receives only the dates you have booked (to keep calendars in sync), never your name or details.',
					'Moon River, if you book the cruise add-on: [the group size and date only].',
				) )
				. $h( 'How long we keep it' )
				. $p( 'We keep booking records for [6] years for accounting and tax purposes, then delete them.' )
				. $h( 'Your rights' )
				. $p( 'You can ask to see, correct or delete your data, or object to how we use it, by emailing stay@gasworkshousecarrick.com. You can also complain to the Data Protection Commission (dataprotection.ie).' )
				. $h( 'Cookies' )
				. $p( 'This site uses only the cookies it needs to work. [If you add analytics, describe them here.]' );
	}
	return '';
}

/**
 * Hide menu links to pages that aren't published yet (e.g. the draft policy pages), so
 * visitors never land on a "page not found".
 */
function gwh_hide_unpublished_menu_items( $items ) {
	return array_values( array_filter( $items, function ( $item ) {
		return 'post_type' !== $item->type || 'publish' === get_post_status( $item->object_id );
	} ) );
}
add_filter( 'wp_nav_menu_objects', 'gwh_hide_unpublished_menu_items' );
