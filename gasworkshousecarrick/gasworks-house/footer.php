<?php
/**
 * Site footer.
 *
 * @package gasworks-house
 */

$gwh_social = array_filter( array(
	'Instagram' => gwh_mod( 'instagram_url' ),
	'Facebook'  => gwh_mod( 'facebook_url' ),
	'TikTok'    => gwh_mod( 'tiktok_url' ),
) );
$gwh_email  = gwh_mod( 'contact_email' );
$gwh_phone  = gwh_mod( 'contact_phone' );
$gwh_wa     = gwh_whatsapp_url();
?>
<footer class="site-footer">
	<div class="wrap footer-grid">
		<div>
			<p class="footer-brand">Gasworks <em>House</em></p>
			<p class="muted"><?php esc_html_e( 'Boutique hen & stag stays in Carrick-on-Shannon, Co. Leitrim.', 'gasworks-house' ); ?></p>
		</div>
		<div>
			<p class="footer-title"><?php esc_html_e( 'Get in touch', 'gasworks-house' ); ?></p>
			<ul class="footer-list">
				<?php if ( $gwh_email ) : ?>
					<li><a href="mailto:<?php echo esc_attr( antispambot( $gwh_email ) ); ?>"><?php echo esc_html( antispambot( $gwh_email ) ); ?></a></li>
				<?php endif; ?>
				<?php if ( $gwh_phone ) : ?>
					<li><a href="tel:<?php echo esc_attr( gwh_phone_digits( $gwh_phone ) ); ?>"><?php echo esc_html( $gwh_phone ); ?></a></li>
				<?php endif; ?>
				<?php if ( $gwh_wa ) : ?>
					<li><a href="<?php echo esc_url( $gwh_wa ); ?>" rel="noopener" target="_blank"><?php esc_html_e( 'WhatsApp us', 'gasworks-house' ); ?></a></li>
				<?php endif; ?>
				<li><a href="<?php echo esc_url( ( is_front_page() ? '' : home_url( '/' ) ) . '#book' ); ?>"><?php esc_html_e( 'Book direct', 'gasworks-house' ); ?></a></li>
			</ul>
		</div>
		<?php if ( $gwh_social ) : ?>
			<div>
				<p class="footer-title"><?php esc_html_e( 'Follow along', 'gasworks-house' ); ?></p>
				<ul class="footer-list">
					<?php foreach ( $gwh_social as $gwh_label => $gwh_url ) : ?>
						<li><a href="<?php echo esc_url( $gwh_url ); ?>" rel="noopener" target="_blank"><?php echo esc_html( $gwh_label ); ?></a></li>
					<?php endforeach; ?>
				</ul>
			</div>
		<?php endif; ?>
	</div>
	<div class="wrap footer-base muted">
		<span>&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> <?php echo esc_html( get_bloginfo( 'name' ) ); ?></span>
		<span><?php esc_html_e( 'Carrick-on-Shannon · Co. Leitrim · Ireland', 'gasworks-house' ); ?></span>
	</div>
</footer>

<?php if ( is_front_page() ) : ?>
	<div class="mobile-cta" data-mobile-cta>
		<a class="btn" href="#book"><?php esc_html_e( 'Check availability', 'gasworks-house' ); ?></a>
	</div>
<?php endif; ?>

<?php wp_footer(); ?>
</body>
</html>
