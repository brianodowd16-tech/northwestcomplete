<?php
/**
 * Hens & stags.
 *
 * @package gasworks-house
 */

?>
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
				<a class="btn" href="<?php echo esc_url( gwh_section_url( 'book' ) ); ?>" data-party="<?php echo 'hen' === $gwh_type ? 'Hen party' : 'Stag party'; ?>">
					<?php echo 'hen' === $gwh_type ? esc_html__( 'Plan the hen', 'gasworks-house' ) : esc_html__( 'Plan the stag', 'gasworks-house' ); ?>
				</a>
			</div>
		<?php endforeach; ?>
	</div>
</section>
