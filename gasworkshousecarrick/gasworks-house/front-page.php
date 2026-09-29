<?php
/**
 * One-page home: hero, the house, photo tour, hens & stags, Carrick, reviews, FAQ, booking.
 *
 * @package gasworks-house
 */

get_header();

$gwh_airbnb   = gwh_mod( 'airbnb_url' );
$gwh_hero_url = gwh_hero_url();

$gwh_facts = array_filter( array(
	__( 'Sleeps up to', 'gasworks-house' ) => gwh_mod( 'sleeps' ),
	__( 'Bedrooms', 'gasworks-house' )   => gwh_mod( 'bedrooms' ),
	__( 'Bathrooms', 'gasworks-house' )  => gwh_mod( 'bathrooms' ),
	__( 'Min. nights', 'gasworks-house' ) => gwh_bset( 'min_nights' ),
) );
?>

<main id="main">

	<section class="hero<?php echo $gwh_hero_url ? ' has-image' : ''; ?>"<?php echo $gwh_hero_url ? ' style="--hero-image:url(\'' . esc_url( $gwh_hero_url ) . '\')"' : ''; ?>>
		<div class="hero-glow" aria-hidden="true"></div>
		<div class="wrap hero-inner">
			<p class="eyebrow"><?php echo esc_html( gwh_mod( 'hero_eyebrow' ) ); ?></p>
			<h1 class="hero-title"><?php echo esc_html( gwh_mod( 'hero_heading' ) ); ?></h1>
			<p class="hero-text"><?php echo esc_html( gwh_mod( 'hero_text' ) ); ?></p>
			<div class="hero-actions">
				<a class="btn" href="#book"><?php esc_html_e( 'Check availability', 'gasworks-house' ); ?></a>
				<a class="btn btn-ghost" href="#house"><?php esc_html_e( 'See the house', 'gasworks-house' ); ?></a>
			</div>
			<?php if ( $gwh_facts ) : ?>
				<dl class="facts">
					<?php foreach ( $gwh_facts as $gwh_label => $gwh_value ) : ?>
						<div class="fact"><dt><?php echo esc_html( $gwh_label ); ?></dt><dd><?php echo esc_html( $gwh_value ); ?></dd></div>
					<?php endforeach; ?>
				</dl>
			<?php endif; ?>
		</div>
		<div class="ticker" aria-hidden="true">
			<div class="ticker-track">
				<?php for ( $i = 0; $i < 2; $i++ ) : ?>
					<span>Hen parties</span><span>Stag weekends</span><span>Shannon boats</span><span>Late bars</span><span>Big breakfasts</span><span>Carrick-on-Shannon</span>
				<?php endfor; ?>
			</div>
		</div>
	</section>

	<section class="section" id="house">
		<div class="wrap split">
			<div>
				<p class="kicker"><?php esc_html_e( 'The house', 'gasworks-house' ); ?></p>
				<h2 class="section-title"><?php echo esc_html( gwh_mod( 'about_heading' ) ); ?></h2>
				<div class="prose"><?php echo wp_kses_post( wpautop( esc_html( gwh_mod( 'about_text' ) ) ) ); ?></div>
			</div>
			<ul class="feature-list">
				<?php foreach ( gwh_lines( 'features' ) as $gwh_feature ) : ?>
					<li><?php echo esc_html( $gwh_feature ); ?></li>
				<?php endforeach; ?>
			</ul>
		</div>
	</section>

	<?php
	$gwh_tour   = gwh_tour();
	$gwh_photos = array();
	foreach ( $gwh_tour as $gwh_r => $gwh_room ) {
		foreach ( $gwh_room['photos'] as $gwh_photo ) {
			$gwh_photos[] = $gwh_photo + array( 'room' => $gwh_r );
		}
	}
	?>
	<?php if ( $gwh_photos ) : ?>
		<?php $gwh_first = $gwh_tour[0]; ?>
		<section class="tour" id="tour" data-tour>
			<div class="wrap">
				<div class="tour-head">
					<div>
						<p class="kicker"><?php esc_html_e( 'Take the tour', 'gasworks-house' ); ?></p>
						<h2 class="section-title"><?php esc_html_e( 'Every room, before you arrive.', 'gasworks-house' ); ?></h2>
					</div>
					<p class="tour-count">
						<?php
						/* translators: 1: rooms, 2: photos */
						echo esc_html( sprintf( _n( '%1$d room', '%1$d rooms', count( $gwh_tour ), 'gasworks-house' ), count( $gwh_tour ) ) . ' · ' . sprintf( _n( '%d photo', '%d photos', count( $gwh_photos ), 'gasworks-house' ), count( $gwh_photos ) ) );
						?>
					</p>
				</div>

				<div class="tour-layout">
					<nav class="tour-rooms" aria-label="<?php esc_attr_e( 'Rooms', 'gasworks-house' ); ?>">
						<ol>
							<?php foreach ( $gwh_tour as $gwh_r => $gwh_room ) : ?>
								<li>
									<button type="button" class="tour-room" data-tour-room="<?php echo esc_attr( $gwh_r ); ?>"<?php echo 0 === $gwh_r ? ' aria-current="true"' : ''; ?>>
										<span class="tour-num"><?php echo esc_html( str_pad( $gwh_r + 1, 2, '0', STR_PAD_LEFT ) ); ?></span>
										<span class="tour-room-name"><?php echo esc_html( $gwh_room['name'] ); ?></span>
										<span class="tour-room-meta"><?php echo esc_html( $gwh_room['beds'] ? $gwh_room['beds'] : sprintf( _n( '%d photo', '%d photos', count( $gwh_room['photos'] ), 'gasworks-house' ), count( $gwh_room['photos'] ) ) ); ?></span>
									</button>
								</li>
							<?php endforeach; ?>
						</ol>
					</nav>

					<div class="tour-stage">
						<figure class="tour-figure">
							<button type="button" class="tour-open" data-tour-open aria-label="<?php esc_attr_e( 'View photo full screen', 'gasworks-house' ); ?>">
								<img class="tour-img" data-tour-img src="<?php echo esc_url( $gwh_photos[0]['full'] ); ?>" alt="<?php echo esc_attr( $gwh_photos[0]['alt'] ); ?>" decoding="async">
								<span class="tour-zoom" aria-hidden="true">⤢</span>
							</button>
							<button type="button" class="tour-arrow tour-prev" data-tour-step="-1" aria-label="<?php esc_attr_e( 'Previous photo', 'gasworks-house' ); ?>">‹</button>
							<button type="button" class="tour-arrow tour-next" data-tour-step="1" aria-label="<?php esc_attr_e( 'Next photo', 'gasworks-house' ); ?>">›</button>
							<figcaption class="tour-caption" aria-live="polite">
								<span class="tour-caption-top">
									<span class="tour-num" data-tour-num>01</span>
									<strong data-tour-name><?php echo esc_html( $gwh_first['name'] ); ?></strong>
									<span class="tour-beds" data-tour-beds<?php echo $gwh_first['beds'] ? '' : ' hidden'; ?>><?php echo esc_html( $gwh_first['beds'] ); ?></span>
									<span class="tour-counter" data-tour-counter>1 / <?php echo esc_html( count( $gwh_photos ) ); ?></span>
								</span>
								<span class="tour-note" data-tour-note><?php echo esc_html( $gwh_first['note'] ); ?></span>
							</figcaption>
						</figure>
					</div>
				</div>

				<div class="tour-strip" data-tour-strip>
					<?php foreach ( $gwh_photos as $gwh_i => $gwh_photo ) : ?>
						<a class="tour-thumb<?php echo 0 === $gwh_i ? ' is-active' : ''; ?>" href="<?php echo esc_url( $gwh_photo['full'] ); ?>" data-tour-index="<?php echo esc_attr( $gwh_i ); ?>">
							<img src="<?php echo esc_url( $gwh_photo['thumb'] ); ?>" alt="<?php echo esc_attr( $gwh_photo['alt'] ); ?>" loading="lazy" decoding="async" width="720" height="480">
							<span class="tour-thumb-num"><?php echo esc_html( str_pad( $gwh_photo['room'] + 1, 2, '0', STR_PAD_LEFT ) ); ?></span>
						</a>
					<?php endforeach; ?>
				</div>
			</div>
			<script type="application/json" data-tour-data><?php echo wp_json_encode( $gwh_tour, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP ); ?></script>
		</section>
	<?php endif; ?>

	<section class="section section-dark" id="parties">
		<div class="wrap">
			<p class="kicker"><?php esc_html_e( 'Hens & stags', 'gasworks-house' ); ?></p>
			<h2 class="section-title"><?php esc_html_e( 'Pick your party.', 'gasworks-house' ); ?></h2>

			<div class="party-tabs" role="tablist" aria-label="<?php esc_attr_e( 'Party type', 'gasworks-house' ); ?>">
				<button role="tab" id="tab-hen" aria-controls="panel-hen" aria-selected="true" class="party-tab is-hen" data-tab="hen"><?php esc_html_e( 'Hen party', 'gasworks-house' ); ?></button>
				<button role="tab" id="tab-stag" aria-controls="panel-stag" aria-selected="false" tabindex="-1" class="party-tab is-stag" data-tab="stag"><?php esc_html_e( 'Stag party', 'gasworks-house' ); ?></button>
			</div>

			<?php foreach ( array( 'hen', 'stag' ) as $gwh_type ) : ?>
				<div class="party-panel party-<?php echo esc_attr( $gwh_type ); ?>" role="tabpanel" id="panel-<?php echo esc_attr( $gwh_type ); ?>" aria-labelledby="tab-<?php echo esc_attr( $gwh_type ); ?>"<?php echo 'stag' === $gwh_type ? ' hidden' : ''; ?>>
					<p class="party-intro"><?php echo esc_html( gwh_mod( $gwh_type . '_intro' ) ); ?></p>
					<ol class="party-list">
						<?php foreach ( gwh_lines( $gwh_type . '_items' ) as $gwh_item ) : ?>
							<li><?php echo esc_html( $gwh_item ); ?></li>
						<?php endforeach; ?>
					</ol>
					<a class="btn" href="#book" data-party="<?php echo 'hen' === $gwh_type ? 'Hen party' : 'Stag party'; ?>">
						<?php echo 'hen' === $gwh_type ? esc_html__( 'Plan the hen', 'gasworks-house' ) : esc_html__( 'Plan the stag', 'gasworks-house' ); ?>
					</a>
				</div>
			<?php endforeach; ?>
		</div>
	</section>

	<section class="section" id="carrick">
		<div class="wrap">
			<p class="kicker"><?php esc_html_e( 'Carrick-on-Shannon', 'gasworks-house' ); ?></p>
			<h2 class="section-title"><?php esc_html_e( 'Ireland\'s favourite party town, on your doorstep.', 'gasworks-house' ); ?></h2>
			<div class="card-grid">
				<?php foreach ( gwh_lines( 'things', true ) as $gwh_n => $gwh_thing ) : ?>
					<article class="card">
						<span class="card-num"><?php echo esc_html( str_pad( $gwh_n + 1, 2, '0', STR_PAD_LEFT ) ); ?></span>
						<h3><?php echo esc_html( $gwh_thing[0] ); ?></h3>
						<?php if ( $gwh_thing[1] ) : ?>
							<p><?php echo esc_html( $gwh_thing[1] ); ?></p>
						<?php endif; ?>
					</article>
				<?php endforeach; ?>
			</div>

			<div class="split split-map">
				<div>
					<h3 class="sub-title"><?php esc_html_e( 'Getting here', 'gasworks-house' ); ?></h3>
					<dl class="travel">
						<?php foreach ( gwh_lines( 'getting_here', true ) as $gwh_way ) : ?>
							<div><dt><?php echo esc_html( $gwh_way[0] ); ?></dt><dd><?php echo esc_html( $gwh_way[1] ); ?></dd></div>
						<?php endforeach; ?>
					</dl>
				</div>
				<?php if ( gwh_mod( 'map_query' ) ) : ?>
					<div class="map">
						<iframe title="<?php esc_attr_e( 'Map of Carrick-on-Shannon', 'gasworks-house' ); ?>" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
							src="https://maps.google.com/maps?q=<?php echo rawurlencode( gwh_mod( 'map_query' ) ); ?>&amp;z=14&amp;output=embed"></iframe>
					</div>
				<?php endif; ?>
			</div>
		</div>
	</section>

	<?php $gwh_reviews = gwh_lines( 'reviews', true ); ?>
	<?php if ( $gwh_reviews ) : ?>
		<section class="section section-cream" id="reviews">
			<div class="wrap">
				<p class="kicker"><?php esc_html_e( 'Guest reviews', 'gasworks-house' ); ?></p>
				<h2 class="section-title"><?php esc_html_e( 'What the groups say.', 'gasworks-house' ); ?></h2>
				<div class="reviews">
					<?php foreach ( $gwh_reviews as $gwh_review ) : ?>
						<figure class="review">
							<blockquote><p><?php echo esc_html( $gwh_review[0] ); ?></p></blockquote>
							<?php if ( $gwh_review[1] ) : ?>
								<figcaption><?php echo esc_html( $gwh_review[1] ); ?></figcaption>
							<?php endif; ?>
						</figure>
					<?php endforeach; ?>
				</div>
			</div>
		</section>
	<?php endif; ?>

	<section class="section" id="faq">
		<div class="wrap narrow">
			<p class="kicker"><?php esc_html_e( 'Good to know', 'gasworks-house' ); ?></p>
			<h2 class="section-title"><?php esc_html_e( 'Questions, answered.', 'gasworks-house' ); ?></h2>
			<div class="faq">
				<?php foreach ( gwh_lines( 'faq', true ) as $gwh_q ) : ?>
					<details>
						<summary><?php echo esc_html( $gwh_q[0] ); ?></summary>
						<p><?php echo esc_html( $gwh_q[1] ); ?></p>
					</details>
				<?php endforeach; ?>
			</div>
		</div>
	</section>

	<section class="section section-dark" id="book">
		<div class="wrap">
			<p class="kicker"><?php esc_html_e( 'Book direct', 'gasworks-house' ); ?></p>
			<h2 class="section-title"><?php esc_html_e( 'Pick your dates.', 'gasworks-house' ); ?></h2>
			<p class="muted book-lead"><?php
			echo esc_html( gwh_payments_enabled()
				? __( 'Book directly with us and skip the booking-site fees. Choose your dates, pay your deposit securely, and you\'re confirmed straight away.', 'gasworks-house' )
				: __( 'Book directly with us and skip the booking-site fees. Choose your dates, send a request, and we\'ll confirm within 24 hours. Your dates are held while we check.', 'gasworks-house' ) );
			?></p>
			<?php $gwh_p = gwh_pricing(); ?>
			<?php if ( $gwh_p['weekday'] > 0 || $gwh_p['weekend'] > 0 ) : ?>
				<ul class="rates">
					<?php if ( $gwh_p['weekday'] > 0 ) : ?>
						<li><span><?php esc_html_e( 'Midweek (Sun–Thu)', 'gasworks-house' ); ?></span><strong><?php echo esc_html( gwh_money( $gwh_p['weekday'] ) ); ?></strong><em><?php esc_html_e( 'per night', 'gasworks-house' ); ?></em></li>
					<?php endif; ?>
					<?php if ( $gwh_p['weekend'] > 0 ) : ?>
						<li><span><?php esc_html_e( 'Weekend (Fri & Sat)', 'gasworks-house' ); ?></span><strong><?php echo esc_html( gwh_money( $gwh_p['weekend'] ) ); ?></strong><em><?php esc_html_e( 'per night', 'gasworks-house' ); ?></em></li>
					<?php endif; ?>
					<li class="rates-note">
						<?php
						/* translators: 1: included guests, 2: weekend extra, 3: midweek extra, 4: cleaning fee */
						echo esc_html( sprintf( __( 'Whole house for up to %1$d guests. Each extra guest is %2$s per night at weekends, %3$s midweek. %4$s cleaning fee per stay.', 'gasworks-house' ), $gwh_p['baseGuests'], gwh_money( $gwh_p['weekendExtra'] ), gwh_money( $gwh_p['weekdayExtra'] ), gwh_money( $gwh_p['cleaning'] ) ) );
						?>
					</li>
				</ul>
			<?php endif; ?>

			<div class="book-grid">
				<div class="book-cal">
					<div class="cal" data-cal aria-live="polite">
						<p class="muted"><?php esc_html_e( 'Loading availability…', 'gasworks-house' ); ?></p>
					</div>
					<ul class="cal-legend" aria-hidden="true">
						<li><span class="swatch swatch-free"></span><?php esc_html_e( 'Available', 'gasworks-house' ); ?></li>
						<li><span class="swatch swatch-booked"></span><?php esc_html_e( 'Booked', 'gasworks-house' ); ?></li>
						<li><span class="swatch swatch-picked"></span><?php esc_html_e( 'Your stay', 'gasworks-house' ); ?></li>
					</ul>
				</div>

				<form class="enquiry book-form" method="post" action="<?php echo esc_url( rest_url( 'gwh/v1/request' ) ); ?>" data-book-form>
					<div class="book-summary" data-summary>
						<p class="summary-empty"><?php esc_html_e( 'Tap your arrival date, then your departure date.', 'gasworks-house' ); ?></p>
					</div>

					<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>

					<div class="field-row">
						<label class="field"><span><?php esc_html_e( 'Arrival', 'gasworks-house' ); ?></span><input type="date" name="arrival" required data-arrival></label>
						<label class="field"><span><?php esc_html_e( 'Departure', 'gasworks-house' ); ?></span><input type="date" name="departure" required data-departure></label>
					</div>
					<div class="field-row">
						<label class="field"><span><?php esc_html_e( 'Group size', 'gasworks-house' ); ?></span><input type="number" name="guests" min="1" max="<?php echo esc_attr( gwh_max_guests() ); ?>" required inputmode="numeric"></label>
						<label class="field"><span><?php esc_html_e( 'Occasion', 'gasworks-house' ); ?></span>
							<select name="party" data-party-select>
								<option>Hen party</option>
								<option>Stag party</option>
								<option>Joint hen &amp; stag</option>
								<option>Other celebration</option>
							</select>
						</label>
					</div>
					<?php $gwh_cruise = gwh_cruise(); ?>
					<?php if ( $gwh_cruise ) : ?>
						<div class="addon">
							<label class="addon-toggle">
								<input type="checkbox" name="cruise" value="1" data-cruise-toggle>
								<span>
									<strong><?php /* translators: %s: add-on name */ echo esc_html( sprintf( __( 'Add the %s', 'gasworks-house' ), $gwh_cruise['name'] ) ); ?></strong>
									<em><?php /* translators: %s: price */ echo esc_html( sprintf( __( '%s per person', 'gasworks-house' ), gwh_money( $gwh_cruise['price'] ) ) ); ?></em>
									<small><?php echo esc_html( $gwh_cruise['description'] ); ?></small>
								</span>
							</label>
							<div class="field-row addon-fields" data-cruise-fields hidden>
								<label class="field"><span><?php esc_html_e( 'How many people?', 'gasworks-house' ); ?></span><input type="number" name="cruise_people" min="1" max="<?php echo esc_attr( gwh_max_guests() ); ?>" inputmode="numeric" data-cruise-people></label>
								<label class="field"><span><?php esc_html_e( 'Which day?', 'gasworks-house' ); ?></span><select name="cruise_date" data-cruise-date><option value=""><?php esc_html_e( 'Pick your dates first', 'gasworks-house' ); ?></option></select></label>
							</div>
						</div>
					<?php endif; ?>
					<div class="field-row">
						<label class="field"><span><?php esc_html_e( 'Name', 'gasworks-house' ); ?></span><input type="text" name="name" required autocomplete="name"></label>
						<label class="field"><span><?php esc_html_e( 'Email', 'gasworks-house' ); ?></span><input type="email" name="email" required autocomplete="email"></label>
					</div>
					<label class="field"><span><?php esc_html_e( 'Phone', 'gasworks-house' ); ?></span><input type="tel" name="phone" autocomplete="tel"></label>
					<label class="field"><span><?php esc_html_e( 'Anything else? Plans, questions, surprises…', 'gasworks-house' ); ?></span><textarea name="message" rows="3"></textarea></label>

					<p class="notice" data-book-status role="status" hidden></p>
					<button class="btn btn-block" type="submit" data-book-submit><?php esc_html_e( 'Request to book', 'gasworks-house' ); ?></button>
					<?php if ( gwh_payments_enabled() ) : ?>
						<p class="book-note">
							<?php
							/* translators: %d: days */
							echo esc_html( sprintf( __( '🔒 Secure payment by Stripe. The balance is charged to the same card %d days before arrival.', 'gasworks-house' ), absint( gwh_bset( 'balance_days' ) ) ) );
							?>
						</p>
					<?php else : ?>
						<p class="book-note"><?php esc_html_e( 'No payment now. We\'ll confirm and send deposit details by email.', 'gasworks-house' ); ?></p>
					<?php endif; ?>
				</form>
			</div>

			<div class="book-extra">
				<ol class="steps">
					<li><strong><?php esc_html_e( 'Pick your dates', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'Live availability, synced with Airbnb.', 'gasworks-house' ); ?></span></li>
					<?php if ( gwh_payments_enabled() ) : ?>
						<li><strong><?php esc_html_e( 'Pay your deposit', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'Securely by card with Stripe.', 'gasworks-house' ); ?></span></li>
						<li><strong><?php esc_html_e( 'You\'re booked', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'Instant confirmation by email.', 'gasworks-house' ); ?></span></li>
					<?php else : ?>
						<li><strong><?php esc_html_e( 'Send your request', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'We hold the dates for you.', 'gasworks-house' ); ?></span></li>
						<li><strong><?php esc_html_e( 'We confirm', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'Pay your deposit and the house is yours.', 'gasworks-house' ); ?></span></li>
					<?php endif; ?>
				</ol>

				<?php if ( $gwh_airbnb ) : ?>
					<div class="airbnb-alt">
						<p><strong><?php esc_html_e( 'Prefer Airbnb?', 'gasworks-house' ); ?></strong> <?php esc_html_e( 'You can book us there too.', 'gasworks-house' ); ?></p>
						<?php if ( gwh_mod( 'airbnb_embed' ) && preg_match( '#/rooms/(\d+)#', $gwh_airbnb, $gwh_room ) ) : ?>
							<?php $gwh_airbnb_host = wp_parse_url( $gwh_airbnb, PHP_URL_HOST ); ?>
							<div class="airbnb-embed-frame" data-id="<?php echo esc_attr( $gwh_room[1] ); ?>" data-view="home" data-hide-price="true" style="width:100%;max-width:450px;height:300px">
								<a class="btn btn-ghost" href="<?php echo esc_url( $gwh_airbnb ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'View on Airbnb', 'gasworks-house' ); ?></a>
								<script async src="https://<?php echo esc_attr( $gwh_airbnb_host ); ?>/embeddable/airbnb_jssdk"></script>
							</div>
						<?php else : ?>
							<a class="btn btn-ghost" href="<?php echo esc_url( $gwh_airbnb ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'View on Airbnb', 'gasworks-house' ); ?></a>
						<?php endif; ?>
					</div>
				<?php endif; ?>

				<?php if ( gwh_whatsapp_url() ) : ?>
					<p><a class="text-link" href="<?php echo esc_url( gwh_whatsapp_url() ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Questions first? Message us on WhatsApp →', 'gasworks-house' ); ?></a></p>
				<?php endif; ?>
			</div>
		</div>
	</section>

</main>

<?php
get_footer();
