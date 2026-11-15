<?php
/**
 * Ordinary pages (policies, anything you add yourself): banner title, then your content.
 *
 * @package gasworks-house
 */

get_header();
?>
<main id="main">
	<header class="page-hero page-hero-plain">
		<div class="wrap narrow">
			<p class="kicker"><?php esc_html_e( 'Gasworks House', 'gasworks-house' ); ?></p>
			<h1 class="page-hero-title"><?php single_post_title(); ?></h1>
		</div>
	</header>
	<div class="section section-tight-top">
		<div class="wrap narrow prose page-content">
			<?php
			while ( have_posts() ) :
				the_post();
				the_content();
			endwhile;
			?>
		</div>
	</div>
</main>
<?php
get_footer();
