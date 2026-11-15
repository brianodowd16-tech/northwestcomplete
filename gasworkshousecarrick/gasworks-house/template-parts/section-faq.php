<?php
/**
 * FAQ.
 *
 * @package gasworks-house
 */

?>
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
