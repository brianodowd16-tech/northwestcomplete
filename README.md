# Northwest Boat Maintenance — northwestboatmaintenance.com

Transactional e-commerce website for a marine services business in the North West of Ireland.
Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS** and **Stripe Checkout** (EUR, prices include VAT).

## What's on the site

| Area | What customers can do |
| --- | --- |
| **Services** (`/services`) | Mechanical, machine polishing, fiberglass restoration, welding, electrical fit-out, solar & battery systems, deep cleaning, brokerage, engine sourcing. Book & pay online — fixed-price packages, per-foot pricing (enter boat length) and booking deposits — or request a quote. |
| **Shop** (`/shop`) | Care products, engine service parts, solar/electrical components and gift vouchers, with category filters. Tracked delivery to IE & NI (free over €100) or free collection. |
| **Boats for sale** (`/boats`) | Brokerage listings with refundable online reservation deposits and viewing requests. `/boats/sell` takes valuation requests. |
| **Engine sourcing** (`/engine-sourcing`) | Detailed sourcing request form plus an optional paid priority-search deposit. |
| **Basket & checkout** | Basket saved in the browser → Stripe Checkout (card, Apple Pay, Google Pay, promo codes). Service orders collect boat details & location. |
| Also | About, Contact/quote, Terms, Privacy, sitemap.xml, robots.txt, schema.org LocalBusiness/Product data. |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev                  # http://localhost:3000
```

Without `STRIPE_SECRET_KEY` the site works but checkout returns a "payments not configured" message.
Without `RESEND_API_KEY` enquiry/order emails are printed to the server log.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://northwestboatmaintenance.com` |
| `STRIPE_SECRET_KEY` | Stripe secret key (use `sk_test_…` until you go live) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook below |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key for emails |
| `NOTIFY_EMAIL` | Where enquiries and order notifications go |
| `FROM_EMAIL` | Verified sender, e.g. `Northwest Boat Maintenance <noreply@northwestboatmaintenance.com>` |

### Stripe setup

1. Create a Stripe account with Ireland as the business country, and copy the secret key.
2. Add a webhook endpoint `https://northwestboatmaintenance.com/api/webhooks/stripe` for the
   `checkout.session.completed` event and copy its signing secret. You'll get an email for every paid order.
3. Settings → Emails: turn on "Successful payments" so customers receive receipts.
4. Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

Prices are always recalculated on the server from the catalogue (`src/lib/catalog.ts`); the browser cannot change them.

## Editing content

All catalogue content lives in plain TypeScript files. Prices are in **euro cents, VAT inclusive**.

- `src/data/services.ts` — services, what's included, and bookable options (`fixed`, `per-foot`, `deposit`)
- `src/data/products.ts` — shop products (set `inStock: false` to stop sales)
- `src/data/boats.ts` — boat listings (**the three included are samples — replace them**)
- `src/lib/site.ts` — business name, phone, email, areas served
- `src/lib/catalog.ts` — delivery price and free-delivery threshold

Before launch: add your real phone number, have a solicitor check `/terms` and `/privacy`, and swap the icon tiles for real photos.

## Deploying to northwestboatmaintenance.com

The easiest option is [Vercel](https://vercel.com): import this repo, add the environment variables, then
under Domains add `northwestboatmaintenance.com` and `www.northwestboatmaintenance.com` and update the DNS
records at your registrar as shown. Any Node 18+ host works too: `npm run build && npm start`.

## Scripts

`npm run dev` · `npm run build` · `npm start` · `npm run lint` · `npm run typecheck`
