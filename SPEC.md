# Round — Phase 1 build spec

> "Round" is a placeholder name (check trademark and domain before committing). This is the Phase 1 spec; `CLAUDE.md` holds the working rules for building it. The clickable prototype ("Round Venue Platform" artifact) shows the intended look of most screens. Where it differs from this file (native inventory, stocktakes, POs, walk-up POS grid, the 18+ checkbox), this file wins.

## 1. Product in one paragraph

Round is a white-label version of Revolut's **Order & Pay**, built on the Revolut Merchant API, with a full loyalty programme and venue extras on top. Guests with an account scan a QR at their table, or choose **Collect at bar**, order and pay in a web app, and earn points in the venue's own programme. Drinks show on the bar screen and print at the bar for collection. Food shows on the kitchen screen, prints in the kitchen and is run to the table. Everything at the counter (card reader, cash, end of shift) stays on the **Revolut POS** app in Phase 1. MarketMan keeps getting its sales from Revolut POS as it does today. Managers run menus, loyalty, events, tickets and bookings from a back office. Venues pay Round a monthly subscription plus 1% of app payments.

## 2. Decisions

| Area | Decision |
|---|---|
| Model | SaaS. Each venue gets its own bespoke loyalty programme; chains can share one programme across venues. |
| Market | Ireland first (EUR, Irish VAT), then EU. |
| Pilot | **MJ O'Connor's** and **Drumhierny Woodland Hideaway** (confirm spelling), 20 tables each. Drumhierny is tables only; lodge ordering is a later phase. O'Dowd's / odowdscarrick.com is not part of this project. |
| What Round is in Phase 1 | A white-label Order & Pay: guest app, bar and kitchen screens, printing, loyalty, events, bookings, back office. Revolut's own Order & Pay has no public API, so Round builds its own on the Merchant API. |
| Counter sales | **Revolut POS app**, unchanged: Revolut card reader, cash, end of shift and cash reconciliation. A white-label counter POS is a later phase. Counter sales earn no loyalty. |
| App payments | Account required. Pay in-app, upfront, per order. No split bills. Revolut checkout widget: saved card, Apple Pay, Google Pay, Revolut Pay, card. |
| Routing | Drinks → bar screen + bar printer, collected at the bar. Food → kitchen screen + kitchen printer, run to a table. Food is never "collect at bar". |
| Loyalty | Spend-based levels, points per €, birthday credit, level-up bonus points, bonus credits, double points, referral points, sign-up credit, gift cards, points-to-credit conversion. Only app orders earn. |
| Inventory | Out of scope. MarketMan gets counter sales (card and cash) from Revolut POS through its existing end-of-day sync. Bars manage their own stock. Staff get a manual sold-out toggle; automatic sell-out from stock levels comes in a later phase for restaurants and cafés. |
| Age verification | In scope. Proposed approach in section 6, details still to agree. |
| Hardware | Only Revolut-supplied hardware: Revolut Terminal for counter cards, and the Star TSP143IV / Epson TM-m30III printers Revolut supports. Round's bar and kitchen screens run in a browser on a tablet. |
| Billing (venues → you) | Monthly subscription per venue **plus 1% of completed app payments** (net of refunds). Revolut has no platform fee split, so Round calculates it and invoices monthly. |
| Bookings | Each venue sets how far ahead guests can book; default **1 month**. |
| Guest app | QR web app (PWA) first; native iOS/Android later from the same backend. |
| V1 extras | Events + ticketing, gig guide, live sport listings, table bookings, venue finder. |
| Connectivity | Assume online, with backup 4G/eSIM at the venue. No offline mode. If Round is down, the venue keeps trading on Revolut POS. |

## 3. Architecture

```
Guest PWA (Next.js)        Bar + kitchen screens (Next.js, tablet)        Back office (Next.js)
        \                                |                                   /
         \------------------ API (TypeScript, REST + WebSocket) ------------/
                          |               |                |
                     Postgres         Job queue         Realtime
                   (multi-tenant)   (webhooks, print,   (dockets, order
                                     reconciliation,     status, sold-out)
                                     loyalty, billing)
                          |               |
            Revolut Merchant API      Cloud print → Revolut-supplied printers
            (orders, widget,          (Star CloudPRNT on TSP143IV,
             customers, webhooks)      Epson Server Direct Print on TM-m30III)

Separate, unchanged: Revolut POS app + Revolut Terminal (counter, cash, end of shift) → MarketMan
```

Stack: Turborepo monorepo, Next.js + TypeScript, Postgres (Neon or Supabase, EU region), Drizzle, pg-boss for jobs, WebSockets (or Supabase Realtime). Host in the EU.

Layout: `apps/guest`, `apps/staff` (bar + kitchen screens, ID check, sold-out), `apps/office` (venue back office + platform admin), `packages/db`, `packages/core` (pricing, VAT, loyalty, payments, billing), `packages/ui`.

Tenancy: every row carries `tenant_id`; most carry `venue_id`. Enforce with Postgres row-level security and a scoped repository layer. Never trust a venue, table or price from the client.

## 4. Data model

**Tenancy and venue**
- `tenant` (operator / group)
- `venue` (name, slug, branding, timezone, VAT number, opening hours, late thresholds, `booking_max_advance` default 1 month, `booking_min_notice`, `booking_max_party`)
- `table` (venue, number, qr_token, active)
- `staff_user` (venue access, role: admin | staff); `platform_admin` (you)

**Menu**
- `menu_category`
- `menu_item` (price incl. VAT in cents, vat_rate 9 | 23, station bar | kitchen, contains_alcohol, available_for_collect, active, sold_out)
- `modifier_group`, `modifier` (basic: e.g. "no ice", steak cooking)
- `printer` (venue, station, protocol: star_cloudprnt | epson_sdp, device id/MAC, last_seen_at)

**Guests and loyalty**
- `customer` (global identity: phone, email, name, date_of_birth, marketing_consent, `age_verified_at`, `age_verified_by_staff_id`, `age_verification_method`: staff_id_check | digital_id, `age_document_type`: age_card | passport | driving_licence; never an image or document number)
- `payment_method_ref` (customer × venue → Revolut customer ID; card details stay at Revolut)
- `programme` (venue or group: name, points_per_euro, points_per_credit_euro, signup_credit, referral_points, shared)
- `programme_level` (name, min_spend_12m, birthday_credit, levelup_points, bonus_credits schedule, double_points_count)
- `membership` (customer × programme: referral_code, referred_by). Points, credit, spend and level are derived.
- `loyalty_ledger` (membership, kind: points | credit, delta, reason, order_id, expires_at). All balances are sums of this ledger.
- `gift_card` (code, initial value, purchaser); balance from ledger.

**Orders and payments**
- `order` (venue, channel: table | collect, table_id nullable, customer_id, status: draft | pending_payment | paid | cancelled | refunded, gross, vat_9, vat_23, credit_used, amount_paid, revolut_order_id, idempotency_key)
- `order_line` (menu_item, qty, unit_price, vat_rate, line_vat, modifiers snapshot)
- `docket` (order, station, status: new | in_progress | ready | done, id_check_required, timestamps per step)
- `print_job` (docket, printer, status, attempts)
- `webhook_event` (provider, raw payload, signature_valid, processed_at)
- `integration_credential` (venue, provider, encrypted secret key, public key, webhook signing secret)

**Events and bookings**
- `event` (type: ticketed | gig | sport, starts_at, capacity, price)
- `ticket` (event, customer, order, code, status: valid | scanned | refunded)
- `booking` (venue, customer, party size, requested time, notes, status: requested | confirmed | declined | cancelled)

**Billing**
- `subscription` (venue, monthly_fee_cents, app_fee_bps default 100 = 1%, starts_on, active)
- `billing_statement` (venue, month, app_gross, app_refunds, app_fee, subscription_fee, VAT on fees at 23%, total, status: draft | issued | paid, external_invoice_id)

**Platform**
- `audit_log` (actor, action, entity, before/after)

## 5. Key flows

### 5.1 Guest account and sign-in
1. Sign-in by phone number with a one-time SMS code (email magic link as a fallback). On first sign-in the guest gives a name, date of birth (must be 18+) and email for receipts. Marketing consent is a separate, unticked opt-in.
2. Joining a venue's programme creates a `membership` and grants the sign-up credit. A referral code entered here is stored for the referral bonus.
3. The account shows its ID status: **ID not yet checked** or **ID checked** (section 6).

### 5.2 App order (table or collect at bar)
1. Guest scans the table QR → `/v/{venueSlug}/t/{qrToken}`; the server resolves venue + table. Or the guest opens `/v/{venueSlug}` and chooses **Collect at bar**, which shows drinks only.
2. The server prices the cart. Client prices are for display only. Sold-out items can't be added.
3. The guest can apply credit and a double-points token.
4. The server creates a Revolut order: amount in minor units, EUR, `merchant_order_data.reference` = our order ID, `line_items`, the venue's Revolut customer ID so a card can be saved, and the `Revolut-Api-Version` header. If credit covers the whole order, skip Revolut and mark it paid.
5. The client mounts the Revolut checkout widget (saved card, Apple Pay, Google Pay, Revolut Pay, card). Each guest domain is registered with Revolut for Apple Pay.
6. **Webhooks:** only release dockets on `ORDER_COMPLETED`. Verify the signature and timestamp, store every event raw, and make handlers idempotent on the Revolut order ID (events can arrive out of order).
7. **On completion, in one transaction:** mark the order paid, create bar and kitchen dockets (with the ID-check flag if needed), and write loyalty ledger entries. Then enqueue printing and push status to the guest.
8. **Reconciliation:** a job polls Revolut for any order still `pending_payment` after 3 minutes and settles it. A daily report lists app payments for the venue to match against Revolut settlements.

### 5.3 Bar and kitchen screens, printing
- Order lines are split by `menu_item.station`. Coffee goes to the bar.
- Dockets are pushed to the station screens over WebSocket and printed by cloud print on the Revolut-supplied printers: Star CloudPRNT (TSP143IV) or Epson Server Direct Print (TM-m30III). The printer polls Round's server, so no local bridge is needed. The same printers keep serving Revolut POS over the local network.
- **Bar:** new → pouring → ready → collected. **Kitchen:** new → cooking → ready → served (run to table). The guest app shows each docket live; "Ready at the bar" updates the open web app (push/SMS later).
- Late thresholds: bar 5 min, kitchen 15 min (venue setting).
- Every docket shows the table (or "COLLECT") and the guest's first name.
- **CHECK ID:** a bar docket with alcohol for a guest whose ID hasn't been checked shows a red **CHECK ID** banner with the guest's name and age. It can't be marked collected until staff tap **ID checked** (recording the document type) or **Refused** (the order is refunded through Revolut).
- **Sold out:** staff toggle any item sold out or back in from the bar or kitchen screen. It updates open guest apps immediately.

### 5.4 Loyalty engine (`packages/core/loyalty`)
- Points = floor(amount paid by card × points_per_euro). Parts paid with credit or a gift card earn nothing. Buying a gift card earns nothing. Revolut POS counter sales earn nothing.
- Double points: if the guest chooses to use one and has one, that order's points ×2 and one token is used.
- Level = highest level whose `min_spend_12m` ≤ rolling 12-month app spend. On level-up: award level-up points, grant that level's double-points tokens, and schedule its bonus credits (e.g. 4 × €20, one per quarter).
- Birthday credit: a daily job credits members on their birthday at their level's amount, expiring after 30 days.
- Referral: both members get the referral points when the referred member's first paid order completes.
- Points → credit at the programme's rate, on request.
- Refunds reverse that order's ledger lines.
- Shared programmes: membership belongs to the group programme, so points count at every venue in the group.
- Pilot programmes: MJ O'Connor's "The Snug Club" (Regular €0, Local €400, Stalwart €1,500, Legend €4,000); Drumhierny "Woodland Club" (Sapling €0, Birch €300, Oak €1,200, Yew €3,500). Both: 10 points per €1, 100 points = €1 credit, €10 sign-up credit, 500 referral points. Don't copy The Pass's name, branding or tier numbers.

### 5.5 Events, tickets, bookings
- Ticketed events sell through the app payment flow (these count toward the 1% fee). Each ticket gets a unique code and QR; door staff scan from the office app on a phone (valid → scanned; repeats are rejected).
- Gig guide and live sport are free listings.
- Bookings are requests that staff confirm or decline in the back office. Guests can only pick times within the venue's window: default up to 1 month ahead, plus minimum notice and maximum party size set by the venue. No table-management engine.
- Venue finder lists the tenant's venues with opening hours and a link to each menu.

### 5.6 Billing (`packages/core/billing`)
- On the 1st of each month, a job builds a `billing_statement` per venue for the previous month: completed app payments (orders, tickets, gift cards) minus refunds, × `app_fee_bps`, plus the monthly subscription, plus 23% VAT on your fees.
- Platform admin reviews and issues the statement. Collect it by Stripe Billing or SEPA direct debit from your own business account (to settle before launch); Round stores the external invoice ID and paid status.
- Venues see their statements and the underlying app sales in their back office.

### 5.7 Back office
Venue: menu, prices, VAT rates, stations, sold-out; tables and printable QR codes; loyalty programme and levels; events, tickets and bookings (including the booking window); printers; Revolut keys; staff users; sales overview (by hour, by channel, VAT 9%/23% totals, daily payment report); customer lookup with ledger history; billing statements; audit log.
Platform admin: tenants and venues, subscriptions and fee rates, billing statements.

## 6. Tax and compliance (Ireland)

- **VAT:** since 1 July 2026, food and catering (including hot drinks served with it) is 9%; alcohol, soft drinks and bottled water are 23%. Store the rate on each menu item. Prices are VAT-inclusive; calculate VAT per line (`gross × rate / (100 + rate)`, rounded half-up to the cent) and sum the lines. An accountant confirms each venue's mapping before launch.
- **Receipts:** an email receipt for every app order, with the VAT breakdown and the venue's VAT number.
- **Alcohol, minimum age 18 (to agree in detail):** under s.31 of the Intoxicating Liquor Act 1988 (as amended in 2000), the licensee's defence appears to rest on an age card or ID being produced, so a typed-in date of birth isn't enough on its own. Proposed: date of birth at sign-up, plus a staff check of a Garda age card, passport or driving licence on the first alcohol collection (5.3). Staff still challenge anyone who looks under 25. A solicitor signs it off before launch. Long term: digital ID (Yoti, Veriff or similar).
- **GDPR:** marketing consent separate from account creation; data export and deletion; EU hosting; data processing agreements with venues; no ID images or document numbers stored.
- **Cards:** never store card data. Payment details stay inside Revolut's widget.

## 7. Phase 1 scope and acceptance

Must have:
1. Venue onboarding (manual by you): menu with VAT rates, tables + QR codes, Revolut keys, printers, programme rules, booking window, subscription.
2. Guest PWA: account + sign-in, menu with sold-out, cart, table and collect-at-bar ordering, Revolut checkout with saved cards, live order status, points/credit/level, rewards page, events, tickets, bookings, venue finder.
3. Staff app: bar and kitchen screens with CHECK ID flow and sold-out toggles; cloud printing to one bar and one kitchen printer.
4. Back office and platform admin as in 5.7.
5. Revolut: orders, widget, saved cards, webhooks, reconciliation, refunds on ID refusal.
6. Loyalty engine with everything in 5.4.
7. Monthly billing statements (subscription + 1%).

Later phases: white-label counter POS (Revolut Terminal push + cash), lodge ordering at Drumhierny, automatic sell-out from MarketMan for restaurants and cafés, digital ID verification, Stripe as a second payment provider, native apps, push/SMS notifications, multi-venue reporting, deeper modifiers, staff roles beyond admin/staff.

**Done when**, at either pilot venue:
- a guest can sign up, order from a table or for collection, and pay;
- the docket prints and shows at the right station within 3 seconds of payment;
- a first-time guest's alcohol docket can't be collected without an ID check;
- an item staff mark sold out disappears from open guest apps;
- points and level update correctly;
- a guest can book within the venue's window and staff can confirm it;
- the month's billing statement shows the subscription plus 1% of app payments.

## 8. Build order

1. Monorepo, Postgres with row-level tenancy, staff email login, guest phone sign-in with date of birth, seed both pilot venues with the prototype data.
2. Menu, tables, QR codes; guest menu and cart (server-priced, VAT per line); collect-at-bar mode.
3. `PaymentProvider` (`createOrder`, `getOrder`, `refund`, `verifyWebhook`, `parseWebhook`) with `RevolutProvider` on the sandbox: widget, saved cards, webhooks, reconciliation.
4. Dockets + realtime bar/kitchen screens, CHECK ID flow, sold-out toggles; then cloud printing.
5. Loyalty ledger, rules engine, rewards UI; birthday and bonus-credit jobs; gift cards; referrals.
6. Events, tickets with QR scan, bookings with the venue window, venue finder.
7. Back office reporting and billing statements.
8. Hardening: rate limits, audit log, error tracking, backups, load test at 40 tables ordering at once.

## 9. Open items (none block steps 1–4)

- Age verification details and a solicitor's sign-off (section 6).
- Confirm the pilot's Revolut-supplied printers are the TSP143IV / TM-m30III and can run cloud print alongside Revolut POS; older TSP100III models don't support CloudPRNT and would need a local print bridge.
- How you collect billing statements (Stripe Billing, SEPA direct debit or Revolut Business invoices) and the subscription price.
- Service charge or tipping for guests in the app.
- Brand name and domain.
