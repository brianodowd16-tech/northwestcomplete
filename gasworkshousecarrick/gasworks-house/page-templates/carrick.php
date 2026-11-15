<?php
/**
 * Template Name: Carrick-on-Shannon
 * Things to do, getting here and the map.
 *
 * @package gasworks-house
 */

get_header();
?>

<main id="main">
	<?php
	get_template_part( 'template-parts/page-header' );
	foreach ( array( 'carrick' ) as $gwh_section ) {
		get_template_part( 'template-parts/section', $gwh_section );
	}
	get_template_part( 'template-parts/cta' );
	?>
</main>

<?php
get_footer();
