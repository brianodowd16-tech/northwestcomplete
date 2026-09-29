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
		'hero_eyebrow'     => 'Carrick-on-Shannon · Co. Roscommon',
		'hero_heading'     => 'The party house for hens & stags on the Shannon.',
		'hero_text'        => 'A whole-house stay for groups of up to 30, minutes from Carrick\'s pubs, boats and late bars. Bring the whole crew. We\'ve got the space and the local know-how.',
		'meta_description' => 'Gasworks House is a hen and stag party house on Station Road, Carrick-on-Shannon, sleeping up to 30. Whole-house stays for big groups, a short stroll from the town\'s pubs and river.',

		// Booking & contact.
		'airbnb_url'       => 'https://www.airbnb.ie/rooms/50016674',
		'airbnb_embed'     => true,
		'contact_email'    => 'stay@gasworkshousecarrick.com',
		'contact_phone'    => '086 174 2808',
		'whatsapp'         => '086 174 2808',
		'instagram_url'    => '',
		'facebook_url'     => '',
		'tiktok_url'       => '',

		// Key facts.
		'sleeps'           => '30',
		'bedrooms'         => '5',
		'bathrooms'        => '3',

		// The house.
		'about_heading'    => 'Big rooms for a big group. Built for a big weekend.',
		'about_text'       => "Gasworks House is set up for groups who want to stay together. The heart of the house is an open-plan kitchen and living room with a wood-burning stove and one long table, so the whole group can eat, drink and plan the night together. Upstairs there's a second lounge on the landing for a quieter chat.\n\nThe bedrooms are laid out with single beds, so nobody has to argue over who shares, and every bed comes made up with fresh linen and towels. There's a big open party room for the balloons, the games and the pre-drinks, plus a large bathroom and a separate wet-room shower to keep the morning queue moving.",
		'features'         => "Whole-house exclusive use, with no strangers and no sharing\nOpen-plan kitchen and living room with a wood-burning stove\nOne long dining table for the whole group\nSecond lounge upstairs with leather sofas\nGroup bedrooms with single beds, fresh linen and towels\nBig open party room with sliding doors\nLarge bathroom plus a separate wet-room shower\nShort walk to Carrick's pubs, bars and restaurants",

		// Hens & stags.
		'hen_intro'        => 'Sashes, prosecco and a river full of boats — Carrick was made for hen parties.',
		'hen_items'        => "Afternoon tea or bottomless brunch in town\nCocktail & prosecco boat trips on the Shannon\nPamper sessions and in-house make-up artists\nDress-up themed nights along Main Street & Bridge Street\nLate bars and live music until the early hours",
		'stag_intro'       => 'Boats, banter and a town full of pubs — the classic Irish stag, done right.',
		'stag_items'       => "Shannon party boats & self-drive cruiser hire\nKayaking, zip-lining and outdoor adventure nearby\nGolf for the lads who swear they came for the golf\nPub crawls with live trad and sport on every screen\nBBQs and a big fry-up to reset the next morning",

		// Things to do.
		'things'           => "Shannon boat trips | Cruise the river on a party boat or hire your own cruiser, right from the town quay.\nPubs & live music | Carrick's famous strip of pubs and late bars is all within walking distance.\nLough Key Forest Park | Treetop walks, the Zipit adventure course and boating, a short drive away.\nKayaking & watersports | Paddle the Shannon with local outdoor adventure providers.\nGolf | Plenty of courses in the area for a more civilised morning.\nFood & brunch | From bottomless brunch to late-night chips — the town has you covered.",

		// Getting here.
		'address_street'   => 'Station Road',
		'eircode'          => 'N41 DW99',
		'map_query'        => 'Gasworks House, Station Road, Carrick-on-Shannon, N41 DW99',
		'maps_listing_url' => 'https://maps.app.goo.gl/3nEyjx7tibjEiE2k9',
		'getting_here'     => "By car | About 2 hours from Dublin on the N4.\nBy train | Direct trains from Dublin Connolly on the Sligo line stop in Carrick-on-Shannon.\nBy air | Under an hour from Ireland West Airport Knock.",

		// Reviews (left empty: add real guest reviews only).
		'reviews'          => '',

		// FAQ.
		'faq'              => "Do you take hen and stag groups? | Yes — that's exactly who Gasworks House is for. Tell us about your group when you send your request.\nHow do we book? | Pick your dates in the calendar, send a request, and we'll confirm within 24 hours with deposit details. Your dates are held while we check. You can also book through Airbnb.\nIs there a minimum stay? | Yes. The minimum is shown in the key facts at the top of the page, and the calendar won't let you pick a shorter stay.\nCan you help organise activities? | Absolutely. Let us know what you're planning and we'll point you to trusted local boats, bars and activity providers.\nCan we decorate the house? | Of course — balloons and banners are welcome. We just ask for no confetti, glitter or anything stuck to the walls.\nAre there house rules? | We ask groups to keep noise down late at night out of respect for our neighbours, and to treat the house as if it were your own. The full rules are shared when you book.",
	);
}
