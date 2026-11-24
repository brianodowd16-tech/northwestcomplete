# CLAUDE.md — The Snug Club

The Snug Club is a white-label ordering, payments and loyalty platform for Irish bars, hotels and restaurants. Guests pay through each venue's own myPOS (or Revolut) account; sales go to the venue's Xero nightly. Counter sales stay on the venue's own till. Pilot venues: MJ O'Connor's and Drumhierny Woodland Hideaway, 20 tables each.

**`SPEC.md` is the source of truth** for scope, data model, flows and build order. Read it before starting any step. If the prototype artifact ("Round Venue Platform") disagrees with `SPEC.md`, follow `SPEC.md`.

## Non-negotiables

- **Tenancy:** every row has `tenant_id`; most have `venue_id`. Enforce with Postgres RLS plus a scoped repository. Never trust a venue ID, table ID or price from the client.
- **Money:** integer cents everywhere. Prices are VAT-inclusive. VAT is calculated per line and rounded half-up; order VAT is the sum of lines. Only the server prices a cart.
- **Payments:** release dockets only on a verified payment notification (myPOS signed `IPCPurchaseNotify` checked over every field received, store ID, venue and amount; Revolut `ORDER_COMPLETED`). Store raw events; handlers are idempotent. Refund at the provider before marking an order refunded. Never store card data. Venue keys and Xero tokens are stored only encrypted (`venue_integration.secret_enc`) and never returned to the browser.
- **Ledgers:** loyalty balances (points, credit, gift cards) are sums of `loyalty_ledger`. Never store or edit a balance directly. Refunds reverse ledger lines.
- **Loyalty:** only card-paid app orders earn. Revolut POS counter sales, credit-funded amounts and gift card purchases earn nothing.
- **Alcohol:** guests must be 18+ by date of birth to create an account. A bar docket with alcohol for an account without a staff ID check cannot be marked collected until staff record **ID checked** or **Refused**. Never store ID images or document numbers.
- **Routing:** drinks → bar (collected); food → kitchen (run to a table). Food is never collect-at-bar.
- **Inventory:** out of scope. Don't build stock, recipe, stocktake, PO, MarketMan or counter-POS features. Sold-out is a manual staff toggle.
- **AI assistants:** guests' assistants act only through `agent_grant` tokens (store the SHA-256 only), within their scopes and limits and the venue's redemption rules. They can never pay: `start_order` holds the order until the guest approves. Audit every call in `agent_action`. The venue assistant never receives guest personal data.
- **Google reviews:** the same prompt for every paid order, no rewards of any kind, no rating question first (Google bans incentives and gating).
- **Xero:** one invoice + one payment per venue per trading day, idempotency keys `snug:{venue}:{date}:…`, recorded in `xero_sync`. Save rotated refresh tokens before use.
- **Billing:** venues pay a monthly subscription plus `app_fee_bps` (default 100 = 1%) of completed app payments net of refunds. Compute it from Round's own order records.
- **GDPR:** EU hosting, separate marketing consent, data export and deletion.

## Stack and layout

Turborepo (pnpm) · Next.js 15 + TypeScript · Postgres 16 (EU) · Drizzle · pg-boss · Server-sent events over Postgres LISTEN/NOTIFY · GitHub Actions CI.

```
apps/web       one Next.js app: guest PWA (/v/...), staff screens (/staff/...), back office (/office/...)
packages/db    schema, migrations, RLS policies (sql/rls.sql), seed, services, integrations (payments setup, reviews, Xero)
packages/core  pricing, VAT, loyalty, billing, sessions, secrets, PaymentProvider (myPOS, Revolut, mock), Xero client
```

Scheduled jobs live in `apps/web/jobs.ts` (pg-boss). Shortcuts to replace before launch: OTP codes are shown on screen in dev (wire an SMS provider); the app connects as the DB owner and drops to `round_app` per request (use a dedicated login role in production). Split `apps/web` into guest/staff/office apps only if deployment needs it.

Commands: `pnpm db:reset` (wipe + migrate + seed), `pnpm dev`, `pnpm test`, `pnpm typecheck`. After changing `packages/db/src/schema.ts`, run `pnpm --filter @round/db generate`.

## Working rules

- Build in the order of `SPEC.md` §8, one step per branch or PR, with tests for `packages/core` (pricing, VAT, loyalty rules, billing, webhook idempotency).
- Use myPOS and Revolut test environments only. Send the `Revolut-Api-Version` header on every Revolut call.
- Push after every commit: cloud containers can be reset.
- Seed data comes from `SPEC.md` §5.4 (programmes and levels) and the prototype's example menus.
- Don't copy The Pass's name, branding or tier numbers.
- Record any new scope decision in `SPEC.md` §2 and remove it from §9.
