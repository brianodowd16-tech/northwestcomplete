# Go-live checklist

Steps to take the Super Fuel & Holiday Draw site live. The code is ready. What's left is accounts, hosting and one test purchase.

## 1. Stripe account (club officer, about 30 minutes, plus Stripe's review)

1. Sign up at stripe.com as **St Michael's GAA & LGFA**, country Ireland. Add the **club's bank account** and verify the officer's identity.
2. **Get approval for a lottery before taking real money.** Stripe treats lotteries and raffles as a restricted business. Contact Stripe support, say it is a licensed club fundraising draw, and send them the lottery licence. If you skip this, Stripe can close the account and hold the money.
3. Turn on receipts: **Settings → Customer emails → Successful payments**.
4. Copy the **test** secret key (`sk_test_…`) from **Developers → API keys**. You'll need the live key (`sk_live_…`) later.

## 2. Hosting on Render (about 15 minutes, roughly $8 a month)

1. Sign in to render.com with GitHub, then **New → Blueprint** and pick this repository. `render.yaml` sets up the server, a health check and a 1 GB disk for orders.
2. When asked, enter:
   - `PUBLIC_URL`: the site's address, e.g. `https://draw.stmichaelsgaa.ie`
   - `STRIPE_SECRET_KEY`: the test key for now
   - `STRIPE_WEBHOOK_SECRET`: fill in after step 3
   - `ADMIN_TOKEN` is generated for you. Find it under the service's **Environment** tab.
3. **Custom domain:** in Render go to **Settings → Custom Domains**, add the address, and create the CNAME record it shows at your domain provider. HTTPS is set up automatically.

## 3. Stripe webhook (5 minutes)

In Stripe go to **Developers → Webhooks → Add endpoint**:
- URL: `https://YOUR-DOMAIN/api/webhook`
- Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`

Copy the signing secret (`whsec_…`) into Render's `STRIPE_WEBHOOK_SECRET`. Render restarts the site.

## 4. Test purchase (10 minutes)

1. Buy a 3-line bundle on the live site with card `4242 4242 4242 4242`, any future expiry date and any CVC.
2. Check that:
   - the confirmation page says 3 lines entered, in the name you gave
   - in Stripe, the payment's description reads "3 lines for (your name)", and its metadata shows "Card 1, lines 1-3"
   - the printable cards page shows those 3 lines on Online card 1: `https://YOUR-DOMAIN/admin/cards?token=ADMIN_TOKEN`
3. Share the link in WhatsApp and check that the preview card shows.

## 5. Switch to live

1. In Stripe, switch off **Test mode**. Create the same webhook again in live mode.
2. In Render, replace `STRIPE_SECRET_KEY` with `sk_live_…` and `STRIPE_WEBHOOK_SECRET` with the live `whsec_…`.
3. Test orders were saved on the disk. Delete `/var/data/orders.json` in Render's **Shell** tab so the live entries start on Online card 1. Then restart.
4. Do one real €5 purchase, then refund it from Stripe if you like. A refund does not remove the lines from the cards. Cross them out by hand before printing.

## Before launch: decisions

- **Sales close time:** 7pm on 30 December (`salesCloseDate` in `config/draw.json`).
- **Terms:** have the committee read `/terms`.

## On the night

1. After online entries close (7pm), open `https://YOUR-DOMAIN/admin/cards?token=ADMIN_TOKEN` on a laptop.
2. Press **Print cards**. Each online card prints on its own A4 page, in the same layout as the paper cards: lines 1–20, name and contact details, and the seller (or "Online").
3. Put the printed online cards in with the paper cards and draw as normal. A winning online line has the buyer's phone and email on the card.

The same page has a spreadsheet download (CSV) of every online line, as a backup. You can also print the cards earlier, for example each week, to keep a paper record as sales come in. Cards fill in order, so reprint the latest card if it has gained lines since.
