<?php
/**
 * Banner at the top of inner pages: title, plus the page's own text from the editor as an intro.
 *
 * @package gasworks-house
 */

?>
<header class="page-hero" style="--hero-image:url('<?php echo esc_url( gwh_hero_url() ); ?>')">
	<div class="wrap">
		<p class="kicker"><?php esc_html_e( 'Gasworks House', 'gasworks-house' ); ?></p>
		<h1 class="page-hero-title"><?php single_post_title(); ?></h1>
		<?php
		while ( have_posts() ) :
			the_post();
			if ( '' !== trim( get_the_content() ) ) :
				?>
				<div class="page-hero-intro"><?php the_content(); ?></div>
				<?php
			endif;
		endwhile;
		?>
	</div>
</header>
