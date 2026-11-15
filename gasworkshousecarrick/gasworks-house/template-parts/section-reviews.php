<?php
/**
 * Guest reviews (hidden until some are added).
 *
 * @package gasworks-house
 */

?>
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
