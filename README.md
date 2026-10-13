# St Michael's GAA & LGFA — Christmas Holiday & Fuel Draw

Online ticket sales for the club's Christmas Holiday & Fuel Draw, with payment through **Stripe Checkout**.

- **Landing page** (`public/index.html`): a fuel-gauge hero showing tickets sold against the target, a countdown, the 16 prizes (top three as feature cards, the rest on a prize board), a pump-style ticket picker with bundle pricing, a sticky mobile buy bar, and an FAQ.
- **Checkout**: Stripe-hosted, so card, Apple Pay and Google Pay all work. It collects the buyer's full name, phone and email, plus an optional "club member who sent you" field so sellers get credit.
- **Fulfilment**: a signature-verified webhook allocates sequential ticket numbers. The success page "prints" them on a receipt and has WhatsApp and Facebook share buttons.
- **Admin**: `GET /api/admin/tickets.csv` exports one row per ticket for running the draw (needs `ADMIN_TOKEN`).

## Run locally

```bash
npm install
cp .env.example .env     # leave STRIPE_SECRET_KEY empty for demo mode
npm run dev              # http://localhost:3000
npm test
```

Without a Stripe key the site runs in **demo mode**: checkout skips payment and issues test tickets.

### With Stripe test mode

1. Put your `sk_test_...` key in `.env` as `STRIPE_SECRET_KEY`.
2. Forward webhooks with `stripe listen --forward-to localhost:3000/api/webhook` and copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.
3. Pay with test card `4242 4242 4242 4242`.

## Going live

1. Deploy to any Node 20+ host (Render, Railway, Fly.io and similar). Set `NODE_ENV=production`, `PUBLIC_URL`, the live Stripe keys and `ADMIN_TOKEN`.
2. Point `DATA_FILE` at a **persistent disk**: orders are stored in a JSON file.
3. In the Stripe Dashboard, add a webhook endpoint at `https://YOUR-DOMAIN/api/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
4. Turn on **email receipts** in Stripe (Settings → Emails) so buyers get their receipt.

## Editing the draw

Everything lives in `config/draw.json`:

| Field | Purpose |
|---|---|
| `drawDate`, `salesCloseDate` | Countdown, and checkout closes automatically at `salesCloseDate` |
| `bundles` | Ticket options. Prices are in cents. Mark one `"featured": true` |
| `prizes` | In order, 1st first. Each has `title`, optional `detail`, `value` and `sponsor`, and a `kind` (`holiday`, `fuel` or `home`) |
| `ticketTarget` | The "F" on the fuel gauge |
| `ticketsSoldOffset` | Adds paper or offline sales to the gauge |
| `licenceNote` | Lottery licence or permit number, shown in the footer |

Club colours are CSS variables at the top of `public/styles.css` (`--holly`, `--amber`, `--ember`).

## Endpoints

| Method | Path | |
|---|---|---|
| GET | `/api/draw` | Public draw config and tickets sold |
| POST | `/api/checkout` | `{ bundleId, quantity }` → Stripe Checkout URL. Prices come from the server config, never the client |
| POST | `/api/webhook` | Stripe webhook (raw body, signature verified) |
| GET | `/api/order/:sessionId` | Ticket numbers for the success page. Falls back to retrieving the session from Stripe if the webhook hasn't arrived yet |
| GET | `/api/admin/tickets.csv` | CSV export (`Authorization: Bearer $ADMIN_TOKEN`) |
