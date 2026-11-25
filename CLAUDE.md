# CLAUDE.md — Complete

Complete is a white-label ordering, payments and loyalty platform for Irish bars, hotels and restaurants. Guests pay through each venue's own myPOS (or Revolut) account; sales go to the venue's Xero nightly. Counter sales go through Complete's till (cash, or card on the venue's own myPOS terminal) or stay on the venue's existing till. Pilot venues: MJ O'Connor's and Drumhierny Woodland Hideaway, 20 tables each.

**`SPEC.md` is the source of truth** for scope, data model, flows and build order. Read it before starting any step. If the prototype artifact ("Round Venue Platform") disagrees with `SPEC.md`, follow `SPEC.md`.

## Non-negotiables

- **Tenancy:** every row has `tenant_id`; most have `venue_id`. Enforce with Postgres RLS plus a scoped repository. Never trust a venue ID, table ID or price from the client.
- **Money:** integer cents everywhere. Prices are VAT-inclusive. VAT is calculated per line and rounded half-up; order VAT is the sum of lines. Only the server prices a cart.
- **Payments:** release dockets only on a verified payment notification (myPOS signed `IPCPurchaseNotify` checked over every field received, store ID, venue and amount; Revolut `ORDER_COMPLETED`). Store raw events; handlers are idempotent. Refund at the provider before marking an order refunded. Never store card data. Venue keys and Xero tokens are stored only encrypted (`venue_integration.secret_enc`) and never returned to the browser.
- **Ledgers:** loyalty balances (points, credit, gift cards) are sums of `loyalty_ledger`. Never store or edit a balance directly. Refunds reverse ledger lines.
- **Loyalty:** only card-paid app orders earn. Revolut POS counter sales, credit-funded amounts and gift card purchases earn nothing.
- **Alcohol and loyalty (Irish law, Public Health (Alcohol) Act 2018):** no points, double points or level spend for alcohol, no loyalty credit spent on alcohol, no till discounts or comps on alcohol (a replaced drink is logged as waste). Use `alcoholSplit` and `orders.rewardable_cents`; never award loyalty on `contains_alcohol` lines.
- **Alcohol:** guests must be 18+ by date of birth to create an account. A bar docket with alcohol for an account without a staff ID check cannot be marked collected until staff record **ID checked** or **Refused**. Never store ID images or document numbers.
- **Routing:** drinks → bar (collected); food → kitchen (run to a table). Food is never collect-at-bar.
- **Self-serve:** new venues start in test mode (`venue.status = setup`) and go live only through `goLive` once the checklist's required steps pass. Never bill test-payment orders. Only managers (`admin`) reach `/office`.
- **Inventory:** built in (decided Nov 2026, replaces MarketMan). Stock on hand is the sum of `stock_movement` (base units ml/g/each, cost in cents ex VAT); never store or edit an on-hand figure. Paid orders deplete through `recipe_line` inside `completeOrder`; refused/refunded orders put stock back; deliveries, waste, counts and till imports are movements. Till sales also deplete stock; venues on another till import its CSV instead. Auto sold-out only toggles items it marked itself (`sold_out_by_stock`).
- **Till (POS):** staff ring up `channel = counter` orders, priced on the server, paid at once by cash or card on the venue's myPOS terminal (money goes straight to the venue; Complete never holds funds). Idempotent by sale key. Drinks are handed over; food needs a table number and goes to the kitchen. Till sales earn no loyalty, aren't in the app fee, and cash isn't in the Xero card payment. Refunds: staff within 15 minutes, managers any time; stock goes back.
- **Growth modules:** guest hub `/me` reads only the signed-in guest's own memberships across venues. Bookings check seats per half-hour slot under a per-venue advisory lock. Delivery orders arrive only with a valid `X-Complete-Signature` HMAC (venue secret, encrypted) and are idempotent by platform order id. Room charges are hotel-only, kept out of the Xero card payment, and posted signed to the venue's PMS address. Brand insights are aggregated across at least 3 opted-in venues and never include guest data. Complete never lends: funding is an estimate plus a referral to a licensed partner (`FUNDING_PARTNER_URL`). The planner only suggests; prices change only when a manager taps Apply (audited).
- **Service rules:** every item declares its EU allergens (`menu_item.allergens`, shown to guests). Orders are refused when the station is outside `venue.hours` or paused by staff (`paused_until`); till food needs the kitchen open. Tips (`orders.tip_cents`) go to staff: they're in the card payment but never in VAT, loyalty points, the app fee or Xero sales. Till discounts need a reason; over 20% or a comp needs a manager; VAT is re-apportioned per line. Tab rounds are `status = open` until the tab closes; voiding an unpaid round puts stock back.
- **Rota and payroll:** planned shifts live in `rota_shift` (drafts until published; staff only see published ones), availability in `staff_unavailable`. `rotaChecks` flags Organisation of Working Time Act issues (11h rest, breaks, 48h week) and unavailable days; it warns, it doesn't block. Pay comes from clock-ins (`staff_shift`) with the rate at the time, the venue's Sunday premium, and tips shared by hours (`payrollPeriod`); exports via `payrollCsv` (generic, BrightPay, Thesaurus, Sage). Never export PPS numbers.
- **Guest data:** `/api/me/export` gives the guest everything held about them; `/api/me/delete` wipes their personal details (orders kept anonymously for VAT records). Sign-in codes go by Twilio (`lib/sms.ts`), rate-limited per phone and per IP against SMS fraud.
- **Push:** Web Push (VAPID) when a docket is marked ready; subscriptions are per guest. Never put order contents or personal data beyond the order number and venue in a notification.
- **AI assistants:** guests' assistants act only through `agent_grant` tokens (store the SHA-256 only), within their scopes and limits and the venue's redemption rules. They can never pay: `start_order` holds the order until the guest approves. Audit every call in `agent_action`. The venue assistant never receives guest personal data.
- **What's on:** events live in `venue_event` in UTC; weekly repeats keep local venue time (`occurrences` in core). Guests get the tab, per-event and full `.ics` calendars.
- **Google reviews:** the same prompt for every paid order, no rewards of any kind, no rating question first (Google bans incentives and gating).
- **Xero / Sage Accounting:** one invoice + one payment per venue per trading day, idempotency keys `complete:{venue}:{date}:…` (Sage: look up the day's reference first, pay only what's outstanding), recorded in `xero_sync` by `target`. Save rotated refresh tokens before use.
- **Payroll sync:** each closed pay period goes once to the venue's payroll (emailed import file, or signed JSON push), recorded in `xero_sync` with `target = payroll`. Never PPS numbers or emails.
- **Billing:** venues pay a monthly subscription plus `app_fee_bps` (default 100 = 1%) of completed app payments net of refunds. Compute it from Round's own order records.
- **GDPR:** EU hosting, separate marketing consent, data export and deletion.

## Stack and layout

Turborepo (pnpm) · Next.js 15 + TypeScript · Postgres 16 (EU) · Drizzle · pg-boss · Server-sent events over Postgres LISTEN/NOTIFY · GitHub Actions CI.

```
apps/web       one Next.js app: landing (/), business sign-up (/start), guest PWA (/v/...), staff screens (/staff/...), back office (/office/...)
apps/mobile    Capacitor iOS/Android shell around APP_URL (https://complete.pub)
packages/db    schema, migrations, RLS policies (sql/rls.sql), seed, services, integrations (payments setup, reviews, Xero)
packages/core  pricing, VAT, loyalty, billing, sessions, secrets, PaymentProvider (myPOS, Revolut, mock), Xero client
```

Scheduled jobs live in `apps/web/jobs.ts` (pg-boss). Shortcuts to replace before launch: guest sign-in codes are texted through Twilio (`TWILIO_*`) and also shown in dev; business sign-up codes are emailed through the Hostinger mailbox over SMTP (`SMTP_*` env, `apps/web/lib/mail.ts`) and also shown in dev; rate limits are per instance (move to Postgres when running several); the app connects as the DB owner and drops to `round_app` per request (use a dedicated login role in production). Split `apps/web` into guest/staff/office apps only if deployment needs it.

Commands: `pnpm db:reset` (wipe + migrate + seed), `pnpm dev`, `pnpm test`, `pnpm typecheck`. After changing `packages/db/src/schema.ts`, run `pnpm --filter @round/db generate`.

## Working rules

- Build in the order of `SPEC.md` §8, one step per branch or PR, with tests for `packages/core` (pricing, VAT, loyalty rules, billing, webhook idempotency).
- Use myPOS and Revolut test environments only. Send the `Revolut-Api-Version` header on every Revolut call.
- Push after every commit: cloud containers can be reset.
- Seed data comes from `SPEC.md` §5.4 (programmes and levels) and the prototype's example menus.
- Don't copy The Pass's name, branding or tier numbers.
- Record any new scope decision in `SPEC.md` §2 and remove it from §9.
