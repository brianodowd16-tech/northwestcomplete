<?php
/**
 * The house: description and features.
 *
 * @package gasworks-house
 */

?>
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
