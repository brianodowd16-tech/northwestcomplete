# WooCommerce setup for northwestboatmaintenance.com

These scripts load the services, shop products, boat listings and delivery setup from `src/data/`
into the live WooCommerce store, so the WordPress site can be the shop you manage yourself.

## Option A — automatic sync (recommended)

1. In WordPress: **WooCommerce → Settings → Advanced → REST API → Add key**, permission **Read/Write**.
2. Make the key available as `WC_CONSUMER_KEY` and `WC_CONSUMER_SECRET` (environment variables — never commit them).
3. Run:

```bash
npm run woo:sync -- --dry-run   # show what would change
npm run woo:sync                # create/update everything as drafts
npm run woo:sync -- --publish   # same, but publish new products (sample boats always stay drafts)
```

What it does:
- Switches the store currency to **EUR** (it was USD) and checks the store country is Ireland.
- Creates categories: *Services* (one sub-category per service), *Shop* (Care & Polishing, Engine Parts,
  Electrical & Solar, Gift Vouchers) and *Boats for Sale*.
- Creates 35 products matched by SKU (`NWBM-…`), so re-running updates rather than duplicates.
  Products you've since published keep their status.
- Creates delivery zones **Ireland** and **Northern Ireland** (BT postcodes): €7.95 tracked, free over €100, free collection.
  Existing zones with the same name are left alone.
- Never deletes anything (the existing "Booking Deposit" product is untouched).

## Option B — upload a CSV (no API key)

`npm run woo:csv` regenerates `woocommerce/products.csv`. Upload it at **Products → Import**.
All products import as drafts. Then set the currency to Euro and add delivery zones by hand
(WooCommerce → Settings → General / Shipping).

## Per-foot services

Polishing, antifouling and cleaning are priced per foot: the product says "set the quantity to your boat
length in feet". For a proper "boat length" box with a minimum, add a plugin such as
WooCommerce Product Add-Ons or a measurement price calculator.

## After the import

- Review every price (they're starting suggestions) and publish the products you want live.
- Replace the three sample boats with real listings (duplicate a boat product, edit, publish).
- Payments: install **WooCommerce Stripe Payment Gateway** (cards, Apple Pay, Google Pay).
- Email: install **WP Mail SMTP** → "Other SMTP" with your Hostinger mailbox:
  host `smtp.hostinger.com`, port `465`, encryption SSL, username = your full email address.
- Tax: WooCommerce → Settings → Tax → enter prices *inclusive* of tax, add Irish 23% standard rate
  (13.5% may apply to some services — check with your accountant).
- Tidy up the theme demo pages (Rhye, sliders, albums, grids) under Pages.
