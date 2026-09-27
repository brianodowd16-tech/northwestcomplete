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
		'hero_text'        => 'A boutique, whole-house stay minutes from Carrick\'s pubs, boats and late bars. Bring the crew — we\'ve got the space, the style and the local know-how.',
		'meta_description' => 'Gasworks House is a boutique hen and stag party house in Carrick-on-Shannon, Co. Leitrim. Whole-house stays for groups, a short stroll from the town\'s pubs, bars and river.',

		// Booking & contact.
		'airbnb_url'       => '',
		'contact_email'    => '',
		'contact_phone'    => '',
		'whatsapp'         => '',
		'instagram_url'    => '',
		'facebook_url'     => '',
		'tiktok_url'       => '',

		// Key facts.
		'sleeps'           => '12',
		'bedrooms'         => '5',
		'bathrooms'        => '3',
		'min_nights'       => '2',

		// The house.
		'about_heading'    => 'Industrial bones. Boutique finish. Built for a big weekend.',
		'about_text'       => "Gasworks House takes its name from Carrick's old gasworks — and keeps a bit of that industrial character, with warm, stylish interiors designed for groups who want to celebrate properly.\n\nThere's room for everyone to get ready together, a big table for the pre-drinks and the morning-after fry, and comfortable beds to crash into when the night is done. The town's pubs, restaurants and the River Shannon are a short walk away, so nobody needs to be the designated driver.",
		'features'         => "Whole-house exclusive use — no strangers, no sharing\nBig kitchen & dining table for the whole group\nOpen-plan living space for pre-drinks and games\nBluetooth speaker ready for the playlist\nFast Wi-Fi & smart TV\nMirrors, plugs and space for the full glam squad\nFresh linen & towels provided\nShort walk to Carrick's pubs, bars and restaurants",

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
