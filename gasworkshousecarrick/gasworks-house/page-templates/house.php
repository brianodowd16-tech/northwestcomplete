<?php
/**
 * Template Name: The House
 * The house description, features and the room-by-room photo tour.
 *
 * @package gasworks-house
 */

get_header();
?>

<main id="main">
	<?php
	get_template_part( 'template-parts/page-header' );
	foreach ( array( 'house', 'tour' ) as $gwh_section ) {
		get_template_part( 'template-parts/section', $gwh_section );
	}
	get_template_part( 'template-parts/cta' );
	?>
</main>

<?php
get_footer();
