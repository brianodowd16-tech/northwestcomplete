# northwestcomplete

A fast storefront for **O'Dowd's Fireplaces & Stoves** with **myPOS** card payments.

- **WordPress / WooCommerce stays the back office.** You add products, change prices and stock, edit range pages and handle orders in the same admin as today.
- **This repo is the shop customers see.** It's a Next.js site that reads from WooCommerce, takes payment through myPOS Checkout and writes paid orders back into WooCommerce.

```
Customer ──► Storefront (this repo, on Vercel)
               │  reads catalogue/range ─────────► WooCommerce Store API + WP pages (public)
               │  creates order (pending) ───────► WooCommerce REST API (API keys)
               └─ redirects to pay ──────────────► myPOS hosted checkout
myPOS ──► /api/mypos/notify (signed) ──► order marked paid in WooCommerce ──► Woo sends receipt email
WooCommerce product webhook ──► /api/revalidate ──► storefront refreshes prices/stock within seconds
```

## What's included

| Area | Details |
| --- | --- |
| Pages | Home, Special Offers (`/shop`), product pages, the full showroom range (`/range`, about 300 models, grouped by brand), Servicing, About, Visit Us (with enquiry form), Terms, Privacy, basket, checkout and order confirmation |
| Consultation | A guided, clickable consultation on the homepage that recommends fuel, heat output and flue options based on Irish practice. It ends in a consultation request to your team. An optional "ask anything" box answers from the knowledge base using Claude |
| Fulfilment | Click & Collect only for now. Courier partners plug into `src/lib/fulfilment.ts` without touching checkout |
| Payments | myPOS Checkout (IPC 1.4). Requests are RSA-signed, callbacks are signature-checked, and the order is paid only if the amount and currency match. Repeat callbacks are handled safely, and rollbacks put the order on hold |
| Safety | The basket only sends product ids and quantities. Prices and stock are re-checked against WooCommerce at checkout, and order pages need the private order key |
| Merchandising | The homepage shows only in-stock offers over €100 (`MERCH` in `src/lib/config.ts`). The full list stays on `/shop` |
| Speed | Static pages with background refresh (products every 5 minutes, range every hour, instantly via webhook), AVIF/WebP images, two self-hosted fonts |
| SEO | Titles and descriptions, sitemap, robots.txt, Product and LocalBusiness structured data, and 301 redirects from the old WordPress URLs |
| Automation | CI (typecheck, tests, build) on every push, a live-site check every 30 minutes, and auto-refresh when products change |

## Run locally

```bash
npm install
cp .env.example .env.local   # add WooCommerce keys to test checkout
npm run dev                  # http://localhost:3000
npm test                     # unit tests (signing, callbacks, maths, parsing)
```

Without WooCommerce keys, browsing works but checkout asks shoppers to email their order instead.

## Going live: checklist

### 1. WooCommerce API keys (5 minutes)
1. In WordPress, go to **WooCommerce → Settings → Advanced → REST API → Add key**.
2. Set the description to `Storefront`, the user to an admin, and permissions to **Read/Write**.
3. Copy the consumer key and secret into `WC_CONSUMER_KEY` and `WC_CONSUMER_SECRET` on Vercel.

### 2. Deploy to Vercel (10 minutes)
1. Go to [vercel.com](https://vercel.com), choose **Add New → Project**, and import `brianodowd16-tech/northwestcomplete`.
2. Add the environment variables from `.env.example`. Leave `MYPOS_MODE=sandbox` for now.
3. Set `SITE_URL` to the Vercel URL, for example `https://northwestcomplete.vercel.app`.
4. Deploy, then place a test order with card **4006 0900 0000 0007**, expiry **12/30**, any CVC. The order should appear in WooCommerce as **Processing**, with a note "SANDBOX – not a real payment".

### 3. myPOS live keys
1. In your myPOS account, go to **Online → Online stores** and create a store for `odowdscarrick.com`.
2. Download its **configuration pack**, or the Store ID, wallet number, key index, private key and myPOS public certificate.
3. On Vercel, set `MYPOS_MODE=live` and `MYPOS_CONFIG_PACK=<the pack>`, then redeploy.
4. Place one small real order and refund it from myPOS to confirm everything works end to end.

### 4. Instant price and stock updates
In **WooCommerce → Settings → Advanced → Webhooks**, add three webhooks:

- **Topics:** Product created, Product updated and Product deleted.
- **Delivery URL:** `https://<site>/api/revalidate`
- **Secret:** the same value as `WC_WEBHOOK_SECRET`.

To refresh range pages straight away after editing them, use `https://<site>/api/revalidate?scope=content`. Otherwise they refresh every hour.

### 5. Switch the domain over
1. Move WordPress to a subdomain such as `admin.odowdscarrick.com`. With your host (Hostinger), add the subdomain, then change **Settings → General → WordPress Address and Site Address**.
2. On Vercel:
   - Set `WC_URL=https://admin.odowdscarrick.com` and `SITE_URL=https://odowdscarrick.com`.
   - Add `odowdscarrick.com` and `www.odowdscarrick.com` as domains.
   - Point DNS where Vercel tells you.
3. The storefront passes old `/wp-content/...` image links through to the subdomain, and redirects old page URLs such as `/contact-us` and `/clearance`. That way no image or link breaks.

### 6. Online consultation
1. **Where requests go:** set `ENQUIRY_WEBHOOK_URL` to any endpoint that accepts JSON. That can be a CRM (HubSpot, Pipedrive), a Zapier or Make zap that emails the team or posts to Teams, or a Slack incoming webhook. Each request includes the customer's answers, the recommendation and a priority (`high` if they want it within a month).
2. **The "ask anything" box:** set `ANTHROPIC_API_KEY`. The assistant answers only from the knowledge base, never quotes prices, stock or lead times, and directs gas and electrical work to registered installers.
3. **Train it on your business:** edit `content/knowledge-base.md`. It's plain Markdown covering your process, products, policies and FAQs. To manage it outside the code, publish it as a plain-text or Markdown URL and set `KNOWLEDGE_BASE_URL`. Changes are picked up within an hour.
4. **Change the guided questions or the advice:** edit `src/lib/consultation.ts`. It's all plain data and functions, and covered by tests.

### 7. Turn on the 30-minute live-site check
In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add `SITE_URL=https://odowdscarrick.com`. If the site, the catalogue or the payment callback stops responding, the workflow fails and GitHub emails you.

### Before launch, please review
- **Terms and privacy pages** (`src/app/terms`, `src/app/privacy`): sensible defaults written to Irish consumer rules, but check them against how you actually trade.
- **Courier delivery:** add a provider to `FULFILMENT_OPTIONS` in `src/lib/fulfilment.ts`, with a `quote()` function for prices. Checkout, validation and the WooCommerce order pick it up automatically.
- **Knowledge base:** `content/knowledge-base.md` is written from common Irish heating-sector practice. Review it, and add your own process, warranties and FAQs.

## Project layout

```
src/lib/mypos.ts        myPOS signing, verification, payment request building
src/lib/payments.ts     myPOS callback handling (the only place orders become paid)
src/lib/checkout.ts     validates the basket against live prices and creates the Woo order
src/lib/woo.ts          WooCommerce catalogue (Store API) and orders (REST API)
src/lib/content.ts      turns the Elementor range pages into structured data
src/lib/consultation.ts guided consultation questions and recommendation rules
src/lib/assistant.ts    "ask anything" answers via Claude, grounded in the knowledge base
src/lib/fulfilment.ts   collection/delivery options (courier partners plug in here)
content/knowledge-base.md  what the consultation assistant knows
src/app/...             pages and API routes
tests/                  unit tests
scripts/smoke.mjs       live-site check used by the monitor workflow
```
