<?php
/**
 * Template Name: Contact
 * WhatsApp, phone, email, address and map.
 *
 * @package gasworks-house
 */

get_header();
?>

<main id="main">
	<?php
	get_template_part( 'template-parts/page-header' );
	foreach ( array( 'contact' ) as $gwh_section ) {
		get_template_part( 'template-parts/section', $gwh_section );
	}
	
	?>
</main>

<?php
get_footer();
