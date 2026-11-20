<?php
/**
 * Hero: main photo, headline, key facts.
 *
 * @package gasworks-house
 */

$gwh_hero_url = gwh_hero_url();
$gwh_facts    = array_filter( array(
	__( 'Sleeps up to', 'gasworks-house' ) => gwh_mod( 'sleeps' ),
	__( 'Bedrooms', 'gasworks-house' )     => gwh_mod( 'bedrooms' ),
	__( 'Bathrooms', 'gasworks-house' )    => gwh_mod( 'bathrooms' ),
	__( 'Min. nights', 'gasworks-house' )  => gwh_bset( 'min_nights' ),
) );
?>
<section class="hero<?php echo $gwh_hero_url ? ' has-image' : ''; ?>"<?php echo $gwh_hero_url ? ' style="' . esc_attr( gwh_hero_style() ) . '"' : ''; ?>>
	<div class="hero-glow" aria-hidden="true"></div>
	<div class="wrap hero-inner">
		<p class="eyebrow"><?php echo esc_html( gwh_mod( 'hero_eyebrow' ) ); ?></p>
		<h1 class="hero-title"><?php echo esc_html( gwh_mod( 'hero_heading' ) ); ?></h1>
		<p class="hero-text"><?php echo esc_html( gwh_mod( 'hero_text' ) ); ?></p>
		<div class="hero-actions">
			<a class="btn" href="<?php echo esc_url( gwh_section_url( 'book' ) ); ?>"><?php esc_html_e( 'Check availability', 'gasworks-house' ); ?></a>
			<a class="btn btn-ghost" href="<?php echo esc_url( gwh_section_url( 'house' ) ); ?>"><?php esc_html_e( 'See the house', 'gasworks-house' ); ?></a>
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
