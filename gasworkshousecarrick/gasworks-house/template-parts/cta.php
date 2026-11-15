<?php
/**
 * "Ready to book?" strip at the end of inner pages.
 *
 * @package gasworks-house
 */

?>
<section class="cta-band">
	<div class="wrap cta-band-inner">
		<div>
			<h2 class="cta-band-title"><?php esc_html_e( 'Ready to plan the weekend?', 'gasworks-house' ); ?></h2>
			<p><?php esc_html_e( 'Check live availability and book direct, or message us with any questions.', 'gasworks-house' ); ?></p>
		</div>
		<div class="ask-actions">
			<a class="btn" href="<?php echo esc_url( gwh_section_url( 'book' ) ); ?>"><?php esc_html_e( 'Check availability', 'gasworks-house' ); ?></a>
			<?php if ( gwh_whatsapp_url() ) : ?>
				<a class="btn btn-wa" href="<?php echo esc_url( gwh_whatsapp_url() ); ?>" target="_blank" rel="noopener"><?php echo gwh_whatsapp_icon(); // phpcs:ignore WordPress.Security.EscapeOutput ?><?php esc_html_e( 'WhatsApp us', 'gasworks-house' ); ?></a>
			<?php endif; ?>
		</div>
	</div>
</section>
