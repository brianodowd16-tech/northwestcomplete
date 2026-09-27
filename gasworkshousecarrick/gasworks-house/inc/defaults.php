<?php
/**
 * Default content. Everything here can be changed in Appearance → Customize → Gasworks House,
 * so there is no need to edit this file.
 *
 * @package gasworks-house
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function gwh_defaults() {
	return array(
		// Hero.
		'hero_image'       => '',
		'hero_eyebrow'     => 'Carrick-on-Shannon · Co. Leitrim',
		'hero_heading'     => 'The party house for hens & stags on the Shannon.',
		'hero_text'        => 'A whole-house stay for groups of up to 30, minutes from Carrick\'s pubs, boats and late bars. Bring the whole crew. We\'ve got the space and the local know-how.',
		'meta_description' => 'Gasworks House is a hen and stag party house in Carrick-on-Shannon, Co. Leitrim, sleeping up to 30. Whole-house stays for big groups, a short stroll from the town\'s pubs and river.',

		// Booking & contact.
		'airbnb_url'       => '',
		'contact_email'    => '',
		'contact_phone'    => '',
		'whatsapp'         => '',
		'instagram_url'    => '',
		'facebook_url'     => '',
		'tiktok_url'       => '',

		// Key facts.
		'sleeps'           => '30',
		'bedrooms'         => '5',
		'bathrooms'        => '3',
		'min_nights'       => '2',

		// The house.
		'about_heading'    => 'Big rooms for a big group. Built for a big weekend.',
		'about_text'       => "Gasworks House is set up for groups who want to stay together. The bright bedrooms are laid out with single beds, so nobody has to argue over who shares, and every bed comes made up with fresh linen and towels.\n\nDownstairs there's a huge open-plan room with sliding doors and a stove. It's a blank canvas for the balloons, the games and the pre-drinks. When it's time to get ready, there are mirrors and dressing tables in the bedrooms and a spacious bathroom with a walk-in shower.",
		'features'         => "Whole-house exclusive use, with no strangers and no sharing\nGroup bedrooms with single beds\nFresh linen and towels on every bed\nHuge open-plan party room with sliding doors\nStove for cosy nights in\nSpacious bathroom with walk-in shower\nMirrors and dressing tables for getting ready\nShort walk to Carrick's pubs, bars and restaurants",

		// Hens & stags.
		'hen_intro'        => 'Sashes, prosecco and a river full of boats — Carrick was made for hen parties.',
		'hen_items'        => "Afternoon tea or bottomless brunch in town\nCocktail & prosecco boat trips on the Shannon\nPamper sessions and in-house make-up artists\nDress-up themed nights along Main Street & Bridge Street\nLate bars and live music until the early hours",
		'stag_intro'       => 'Boats, banter and a town full of pubs — the classic Irish stag, done right.',
		'stag_items'       => "Shannon party boats & self-drive cruiser hire\nKayaking, zip-lining and outdoor adventure nearby\nGolf for the lads who swear they came for the golf\nPub crawls with live trad and sport on every screen\nBBQs and a big fry-up to reset the next morning",

		// Things to do.
		'things'           => "Shannon boat trips | Cruise the river on a party boat or hire your own cruiser, right from the town quay.\nPubs & live music | Carrick's famous strip of pubs and late bars is all within walking distance.\nLough Key Forest Park | Treetop walks, the Zipit adventure course and boating, a short drive away.\nKayaking & watersports | Paddle the Shannon with local outdoor adventure providers.\nGolf | Plenty of courses in the area for a more civilised morning.\nFood & brunch | From bottomless brunch to late-night chips — the town has you covered.",

		// Getting here.
		'address_street'   => '',
		'map_query'        => 'Carrick-on-Shannon, Co. Leitrim, Ireland',
		'getting_here'     => "By car | About 2 hours from Dublin on the N4.\nBy train | Direct trains from Dublin Connolly on the Sligo line stop in Carrick-on-Shannon.\nBy air | Under an hour from Ireland West Airport Knock.",

		// Reviews (left empty: add real guest reviews only).
		'reviews'          => '',

		// FAQ.
		'faq'              => "Do you take hen and stag groups? | Yes — that's exactly who Gasworks House is for. Tell us about your group when you enquire.\nHow do we book? | Book instantly through Airbnb, or send us an enquiry and we'll come back to you about availability.\nIs there a minimum stay? | Weekend bookings have a minimum stay — see the key facts above, or ask us about midweek.\nCan you help organise activities? | Absolutely. Let us know what you're planning and we'll point you to trusted local boats, bars and activity providers.\nCan we decorate the house? | Of course — balloons and banners are welcome. We just ask for no confetti, glitter or anything stuck to the walls.\nAre there house rules? | We ask groups to keep noise down late at night out of respect for our neighbours, and to treat the house as if it were your own. The full rules are shared when you book.",
	);
}
