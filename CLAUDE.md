# CLAUDE.md — Round

Round is a white-label ordering, POS and loyalty platform for Irish pubs, built on the Revolut Merchant API. Pilot venues: MJ O'Connor's and Drumhierny Woodland Hideaway, 20 tables each.

**`SPEC.md` is the source of truth** for scope, data model, flows and build order. Read it before starting any step. If the prototype artifact ("Round Venue Platform") disagrees with `SPEC.md`, follow `SPEC.md`.

## Non-negotiables

- **Tenancy:** every row has `tenant_id`; most have `venue_id`. Enforce with Postgres RLS plus a scoped repository. Never trust a venue ID, table ID or price from the client.
- **Money:** integer cents everywhere. Prices are VAT-inclusive. VAT is calculated per line and rounded half-up; order VAT is the sum of lines. Only the server prices a cart.
- **Payments:** release dockets only on Revolut `ORDER_COMPLETED`. Verify webhook signatures and timestamps, store raw events, and make handlers idempotent on the Revolut order ID. Never store card data. Secret keys are server-side only, encrypted at rest.
- **Ledgers:** loyalty balances (points, credit, gift cards) are sums of `loyalty_ledger`. Never store or edit a balance directly. Refunds reverse ledger lines.
- **Loyalty:** only card-paid app orders earn. Counter sales (Revolut Terminal or cash), credit-funded amounts and gift card purchases earn nothing.
- **Alcohol:** guests must be 18+ by date of birth to create an account. A bar docket with alcohol for an account without a staff ID check cannot be marked collected until staff record **ID checked** or **Refused**. Never store ID images or document numbers.
- **Routing:** drinks → bar (collected); food → kitchen (run to a table). Food is never collect-at-bar.
- **Inventory:** MarketMan owns it, connected via Revolut. Don't build stock, recipe, stocktake or PO features in the pilot. Keep `menu_item.external_item_id` aligned and send `line_items` on every Revolut order.
- **GDPR:** EU hosting, separate marketing consent, data export and deletion.

## Stack and layout

Turborepo · Next.js + TypeScript · Postgres (EU) · Drizzle · pg-boss · WebSockets.

```
apps/guest    guest PWA
apps/staff    bar POS + kitchen screen (tablet)
apps/office   back office
packages/db   schema, migrations, RLS policies, seed
packages/core pricing, VAT, loyalty engine, PaymentProvider (Revolut first)
packages/ui   shared components
```

## Working rules

- Build in the order of `SPEC.md` §8, one step per branch or PR, with tests for `packages/core` (pricing, VAT, loyalty rules, webhook idempotency).
- Use the Revolut sandbox only. Send the `Revolut-Api-Version` header on every call.
- Seed data comes from `SPEC.md` §5.6 (programmes and levels) and the prototype's example menus.
- Don't copy The Pass's name, branding or tier numbers.
- Record any new scope decision in `SPEC.md` §2 and remove it from §9.
