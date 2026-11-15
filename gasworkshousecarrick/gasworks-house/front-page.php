<?php
/**
 * Homepage: every section, one after another.
 *
 * @package gasworks-house
 */

get_header();
?>

<main id="main">
	<?php
	foreach ( array( 'hero', 'house', 'tour', 'parties', 'carrick', 'reviews', 'faq', 'book' ) as $gwh_section ) {
		get_template_part( 'template-parts/section', $gwh_section );
	}
	?>
</main>

<?php
get_footer();
