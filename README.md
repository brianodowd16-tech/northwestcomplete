# St Michael's GAA & LGFA — Super Fuel & Holiday Draw

Online entry sales for the club's Super Fuel & Holiday Draw, with payment through **Stripe Checkout**.

- **Landing page** (`public/index.html`): an interactive fuel-gauge hero where visitors tap a fill (€5 to €500) and watch the tank fill, a countdown, the 15 prizes (top three as feature cards, the rest on a prize board), a pump-style line picker with bundle pricing, a sticky mobile buy bar, and an FAQ.
- **Checkout**: Stripe-hosted, so card, Apple Pay and Google Pay all work. It collects the buyer's full name, phone and email, plus an optional "club member who sent you" field so sellers get credit.
- **Fulfilment**: a signature-verified webhook places each order's lines on numbered **online cards** of 20 lines, in the same layout as the paper draw cards. An order that fits on one card is kept together. Buyers see how many lines they entered and in whose name, never line numbers. The confirmation page has WhatsApp and Facebook share buttons.
- **Admin**: `/admin/cards?token=ADMIN_TOKEN` shows the online cards ready to print (one per A4 page) and links to a CSV backup.

**Going live?** Follow [docs/GO-LIVE.md](docs/GO-LIVE.md).

## Run locally

```bash
npm install
cp .env.example .env     # leave STRIPE_SECRET_KEY empty for demo mode
npm run dev              # http://localhost:3000
npm test
```

Without a Stripe key the site runs in **demo mode**: checkout skips payment and enters test lines.

`node scripts/build-preview.js preview.html` bundles the site into one self-contained HTML file with simulated checkout, for sharing a clickable preview.

### With Stripe test mode

1. Put your `sk_test_...` key in `.env` as `STRIPE_SECRET_KEY`.
2. Forward webhooks with `stripe listen --forward-to localhost:3000/api/webhook` and copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.
3. Pay with test card `4242 4242 4242 4242`.

## Hostinger (PHP) version

`npm run build:hostinger` builds `dist/stmichaels-draw-hostinger.zip`: the same site taking card payments with **SumUp** (rebuilt from SumUp's WooCommerce plugin: API checkout, SumUp's card widget, and server-side confirmation by reading the checkout back from SumUp's API), falling back to "order now, pay the club" when SumUp isn't configured or can't be reached. It emails the club and the buyer, and has a PHP admin page for orders and printing the online cards. The PHP lives in `hostinger/`. See [docs/HOSTINGER.md](docs/HOSTINGER.md).

## Going live

See [docs/GO-LIVE.md](docs/GO-LIVE.md): Stripe account and lottery approval, Render hosting (`render.yaml`), the webhook, a test purchase, then the switch to live keys. In production the server refuses to start without the Stripe keys, the webhook secret, an `ADMIN_TOKEN` of 24+ characters, and an `https://` `PUBLIC_URL`.

## Editing the draw

Everything lives in `config/draw.json`:

| Field | Purpose |
|---|---|
| `drawDate`, `salesCloseDate` | Countdown, and checkout closes automatically at `salesCloseDate` |
| `bundles` | Line options: `lines` and `price` (in cents). Mark one `"featured": true`; `"group": "big"` puts a bundle in the "Go big" row |
| `maxOrderTotal` | Largest single online order, in cents (€500) |
| `fullTankLines` | Lines that fill the hero gauge to F (20, the €50 bundle); bigger bundles keep it full |
| `prizes` | In order, 1st first. Each has `title`, optional `detail`, `value` and `sponsor`, and a `kind` (`holiday`, `fuel`, `home` or `event`) |
| `linesPerCard` | Lines on each printed online card (20, as on the paper cards) |
| `address` | Club address, shown in the footer |
| `mapsUrl` | Google Maps link for the footer's Directions link |
| `licenceNote` | Licence line in the footer |

Club colours are CSS variables at the top of `public/styles.css` (`--holly`, `--amber`, `--ember`).

## Endpoints

| Method | Path | |
|---|---|---|
| GET | `/api/draw` | Public draw config |
| POST | `/api/checkout` | `{ bundleId, quantity }` → Stripe Checkout URL. Prices come from the server config, never the client |
| POST | `/api/webhook` | Stripe webhook (raw body, signature verified) |
| GET | `/api/order/:sessionId` | Line count and name for the confirmation page. Falls back to retrieving the session from Stripe if the webhook hasn't arrived yet |
| GET | `/admin/cards` | Printable online cards (`?token=` or `Authorization: Bearer`) |
| GET | `/api/admin/lines.csv` | One row per online line: card, line, name, phone, email, seller |
