<?php
/**
 * Room-by-room photo tour.
 *
 * @package gasworks-house
 */

?>
<?php
$gwh_tour   = gwh_tour();
$gwh_photos = array(); // Every stop in the tour: real photos, plus a card for rooms still awaiting one.
$gwh_real   = array();
foreach ( $gwh_tour as $gwh_r => $gwh_room ) {
	if ( ! $gwh_room['photos'] ) {
		$gwh_photos[] = array( 'room' => $gwh_r, 'card' => true, 'full' => '', 'thumb' => '', 'alt' => $gwh_room['name'] );
	}
	foreach ( $gwh_room['photos'] as $gwh_photo ) {
		$gwh_photos[] = $gwh_photo + array( 'room' => $gwh_r, 'card' => false );
		$gwh_real[]   = $gwh_photo;
	}
}
?>
<?php if ( $gwh_real ) : ?>
	<?php $gwh_first = $gwh_tour[ $gwh_photos[0]['room'] ]; ?>
	<section class="tour" id="tour" data-tour>
		<div class="wrap">
			<div class="tour-head">
				<div>
					<p class="kicker"><?php esc_html_e( 'Take the tour', 'gasworks-house' ); ?></p>
					<h2 class="section-title"><?php esc_html_e( 'Every room, before you arrive.', 'gasworks-house' ); ?></h2>
				</div>
				<p class="tour-count">
					<?php
					/* translators: 1: rooms, 2: photos */
					echo esc_html( sprintf( _n( '%1$d room', '%1$d rooms', count( $gwh_tour ), 'gasworks-house' ), count( $gwh_tour ) ) . ' · ' . sprintf( _n( '%d photo', '%d photos', count( $gwh_real ), 'gasworks-house' ), count( $gwh_real ) ) );
					?>
				</p>
			</div>

			<div class="tour-layout">
				<nav class="tour-rooms" aria-label="<?php esc_attr_e( 'Rooms', 'gasworks-house' ); ?>">
					<ol>
						<?php foreach ( $gwh_tour as $gwh_r => $gwh_room ) : ?>
							<li>
								<button type="button" class="tour-room" data-tour-room="<?php echo esc_attr( $gwh_r ); ?>"<?php echo 0 === $gwh_r ? ' aria-current="true"' : ''; ?>>
									<span class="tour-num"><?php echo esc_html( str_pad( $gwh_r + 1, 2, '0', STR_PAD_LEFT ) ); ?></span>
									<span class="tour-room-name"><?php echo esc_html( $gwh_room['name'] ); ?></span>
									<span class="tour-room-meta"><?php echo esc_html( $gwh_room['beds'] ? $gwh_room['beds'] : ( $gwh_room['photos'] ? sprintf( _n( '%d photo', '%d photos', count( $gwh_room['photos'] ), 'gasworks-house' ), count( $gwh_room['photos'] ) ) : '' ) ); ?></span>
								</button>
							</li>
						<?php endforeach; ?>
					</ol>
				</nav>

				<div class="tour-stage">
					<figure class="tour-figure">
						<button type="button" class="tour-open" data-tour-open aria-label="<?php esc_attr_e( 'View photo full screen', 'gasworks-house' ); ?>">
							<img class="tour-img" data-tour-img src="<?php echo esc_url( $gwh_real[0]['full'] ); ?>" alt="<?php echo esc_attr( $gwh_real[0]['alt'] ); ?>" decoding="async">
							<span class="tour-zoom" aria-hidden="true">⤢</span>
						</button>
						<div class="tour-card" data-tour-card hidden>
							<span class="tour-card-num" data-tour-card-num></span>
							<span class="tour-card-name" data-tour-card-name></span>
							<span class="tour-card-beds" data-tour-card-beds></span>
						</div>
						<button type="button" class="tour-arrow tour-prev" data-tour-step="-1" aria-label="<?php esc_attr_e( 'Previous photo', 'gasworks-house' ); ?>">‹</button>
						<button type="button" class="tour-arrow tour-next" data-tour-step="1" aria-label="<?php esc_attr_e( 'Next photo', 'gasworks-house' ); ?>">›</button>
						<figcaption class="tour-caption" aria-live="polite">
							<span class="tour-caption-top">
								<span class="tour-num" data-tour-num>01</span>
								<strong data-tour-name><?php echo esc_html( $gwh_first['name'] ); ?></strong>
								<span class="tour-beds" data-tour-beds<?php echo $gwh_first['beds'] ? '' : ' hidden'; ?>><?php echo esc_html( $gwh_first['beds'] ); ?></span>
								<span class="tour-counter" data-tour-counter>1 / <?php echo esc_html( count( $gwh_photos ) ); ?></span>
							</span>
							<span class="tour-note" data-tour-note><?php echo esc_html( $gwh_first['note'] ); ?></span>
						</figcaption>
					</figure>
				</div>
			</div>

			<div class="tour-strip" data-tour-strip>
				<?php foreach ( $gwh_photos as $gwh_i => $gwh_photo ) : ?>
					<?php if ( $gwh_photo['card'] ) : ?>
						<a class="tour-thumb tour-thumb-card<?php echo 0 === $gwh_i ? ' is-active' : ''; ?>" href="#tour" data-tour-index="<?php echo esc_attr( $gwh_i ); ?>">
							<span class="tour-thumb-card-name"><?php echo esc_html( $gwh_photo['alt'] ); ?></span>
							<span class="tour-thumb-num"><?php echo esc_html( str_pad( $gwh_photo['room'] + 1, 2, '0', STR_PAD_LEFT ) ); ?></span>
						</a>
					<?php else : ?>
						<a class="tour-thumb<?php echo 0 === $gwh_i ? ' is-active' : ''; ?>" href="<?php echo esc_url( $gwh_photo['full'] ); ?>" data-tour-index="<?php echo esc_attr( $gwh_i ); ?>">
							<img src="<?php echo esc_url( $gwh_photo['thumb'] ); ?>" alt="<?php echo esc_attr( $gwh_photo['alt'] ); ?>" loading="lazy" decoding="async" width="720" height="480">
							<span class="tour-thumb-num"><?php echo esc_html( str_pad( $gwh_photo['room'] + 1, 2, '0', STR_PAD_LEFT ) ); ?></span>
						</a>
					<?php endif; ?>
				<?php endforeach; ?>
			</div>
		</div>
		<script type="application/json" data-tour-data><?php echo wp_json_encode( $gwh_tour, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP ); ?></script>
	</section>
<?php endif; ?>
