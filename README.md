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
- `api/`: myPOS checkout, payment notification, Xero connection and automations (see below)
- `terms.html`, `privacy.html`: terms and refund policy and privacy notice (required for payment provider approval)
- `.htaccess`: HTTPS and canonical redirects, security headers, caching, compression
- `robots.txt`, `sitemap.xml`, `404.html`, `assets/og-image.png`: search and sharing
- `tests/`: end-to-end payment test and static site checks (run in CI on every push)
- `styles.css`: styles
- `script.js`: nav, scroll animations, sends the contact form to `contact.php`
- `contact.php`: emails enquiries to `TO_EMAIL` (set at the top). Includes a honeypot, a minimum fill time and a limit of 5 enquiries per visitor per hour. `FROM_EMAIL` must be a real mailbox on the domain.
- `assets/logos/`: partner logos from [Simple Icons](https://simpleicons.org) (CC0). SiteMinder, Mews, Try.be, Salto and HikCentral aren't in Simple Icons, so they're shown as text wordmarks. Drop official SVGs in here and swap them in `index.html` if you have them.

## Audit checkout and automations

Clients book the €500 systems audit on `book-audit.html` and pay by card on myPOS's hosted payment page. The site sends a signed form to myPOS; when the customer pays, myPOS posts a signed notification to `api/mypos-notify.php`. The signature is verified with myPOS's public certificate, and the amount, currency and store are checked against our own order record before the site runs each enabled step once:

1. **Xero:** creates an approved sales invoice (no VAT), records the payment against the bank account you choose, and emails the invoice to the client.
2. **Odoo CRM:** creates or updates the contact and adds an opportunity marked as won.
3. **Client email:** confirmation with reference and, if set, your booking link.
4. **Team email:** full details plus how every step went.
5. **Optional webhook:** the paid order as signed JSON, for n8n, Make or Zapier.

Website enquiries (`contact.php`) also create a contact and a new lead in your Odoo CRM pipeline when Odoo is configured, and send the enquirer an automatic acknowledgement from Brían.

A step that fails never blocks the others; the team email shows what failed. A forged or wrong-amount notification is never accepted.

### One-time setup

1. **Config:** copy `nwc-config.sample.php` to `nwc-config.php` in the folder *above* `public_html` on Hostinger (File Manager), and fill it in. It holds all keys and is never deployed or committed.
2. **myPOS:** in your myPOS account open Online > Checkout > Your online store, create a store, and download the configuration pack. Put its Store ID, client number and key index in the config, save the private key and the myPOS public certificate next to `nwc-config.php` (above `public_html`), and point `mypos_private_key` and `mypos_public_cert` at them. Keep `mypos_sandbox => true` while testing with a myPOS test store, then use live details and `false`. If the pack gives a different checkout address, set `mypos_checkout_url`.
3. **Xero:** at developer.xero.com create a Web app with redirect URI `https://northwestcomplete.com/api/xero-connect.php`, put the client ID and secret in the config, set `xero_payment_account_code` to the Xero bank account your myPOS payouts land in, set an `admin_key` (any long random string), then open `https://northwestcomplete.com/api/xero-connect.php?key=YOUR_ADMIN_KEY` and approve.
4. **Odoo:** in Odoo go to your avatar > Preferences > Account Security > New API Key, then set `odoo_url`, `odoo_db` and `odoo_api_key` in the config. Odoo 19 and newer use the default settings; for Odoo 18 or older set `odoo_legacy_api => true` and add your login in `odoo_login`.

Order records and Xero tokens are stored in `nwc-data/`, next to the config and outside the web root.

## Automated checks

- **Checks** (`.github/workflows/ci.yml`) runs on every push: PHP syntax, `tests/mypos-flow.sh` (a full payment run with throwaway keys: signed checkout form, forged and wrong-amount notifications rejected, fulfilment exactly once) and `tests/check-site.py` (links, assets, SEO basics).
- **Site monitor** (`.github/workflows/monitor.yml`) runs every 6 hours against the live site: both addresses must load over a trusted certificate with at least 14 days left, and the payment notification endpoint must be alive. A failure emails the repository owner.
- **Deploy** (`.github/workflows/deploy.yml`) runs those checks, then uploads to Hostinger.
