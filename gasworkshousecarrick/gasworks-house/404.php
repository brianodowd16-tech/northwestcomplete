<?php
/**
 * Not found.
 *
 * @package gasworks-house
 */

get_header();
?>
<main id="main" class="page-main">
	<div class="wrap narrow">
		<p class="kicker">404</p>
		<h1 class="section-title"><?php esc_html_e( 'This one got lost on the way back from the pub.', 'gasworks-house' ); ?></h1>
		<p><a class="btn" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Back to the house', 'gasworks-house' ); ?></a></p>
	</div>
</main>
<?php
get_footer();
