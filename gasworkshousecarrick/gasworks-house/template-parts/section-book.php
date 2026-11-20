<?php
/**
 * Booking calendar, WhatsApp and call.
 *
 * @package gasworks-house
 */

$gwh_airbnb = gwh_mod( 'airbnb_url' );
?>
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

				<?php $gwh_terms = gwh_site_page( 'terms' ); ?>
				<?php if ( $gwh_terms ) : ?>
					<?php $gwh_cancel = gwh_site_page( 'cancellation' ); ?>
					<label class="agree">
						<input type="checkbox" name="terms" value="1" required>
						<span>
							<?php
							echo wp_kses(
								sprintf(
									/* translators: 1: terms link, 2: cancellation link */
									__( 'I agree to the %1$s%2$s.', 'gasworks-house' ),
									'<a href="' . esc_url( get_permalink( $gwh_terms ) ) . '" target="_blank">' . esc_html__( 'Terms & Conditions', 'gasworks-house' ) . '</a>',
									$gwh_cancel ? ' ' . __( 'and', 'gasworks-house' ) . ' <a href="' . esc_url( get_permalink( $gwh_cancel ) ) . '" target="_blank">' . esc_html__( 'Cancellation Policy', 'gasworks-house' ) . '</a>' : ''
								),
								array( 'a' => array( 'href' => true, 'target' => true ) )
							);
							?>
						</span>
					</label>
				<?php endif; ?>
				<p class="notice" data-book-status role="status" hidden></p>
				<button class="btn btn-block" type="submit" data-book-submit><?php esc_html_e( 'Request to book', 'gasworks-house' ); ?></button>
				<?php if ( gwh_payments_enabled() ) : ?>
					<p class="book-note">
						<?php
						/* translators: %d: days */
						echo esc_html( sprintf( 'stripe' === gwh_gateway() || gwh_mypos_token_charges()
							? __( '🔒 Secure card payment. The balance is charged to the same card %d days before arrival.', 'gasworks-house' )
							: __( '🔒 Secure card payment with Apple Pay and Google Pay. We\'ll email you a link for the balance %d days before arrival.', 'gasworks-house' ), absint( gwh_bset( 'balance_days' ) ) ) );
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
					<li><strong><?php esc_html_e( 'Pay your deposit', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'Securely by card, Apple Pay or Google Pay.', 'gasworks-house' ); ?></span></li>
					<li><strong><?php esc_html_e( 'You\'re booked', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'Instant confirmation by email.', 'gasworks-house' ); ?></span></li>
				<?php else : ?>
					<li><strong><?php esc_html_e( 'Send your request', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'We hold the dates for you.', 'gasworks-house' ); ?></span></li>
					<li><strong><?php esc_html_e( 'We confirm', 'gasworks-house' ); ?></strong><span><?php esc_html_e( 'Pay your deposit and the house is yours.', 'gasworks-house' ); ?></span></li>
				<?php endif; ?>
			</ol>

			<div class="book-side">
				<?php if ( $gwh_airbnb ) : ?>
					<div class="airbnb-alt">
						<p><strong><?php esc_html_e( 'Prefer Airbnb?', 'gasworks-house' ); ?></strong> <?php esc_html_e( 'You can book us there too.', 'gasworks-house' ); ?></p>
						<?php if ( gwh_mod( 'airbnb_embed' ) && preg_match( '#/rooms/(\d+)#', $gwh_airbnb, $gwh_room ) ) : ?>
							<?php $gwh_airbnb_host = wp_parse_url( $gwh_airbnb, PHP_URL_HOST ); ?>
							<?php // Airbnb's script is heavy: main.js loads it only when this box scrolls near view. ?>
							<div class="airbnb-embed-frame" data-id="<?php echo esc_attr( $gwh_room[1] ); ?>" data-view="home" data-hide-price="true" data-airbnb-sdk="<?php echo esc_url( 'https://' . $gwh_airbnb_host . '/embeddable/airbnb_jssdk' ); ?>" style="width:100%;max-width:450px;height:300px">
								<a class="btn btn-ghost" href="<?php echo esc_url( $gwh_airbnb ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'View on Airbnb', 'gasworks-house' ); ?></a>
							</div>
						<?php else : ?>
							<a class="btn btn-ghost" href="<?php echo esc_url( $gwh_airbnb ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'View on Airbnb', 'gasworks-house' ); ?></a>
						<?php endif; ?>
					</div>
				<?php endif; ?>

				<?php if ( gwh_whatsapp_url() || gwh_mod( 'contact_phone' ) ) : ?>
					<div class="ask">
						<p><strong><?php esc_html_e( 'Questions first?', 'gasworks-house' ); ?></strong> <?php esc_html_e( 'Message or call us, we\'re happy to help plan the weekend.', 'gasworks-house' ); ?></p>
						<div class="ask-actions">
							<?php if ( gwh_whatsapp_url() ) : ?>
								<a class="btn btn-wa" href="<?php echo esc_url( gwh_whatsapp_url() ); ?>" target="_blank" rel="noopener"><?php echo gwh_whatsapp_icon(); // phpcs:ignore WordPress.Security.EscapeOutput ?><?php esc_html_e( 'WhatsApp us', 'gasworks-house' ); ?></a>
							<?php endif; ?>
							<?php if ( gwh_mod( 'contact_phone' ) ) : ?>
								<a class="btn btn-ghost" href="<?php echo esc_attr( gwh_tel_link( gwh_mod( 'contact_phone' ) ) ); ?>">
									<?php /* translators: %s: phone number */ echo esc_html( sprintf( __( 'Call %s', 'gasworks-house' ), gwh_mod( 'contact_phone' ) ) ); ?>
								</a>
							<?php endif; ?>
						</div>
					</div>
				<?php endif; ?>
			</div>
		</div>
	</div>
</section>
