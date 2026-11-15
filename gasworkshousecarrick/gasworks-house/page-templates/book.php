<?php
/**
 * Template Name: Book
 * Availability calendar and booking.
 *
 * @package gasworks-house
 */

get_header();
?>

<main id="main">
	<?php
	get_template_part( 'template-parts/page-header' );
	foreach ( array( 'book' ) as $gwh_section ) {
		get_template_part( 'template-parts/section', $gwh_section );
	}
	
	?>
</main>

<?php
get_footer();
