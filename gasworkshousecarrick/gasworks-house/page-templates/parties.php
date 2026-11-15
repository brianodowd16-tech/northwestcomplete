<?php
/**
 * Template Name: Hens & Stags
 * Ideas for hen and stag weekends.
 *
 * @package gasworks-house
 */

get_header();
?>

<main id="main">
	<?php
	get_template_part( 'template-parts/page-header' );
	foreach ( array( 'parties' ) as $gwh_section ) {
		get_template_part( 'template-parts/section', $gwh_section );
	}
	get_template_part( 'template-parts/cta' );
	?>
</main>

<?php
get_footer();
