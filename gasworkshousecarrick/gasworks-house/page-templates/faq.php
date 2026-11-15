<?php
/**
 * Template Name: FAQ
 * Questions and answers, plus guest reviews once added.
 *
 * @package gasworks-house
 */

get_header();
?>

<main id="main">
	<?php
	get_template_part( 'template-parts/page-header' );
	foreach ( array( 'faq', 'reviews' ) as $gwh_section ) {
		get_template_part( 'template-parts/section', $gwh_section );
	}
	get_template_part( 'template-parts/cta' );
	?>
</main>

<?php
get_footer();
