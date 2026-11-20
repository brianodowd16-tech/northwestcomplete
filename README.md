# Northwest Boat Maintenance — northwestboatmaintenance.com

Transactional e-commerce website for a marine services business in Ireland and Malta.
Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS** and **myPOS Checkout** (EUR, prices include VAT).

## What's on the site

| Area | What customers can do |
| --- | --- |
| **Services** (`/services`) | Mechanical, machine polishing, fiberglass restoration, welding, electrical fit-out, solar & battery systems, deep cleaning, brokerage, engine sourcing. Book & pay online — fixed-price packages, per-foot pricing (enter boat length) and booking deposits — or request a quote. |
| **Shop** (`/shop`) | Care products, engine service parts, solar/electrical components and gift vouchers, with category filters. Tracked delivery to Ireland, Northern Ireland and Malta & Gozo, or free collection. |
| **Boats for sale** (`/boats`) | Brokerage listings with refundable online reservation deposits and viewing requests. `/boats/sell` takes valuation requests. |
| **Engine sourcing** (`/engine-sourcing`) | Detailed sourcing request form plus an optional paid priority-search deposit. |
| **Basket & checkout** | Basket → checkout details page → signed hand-off to the myPOS hosted payment page. Payment confirmation emails go to the business and the customer automatically. |
| Also | About, Contact/quote, Terms, Privacy, sitemap.xml, robots.txt, schema.org LocalBusiness/Product data. |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev                  # http://localhost:3000
```

Without the `MYPOS_*` variables checkout shows a "payments being set up" message with the WhatsApp number.
Without `RESEND_API_KEY` emails are printed to the server log. All variables are listed in `.env.example`.

### myPOS setup

1. In your myPOS account go to **Online → Online stores → (your store) → Integration** and download the
   configuration package. It contains the Store ID (`MYPOS_SID`), wallet number, key index, your store private key
   and the myPOS public certificate.
2. Put them in the hosting environment variables (never commit them). Keep `MYPOS_SANDBOX=true` while testing.
3. Test with the myPOS test cards (e.g. Visa 4006 0900 0000 0007, any future expiry, any CVC). Sandbox test
   credentials are on the myPOS developer site under *Testing in sandbox → Test data*.
4. Go live: set `MYPOS_SANDBOX=false` with your live configuration package.

How it works: `/api/checkout` validates the basket against the catalogue (prices can't be changed in the browser),
signs the request exactly like the official myPOS SDK, and the browser posts it to myPOS. myPOS then calls
`/api/mypos/notify` (signature verified with the myPOS certificate, answers `OK`), which emails the business and the
customer. `/api/mypos/ok` and `/api/mypos/cancel` bring the customer back to the site.

## Automation & quality

- **Every push** runs GitHub Actions CI (`.github/workflows/ci.yml`): lint, typecheck, tests, build.
- **Deploy**: connect the repo to Vercel; every push to `main` deploys automatically, pull requests get preview URLs.
- **Orders**: "order started" and "PAID" emails to the business, confirmation email to the customer, no manual steps.
- **Speed & security**: static pages, optimised AVIF/WebP images, year-long caching for photos, security headers.
- `npm run check` runs everything CI runs, locally.

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
