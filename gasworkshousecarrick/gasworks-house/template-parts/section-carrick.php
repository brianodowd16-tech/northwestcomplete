<?php
/**
 * Carrick-on-Shannon: things to do, getting here, map.
 *
 * @package gasworks-house
 */

?>
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
	</div>
</section>
