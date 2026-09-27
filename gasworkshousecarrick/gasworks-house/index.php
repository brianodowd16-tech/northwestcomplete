<?php
/**
 * Fallback template for pages, posts and archives.
 *
 * @package gasworks-house
 */

get_header();
?>
<main id="main" class="page-main">
	<div class="wrap narrow">
		<?php if ( have_posts() ) : ?>
			<?php while ( have_posts() ) : the_post(); ?>
				<article <?php post_class( 'entry' ); ?>>
					<?php if ( is_singular() ) : ?>
						<h1 class="section-title"><?php the_title(); ?></h1>
						<div class="prose"><?php the_content(); ?></div>
					<?php else : ?>
						<h2 class="sub-title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
						<div class="prose"><?php the_excerpt(); ?></div>
					<?php endif; ?>
				</article>
			<?php endwhile; ?>
			<?php the_posts_pagination(); ?>
		<?php else : ?>
			<h1 class="section-title"><?php esc_html_e( 'Nothing here yet.', 'gasworks-house' ); ?></h1>
		<?php endif; ?>
	</div>
</main>
<?php
get_footer();
