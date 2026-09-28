# Northwest Complete Limited

Marketing website for Northwest Complete Limited: full stack software, booking platforms, POS, accounting automation, n8n workflows, ticketing, business hardware/software installation, Meta ads and Canva design.

Static site with no build step, plus one PHP file for the contact form. Hosted on Hostinger: upload the files into `public_html`.

- `index.html`: page content
- `styles.css`: styles
- `script.js`: nav, scroll animations, sends the contact form to `contact.php`
- `contact.php`: emails enquiries to `TO_EMAIL` (set at the top). Includes a honeypot, a minimum fill time and a limit of 5 enquiries per visitor per hour. `FROM_EMAIL` must be a real mailbox on the domain.
- `assets/logos/`: partner logos from [Simple Icons](https://simpleicons.org) (CC0). SiteMinder, Mews, Try.be, Salto and HikCentral aren't in Simple Icons, so they're shown as text wordmarks. Drop official SVGs in here and swap them in `index.html` if you have them.
