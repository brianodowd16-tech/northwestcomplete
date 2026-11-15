<?php
/**
 * Site header.
 *
 * @package gasworks-house
 */

$gwh_on_front = is_front_page();
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="theme-color" content="#17151a">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link" href="#main"><?php esc_html_e( 'Skip to content', 'gasworks-house' ); ?></a>

<header class="site-header<?php echo $gwh_on_front ? ' is-overlay' : ''; ?>" data-header>
	<div class="wrap header-inner">
		<a class="brand" href="<?php echo esc_url( home_url( '/' ) ); ?>" aria-label="<?php echo esc_attr( get_bloginfo( 'name' ) ); ?> home">
			<?php // Always the light logo: the header is dark, so a logo with black lettering (e.g. one set under Site Identity) would vanish. ?>
			<img class="brand-logo" src="<?php echo esc_url( gwh_brand_url( 'logo-light.webp' ) ); ?>" width="400" height="286" alt="<?php esc_attr_e( 'Gasworks House, self-catering accommodation', 'gasworks-house' ); ?>">
		</a>

		<button class="nav-toggle" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
			<span class="sr-only"><?php esc_html_e( 'Menu', 'gasworks-house' ); ?></span>
			<span class="nav-toggle-bar"></span>
		</button>

		<nav class="site-nav" id="site-nav" aria-label="<?php esc_attr_e( 'Main', 'gasworks-house' ); ?>">
			<?php
			// Use the menu from Appearance → Menus, unless it's missing or empty (an empty menu carried
			// over from a previous theme would otherwise leave the header with no links).
			$gwh_menu = has_nav_menu( 'primary' ) ? wp_nav_menu( array( 'theme_location' => 'primary', 'container' => false, 'menu_class' => 'nav-list', 'depth' => 1, 'fallback_cb' => false, 'echo' => false ) ) : '';
			if ( $gwh_menu && false !== strpos( $gwh_menu, '<li' ) ) {
				echo $gwh_menu; // phpcs:ignore WordPress.Security.EscapeOutput
			} else {
				?>
				<ul class="nav-list">
					<li><a href="<?php echo esc_url( gwh_section_url( 'house' ) ); ?>"><?php esc_html_e( 'The House', 'gasworks-house' ); ?></a></li>
					<li><a href="<?php echo esc_url( gwh_section_url( 'parties' ) ); ?>"><?php esc_html_e( 'Hens & Stags', 'gasworks-house' ); ?></a></li>
					<li><a href="<?php echo esc_url( gwh_section_url( 'carrick' ) ); ?>"><?php esc_html_e( 'Carrick', 'gasworks-house' ); ?></a></li>
					<li><a href="<?php echo esc_url( gwh_section_url( 'faq' ) ); ?>"><?php esc_html_e( 'FAQ', 'gasworks-house' ); ?></a></li>
					<li><a href="<?php echo esc_url( gwh_section_url( 'contact' ) ); ?>"><?php esc_html_e( 'Contact', 'gasworks-house' ); ?></a></li>
				</ul>
				<?php
			}
			?>
			<a class="btn btn-small" href="<?php echo esc_url( gwh_section_url( 'book' ) ); ?>"><?php esc_html_e( 'Check dates', 'gasworks-house' ); ?></a>
		</nav>
	</div>
</header>
