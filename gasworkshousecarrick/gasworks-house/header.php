<?php
/**
 * Site header.
 *
 * @package gasworks-house
 */

$gwh_on_front = is_front_page();
$gwh_anchor   = $gwh_on_front ? '' : home_url( '/' );
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
			<?php if ( has_custom_logo() ) : ?>
				<?php echo wp_get_attachment_image( get_theme_mod( 'custom_logo' ), 'medium', false, array( 'class' => 'brand-logo' ) ); ?>
			<?php else : ?>
				<span class="brand-mark" aria-hidden="true">G</span>
				<span class="brand-text">Gasworks <em>House</em></span>
			<?php endif; ?>
		</a>

		<button class="nav-toggle" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
			<span class="sr-only"><?php esc_html_e( 'Menu', 'gasworks-house' ); ?></span>
			<span class="nav-toggle-bar"></span>
		</button>

		<nav class="site-nav" id="site-nav" aria-label="<?php esc_attr_e( 'Main', 'gasworks-house' ); ?>">
			<?php
			if ( has_nav_menu( 'primary' ) ) {
				wp_nav_menu( array( 'theme_location' => 'primary', 'container' => false, 'menu_class' => 'nav-list', 'depth' => 1 ) );
			} else {
				?>
				<ul class="nav-list">
					<li><a href="<?php echo esc_url( $gwh_anchor . '#house' ); ?>"><?php esc_html_e( 'The House', 'gasworks-house' ); ?></a></li>
					<li><a href="<?php echo esc_url( $gwh_anchor . '#parties' ); ?>"><?php esc_html_e( 'Hens & Stags', 'gasworks-house' ); ?></a></li>
					<li><a href="<?php echo esc_url( $gwh_anchor . '#carrick' ); ?>"><?php esc_html_e( 'Carrick', 'gasworks-house' ); ?></a></li>
					<li><a href="<?php echo esc_url( $gwh_anchor . '#faq' ); ?>"><?php esc_html_e( 'FAQ', 'gasworks-house' ); ?></a></li>
				</ul>
				<?php
			}
			?>
			<a class="btn btn-small" href="<?php echo esc_url( $gwh_anchor . '#book' ); ?>"><?php esc_html_e( 'Check dates', 'gasworks-house' ); ?></a>
		</nav>
	</div>
</header>
