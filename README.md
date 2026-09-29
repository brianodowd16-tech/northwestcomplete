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
- `about.html`: story, vision, values and team
- `book-audit.html`, `payment-complete.html`: €500 systems audit booking and payment result
- `api/`: Revolut checkout, payment webhook, Xero connection and automations (see below)
- `styles.css`: styles
- `script.js`: nav, scroll animations, sends the contact form to `contact.php`
- `contact.php`: emails enquiries to `TO_EMAIL` (set at the top). Includes a honeypot, a minimum fill time and a limit of 5 enquiries per visitor per hour. `FROM_EMAIL` must be a real mailbox on the domain.
- `assets/logos/`: partner logos from [Simple Icons](https://simpleicons.org) (CC0). SiteMinder, Mews, Try.be, Salto and HikCentral aren't in Simple Icons, so they're shown as text wordmarks. Drop official SVGs in here and swap them in `index.html` if you have them.

## Audit checkout and automations

Clients book the €500 systems audit on `book-audit.html` and pay on Revolut's hosted checkout. When Revolut confirms the payment (by webhook, or when the client lands on `payment-complete.html`, whichever comes first), the site runs each enabled step once:

1. **Xero:** creates an approved sales invoice (no VAT), records the payment against your Revolut Business bank account, and emails the invoice to the client.
2. **HubSpot:** creates or updates the contact and adds a won deal.
3. **Client email:** confirmation with reference and, if set, your booking link.
4. **Team email:** full details plus how every step went.
5. **Optional webhook:** the paid order as signed JSON, for n8n, Make or Zapier.

A step that fails never blocks the others; the team email shows what failed.

### One-time setup

1. **Config:** copy `nwc-config.sample.php` to `nwc-config.php` in the folder *above* `public_html` on Hostinger (File Manager), and fill it in. It holds all keys and is never deployed or committed.
2. **Revolut:** in Revolut Business, open Merchant > API, and copy the secret key into `revolut_secret_key`. Keep `sandbox => true` with sandbox keys until you've tested, then switch to production keys and `false`.
3. **Revolut webhook:** set an `admin_key` (any long random string) in the config, then open `https://northwestcomplete.com/api/revolut-setup.php?key=YOUR_ADMIN_KEY`. It registers the webhook and saves the signing secret. Run it again after switching to live keys.
4. **Xero:** at developer.xero.com create a Web app with redirect URI `https://northwestcomplete.com/api/xero-connect.php`, put the client ID and secret in the config, set `xero_payment_account_code` to your Revolut bank account's code in Xero, then open `https://northwestcomplete.com/api/xero-connect.php?key=YOUR_ADMIN_KEY` and approve.
5. **HubSpot:** create a private app with contacts read/write and deals write scopes, and paste its token into `hubspot_token`.

Order records and Xero tokens are stored in `nwc-data/`, next to the config and outside the web root.
