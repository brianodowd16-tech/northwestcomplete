# Northwest Complete Limited

Marketing website for Northwest Complete Limited: full stack software, booking platforms, POS, accounting automation, n8n workflows, ticketing, business hardware/software installation, Meta ads and Canva design.

Static site with no build step, plus one PHP file for the contact form. Hosted on Hostinger.

## Deploying

Every push to `main` deploys automatically to Hostinger over FTP (`.github/workflows/deploy.yml`). Only changed files are uploaded.

One-time setup in GitHub under **Settings → Secrets and variables → Actions**:

| Secret | Where to find it |
| --- | --- |
| `FTP_SERVER` | hPanel → Files → FTP Accounts → FTP IP / hostname |
| `FTP_USERNAME` | same page, e.g. `u123456789` |
| `FTP_PASSWORD` | same page (use "Change FTP password" if you don't know it) |

Optional **variables** (Variables tab): `FTP_SERVER_DIR` if the site isn't in `public_html/` for that FTP account, and `FTP_PROTOCOL=ftp` if FTPS won't connect.

To deploy manually, open **Actions → Deploy to Hostinger → Run workflow**.

- `index.html`: home page
- `about.html`: story, vision, values and team (replace the `[bracketed]` team placeholders)
- `styles.css`: styles
- `script.js`: nav, scroll animations, sends the contact form to `contact.php`
- `contact.php`: emails enquiries to `TO_EMAIL` (set at the top). Includes a honeypot, a minimum fill time and a limit of 5 enquiries per visitor per hour. `FROM_EMAIL` must be a real mailbox on the domain.
- `assets/logos/`: partner logos from [Simple Icons](https://simpleicons.org) (CC0). SiteMinder, Mews, Try.be, Salto and HikCentral aren't in Simple Icons, so they're shown as text wordmarks. Drop official SVGs in here and swap them in `index.html` if you have them.
