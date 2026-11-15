<?php
/**
 * Contact: WhatsApp, phone, email, address and map.
 *
 * @package gasworks-house
 */

$gwh_email = gwh_mod( 'contact_email' );
$gwh_phone = gwh_mod( 'contact_phone' );
?>
<section class="section" id="contact">
	<div class="wrap split split-map">
		<div class="contact-ways">
			<h2 class="sub-title"><?php esc_html_e( 'Get in touch', 'gasworks-house' ); ?></h2>
			<p class="muted"><?php esc_html_e( 'WhatsApp is the quickest way to reach us. We\'re happy to help with dates, prices and plans for the weekend.', 'gasworks-house' ); ?></p>
			<div class="ask-actions contact-actions">
				<?php if ( gwh_whatsapp_url() ) : ?>
					<a class="btn btn-wa" href="<?php echo esc_url( gwh_whatsapp_url() ); ?>" target="_blank" rel="noopener"><?php echo gwh_whatsapp_icon(); // phpcs:ignore WordPress.Security.EscapeOutput ?><?php esc_html_e( 'WhatsApp us', 'gasworks-house' ); ?></a>
				<?php endif; ?>
				<?php if ( $gwh_phone ) : ?>
					<a class="btn btn-outline" href="<?php echo esc_attr( gwh_tel_link( $gwh_phone ) ); ?>"><?php /* translators: %s: phone number */ echo esc_html( sprintf( __( 'Call %s', 'gasworks-house' ), $gwh_phone ) ); ?></a>
				<?php endif; ?>
			</div>
			<dl class="travel contact-list">
				<?php if ( $gwh_email ) : ?>
					<div><dt><?php esc_html_e( 'Email', 'gasworks-house' ); ?></dt><dd><a href="mailto:<?php echo esc_attr( antispambot( $gwh_email ) ); ?>"><?php echo esc_html( antispambot( $gwh_email ) ); ?></a></dd></div>
				<?php endif; ?>
				<?php if ( $gwh_phone ) : ?>
					<div><dt><?php esc_html_e( 'Phone & WhatsApp', 'gasworks-house' ); ?></dt><dd><a href="<?php echo esc_attr( gwh_tel_link( $gwh_phone ) ); ?>"><?php echo esc_html( $gwh_phone ); ?></a></dd></div>
				<?php endif; ?>
				<div><dt><?php esc_html_e( 'Address', 'gasworks-house' ); ?></dt><dd><?php echo esc_html( implode( ', ', gwh_address_lines() ) ); ?></dd></div>
				<div><dt><?php esc_html_e( 'Check-in / check-out', 'gasworks-house' ); ?></dt><dd><?php echo esc_html( sprintf( '%s / %s', gwh_bset( 'checkin_time' ), gwh_bset( 'checkout_time' ) ) ); ?></dd></div>
			</dl>
		</div>
		<?php if ( gwh_mod( 'map_query' ) ) : ?>
			<div class="map-wrap">
				<div class="map">
					<iframe title="<?php esc_attr_e( 'Map showing Gasworks House', 'gasworks-house' ); ?>" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
						src="https://maps.google.com/maps?q=<?php echo rawurlencode( gwh_mod( 'map_query' ) ); ?>&amp;z=16&amp;output=embed"></iframe>
				</div>
				<div class="map-bar">
					<address><?php echo esc_html( implode( ', ', gwh_address_lines() ) ); ?></address>
					<span class="map-actions">
						<a class="text-link-dark" href="<?php echo esc_url( gwh_maps_url() ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'View on Google Maps', 'gasworks-house' ); ?></a>
						<a class="btn btn-small" href="<?php echo esc_url( gwh_maps_url( true ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Get directions', 'gasworks-house' ); ?></a>
					</span>
				</div>
			</div>
		<?php endif; ?>
	</div>
</section>
