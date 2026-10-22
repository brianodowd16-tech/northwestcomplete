# Round — MVP build spec

> "Round" is a placeholder name (check trademark and domain before committing). This is the finished pilot spec; `CLAUDE.md` holds the working rules for building it. The clickable prototype ("Round Venue Platform" artifact) shows the intended behaviour of most screens. Where it differs from this file (native inventory, stocktakes, POs, the 18+ checkbox), this file wins.

## 1. Product in one paragraph

A white-label ordering, POS and loyalty platform for Irish (then EU) pubs and venues, built on the Revolut Merchant API. Guests with an account scan a QR at their table, or tap **Collect at bar**, order and pay in a web app, and earn points in the venue's own loyalty programme. Drinks print at the bar for collection. Food goes to the kitchen screen and printer and is always run to a table. Round's bar POS is the venue's only POS. It shows app dockets and also takes counter sales from guests without the app, paid by Revolut card reader or cash. Every card payment goes through Revolut, and MarketMan, already connected to the venues' Revolut accounts, handles inventory. Managers run menus, loyalty, events, ticketing, bookings and sales reporting from a back office.

## 2. Decisions

| Area | Decision |
|---|---|
| Model | SaaS. Each venue gets its own bespoke loyalty programme; chains can share one programme across venues. |
| Market | Ireland first (EUR, Irish VAT), then EU. |
| Pilot | **MJ O'Connor's** and **Drumhierny Woodland Hideaway** (confirm spelling), 20 tables each. Drumhierny is tables only; lodge ordering is phase 2. O'Dowd's / odowdscarrick.com is not part of this project. |
| POS | Round's bar POS is the **only** POS: a white-label POS on the Revolut Merchant API. |
| App payments | Account required. Pay in-app, upfront, per order. No split bills. Revolut checkout widget: saved card, Apple Pay, Google Pay, Revolut Pay, card. Stripe later. |
| Counter payments (no app) | Rung up on Round's bar POS. Card: pushed to a **Revolut Terminal** (card reader) through the Merchant API. Cash: recorded on the POS with a cash drawer and end-of-shift cash-up. No loyalty. |
| Routing | Drinks → bar screen + bar printer, collected at the bar. Food → kitchen screen + kitchen printer, run to a table. Food is never "collect at bar". |
| Loyalty | Spend-based levels, points per €, birthday credit, level-up bonus points, bonus credits, double points, referral points, sign-up credit, gift cards, points-to-credit conversion. Only app orders earn. Counter sales (card reader or cash) earn nothing. |
| Inventory | **MarketMan is the system of record** and is connected to the venues' Revolut accounts. Recipes, counts, stocktakes, POs and suppliers stay in MarketMan, and it knows when items run out. Round sends no data to MarketMan directly; it keeps item IDs aligned and shows stock-outs. Native inventory is deferred. |
| Age verification | Date of birth at sign-up; staff check physical ID on the first alcohol collection (section 6). Digital ID (Yoti/Veriff) long term. |
| Guest app | QR web app (PWA) first; native iOS/Android later from the same backend. |
| V1 extras | Events + ticketing, gig guide, live sport listings, table bookings, venue finder. |
| Connectivity | Assume online, with backup 4G/eSIM at the venue. No offline mode in v1. If Round is down, the Revolut POS app is the emergency till. |

## 3. Architecture

```
Guest PWA (Next.js)       Bar POS / Kitchen screen (Next.js, tablet)      Back office (Next.js)
        \                              |                                     /
         \---------------- API (TypeScript, REST + WebSocket) -------------/
                          |              |               |
                     Postgres        Job queue        Realtime
                   (multi-tenant)   (webhooks, print,  (dockets, order
                                     reconciliation,    status, sold-out)
                                     loyalty jobs)
                          |              |
     Revolut Merchant API ──────────────────────  Cloud printers (Epson Server Direct Print / Star CloudPRNT)
       ├─ Orders + checkout widget (app)
       ├─ Terminals: push payments to Revolut Terminal (counter card)
       └─ Webhooks
              │
           MarketMan (via its Revolut integration: sales in, stock-outs out)
```

Stack: Turborepo monorepo, Next.js + TypeScript, Postgres (Neon or Supabase, EU region), Drizzle, pg-boss for jobs, WebSockets (or Supabase Realtime) for live screens. Host in the EU.

Layout: `apps/guest`, `apps/staff` (bar POS + kitchen screen), `apps/office`, `apps/api` (or Next route handlers), `packages/db`, `packages/core` (pricing, VAT, loyalty, payments), `packages/ui`.

Tenancy: every row carries `tenant_id`; most carry `venue_id`. Enforce with Postgres row-level security and a scoped repository layer. Never trust a venue or price from the client.

## 4. Data model

**Tenancy and venue**
- `tenant` (operator / group)
- `venue` (name, slug, branding, timezone, VAT number, payment provider, late thresholds)
- `table` (venue, number, qr_token, active)
- `staff_user` (venue access, role: admin | staff, PIN for POS switching)

**Menu**
- `menu_category`
- `menu_item` (price incl. VAT in cents, vat_rate 9 | 23, station bar | kitchen, contains_alcohol, available_for_collect, active, `sold_out` + `sold_out_source`: marketman | manual, `external_item_id` = Revolut/MarketMan item ID)
- `modifier_group`, `modifier` (basic in v1: e.g. "no ice", steak cooking)

**Guests and loyalty**
- `customer` (global identity: phone, email, name, date_of_birth, marketing_consent, `age_verified_at`, `age_verified_by_staff_id`, `age_verification_method`: staff_id_check | digital_id, `age_document_type`: age_card | passport | driving_licence; never store an image or document number)
- `payment_method_ref` (customer × venue's Revolut customer ID; card details stay at Revolut)
- `programme` (venue or group: name, points_per_euro, points_per_credit_euro, signup_credit, referral_points, shared)
- `programme_level` (name, min_spend_12m, birthday_credit, levelup_points, bonus_credits schedule, double_points_count)
- `membership` (customer × programme: referral_code, referred_by). Points, credit, spend and level are derived.
- `loyalty_ledger` (membership, kind: points | credit, delta, reason, order_id, expires_at). All balances are sums of this ledger.
- `gift_card` (code, initial value, balance via ledger, purchaser)

**Orders and payments**
- `order` (venue, channel: table | collect | counter, table_id nullable, customer_id nullable for counter, status: draft | pending_payment | paid | cancelled | refunded, gross, vat_9, vat_23, credit_used, amount_paid, idempotency_key)
- `order_line` (menu_item, qty, unit_price, vat_rate, line_vat, modifiers snapshot)
- `payment` (order, method: app | terminal | cash, provider, provider_order_id, provider_payment_intent_id, terminal_id, amount, status)
- `docket` (order, station, status: new | in_progress | ready | done, id_check_required, timestamps for each step)
- `terminal` (venue, Revolut terminal ID, label)
- `cash_session` (venue, staff opened/closed, opening float, expected, counted, variance)
- `webhook_event` (provider, raw payload, signature_valid, processed_at)
- `integration_credential` (venue, provider, encrypted secret key, public key, webhook signing secret)

**Events and bookings**
- `event` (type: ticketed | gig | sport, starts_at, capacity, price)
- `ticket` (event, customer, code, status: valid | scanned | refunded)
- `booking` (venue, customer, party size, requested time, status: requested | confirmed | declined)

**Platform**
- `audit_log` (actor, action, entity, before/after)

## 5. Key flows

### 5.1 Guest account and sign-in
1. Sign-in is by phone number with a one-time SMS code (email magic link as a fallback). On first sign-in the guest gives a name, date of birth (must be 18+ to create an account) and email for receipts. Marketing consent is a separate, unticked opt-in.
2. Joining a venue's programme creates a `membership` and grants the sign-up credit. A referral code entered here is stored for the referral bonus.
3. The account shows its ID status: **ID not yet checked** or **ID checked** (section 6).

### 5.2 App order (table or collect at bar)
1. Guest scans the table QR → `/v/{venueSlug}/t/{qrToken}`; the server resolves venue + table. Or the guest opens `/v/{venueSlug}` and chooses **Collect at bar**, which shows drinks only (`available_for_collect`).
2. The server prices the cart. Client prices are for display only.
3. The guest can apply credit and a double-points token.
4. The server creates a Revolut order: amount in minor units, EUR, `merchant_order_data.reference` = our order ID, `line_items` using `external_item_id`, the venue's Revolut customer ID so a card can be saved, and the `Revolut-Api-Version` header. If credit covers the whole order, skip Revolut and mark it paid.
5. The client mounts the Revolut checkout widget (saved card, Apple Pay, Google Pay, Revolut Pay, card). Each guest domain is registered with Revolut for Apple Pay.
6. **Webhooks:** only release dockets on `ORDER_COMPLETED`. Verify the signature and timestamp. Store every event raw. Handlers are idempotent and keyed on the Revolut order ID, because events can arrive out of order.
7. **On completion, in one transaction:** mark the order paid, create bar and kitchen dockets (with the ID-check flag if needed), and write loyalty ledger entries. Then enqueue printing and push status to the guest.
8. **Reconciliation:** a job polls Revolut for any order still `pending_payment` after 3 minutes and settles it.

### 5.3 Counter sale (no app)
1. Staff tap items on the bar POS. The order has channel `counter` and no customer.
2. **Card:** the POS asks the server to create a Revolut order with line items, then a payment intent targeting the chosen Revolut Terminal (Pay at Counter mode). The terminal and the POS must be logged in to the same Revolut location. The POS shows "Waiting for card…" and listens for the result (webhook first, polling as a backup), with a Cancel button that cancels the pending intent.
3. **Cash:** staff enter the amount tendered and the POS shows change. A payment row is recorded against the open `cash_session`.
4. On payment, a bar docket is created (or marked collected straight away if served on the spot). No loyalty is written.
5. **Cash-up:** at the end of a shift, staff count the drawer; the system stores expected vs counted cash and the variance.

### 5.4 Dockets, screens and printing
- Order lines are split by `menu_item.station`. Coffee goes to the bar.
- Dockets are pushed to the station screens over WebSocket and printed by cloud print (Epson Server Direct Print or Star CloudPRNT: the printer polls our server, so no local bridge is needed).
- **Bar:** new → pouring → ready → collected. **Kitchen:** new → cooking → ready → served (run to table). The guest app shows each docket live; "Ready at the bar" updates the open web app in v1 (push/SMS later).
- Late thresholds: bar 5 min, kitchen 15 min (per venue setting).
- **CHECK ID flag:** a bar docket with alcohol for a guest whose ID hasn't been checked shows a red **CHECK ID** banner and the guest's name and age. It can't be marked collected until staff tap **ID checked** (recording document type) or **Refused** (the order is refunded through Revolut).
- Every docket shows the guest's first name so staff can match the person to the account.

### 5.5 Sold-out and MarketMan
- MarketMan is connected to Revolut and owns stock. Round's job is to keep `external_item_id` aligned with the Revolut/MarketMan item catalogue and to send line items on every Revolut order.
- When MarketMan reports an item out of stock, Round marks it `sold_out` (source `marketman`), and it disappears from open guest apps and greys out on the POS in real time. Staff can also toggle sold-out by hand.
- Cash sales never touch Revolut, so they must also reach MarketMan's stock count. Record them in Revolut as cash sales if its integration allows, otherwise send them through MarketMan's API (see the risk in 9).

### 5.6 Loyalty engine (`packages/core/loyalty`)
- Points = floor(amount paid by card × points_per_euro). Parts paid with credit or a gift card earn nothing. Buying a gift card earns nothing. Counter sales earn nothing.
- Double points: if the guest chooses to use one and has one, that order's points ×2 and one token is used.
- Level = highest level whose `min_spend_12m` ≤ rolling 12-month paid spend. On level-up: award level-up points, grant that level's double-points tokens, and schedule its bonus credits (e.g. 4 × €20, one per quarter).
- Birthday credit: a daily job credits members on their birthday at their level's amount, expiring after 30 days.
- Referral: both members get the referral points when the referred member's first paid order completes.
- Points → credit at the programme's rate, on request.
- Refunds reverse that order's ledger lines.
- Shared programmes: membership belongs to the group programme, so points count at every venue in the group.
- Pilot programmes: MJ O'Connor's "The Snug Club" (Regular €0, Local €400, Stalwart €1,500, Legend €4,000); Drumhierny "Woodland Club" (Sapling €0, Birch €300, Oak €1,200, Yew €3,500). Both: 10 points per €1, 100 points = €1 credit, €10 sign-up credit, 500 referral points. Don't copy The Pass's name, branding or tier numbers.

### 5.7 Events, tickets, bookings
- Ticketed events sell through the app payment flow; each ticket gets a unique code and QR. Door staff scan from the office app on a phone (valid → scanned; repeats are rejected).
- Gig guide and live sport are free listings.
- Bookings are requests that staff confirm or decline in the back office. No table-management engine in v1.
- Venue finder lists the tenant's venues with opening hours and a link to each menu.

### 5.8 Back office
Menu, prices, VAT rates, stations, sold-out and item ID mapping; tables and printable QR codes; loyalty programme and levels; events, tickets and bookings; terminals and printers; Revolut keys; staff users; sales overview (by hour, by channel, by payment method, VAT 9%/23% totals, cash-up history); customer lookup with ledger history; audit log.

## 6. Tax and compliance (Ireland)

- **VAT:** since 1 July 2026, food and catering (including hot drinks served with it) is 9%; alcohol, soft drinks and bottled water are 23%. Store the rate on each menu item. Prices are VAT-inclusive; calculate VAT per line (`gross × rate / (100 + rate)`, rounded half-up to the cent) and sum the lines. An accountant confirms each venue's mapping before launch.
- **Receipts:** an email receipt for every app order, with the VAT breakdown and the venue's VAT number. Counter sales can print a receipt.
- **Alcohol, minimum age 18:** under s.31 of the Intoxicating Liquor Act 1988 (as amended in 2000), the licensee's defence appears to rest on an age card or ID being produced, so a typed-in date of birth is not enough on its own. Pilot approach: date of birth at sign-up, plus a staff check of a Garda age card, passport or driving licence on the first alcohol collection (5.4). Staff still challenge anyone who looks under 25. **A solicitor signs this off before launch.** Long term: digital ID (Yoti, Veriff or similar) at sign-up.
- **GDPR:** marketing consent separate from account creation; data export and deletion; EU hosting; data processing agreements with venues; no ID images or document numbers stored.
- **Cards:** never store card data. Payment details stay inside Revolut's widget and terminal.

## 7. MVP scope and acceptance

Must have:
1. Venue onboarding (manual by you): menu with VAT rates and item ID mapping, tables + QR codes, Revolut keys, terminals, printers, programme rules.
2. Guest PWA: account + sign-in, menu with live sold-out, cart, table and collect-at-bar ordering, Revolut checkout with saved cards, live order status, points/credit/level, rewards page, events, tickets, bookings, venue finder.
3. Staff app: bar screen with CHECK ID flow, counter POS (Revolut Terminal + cash, cash-up), kitchen screen, cloud printing to one bar and one kitchen printer.
4. Back office as in 5.8.
5. Revolut: orders, widget, terminal push payments, webhooks, reconciliation.
6. Sold-out from MarketMan plus manual toggles.
7. Loyalty engine with all features in 5.6.

Later: lodge ordering at Drumhierny, Stripe provider, digital ID verification, native apps, push/SMS notifications, native inventory for venues without MarketMan, multi-venue reporting, deeper modifiers, refunds UI beyond ID refusals, staff roles beyond admin/staff.

**Done when**, at either pilot venue:
- a guest can sign up, order from a table or for collection, and pay;
- the docket prints and shows at the right station within 3 seconds of payment;
- a first-time guest's alcohol docket can't be collected without an ID check;
- staff can take a counter sale by card reader and by cash, and cash up;
- points and level update correctly;
- the sale appears in MarketMan, and an item MarketMan marks out of stock disappears from the menu.

## 8. Build order

1. Monorepo, Postgres with row-level tenancy, staff email login, guest phone sign-in with date of birth, seed both pilot venues with the prototype data.
2. Menu, tables, QR codes; guest menu and cart (server-priced, VAT per line); collect-at-bar mode.
3. `PaymentProvider` (`createOrder`, `getOrder`, `refund`, `verifyWebhook`, `parseWebhook`, `pushToTerminal`, `cancelTerminalPayment`) with `RevolutProvider` on the sandbox: widget, saved cards, webhooks, reconciliation.
4. Dockets + realtime bar/kitchen screens, CHECK ID flow; then cloud printing.
5. Counter POS: Revolut Terminal push, cash, cash sessions.
6. Item ID mapping, sold-out from MarketMan, manual toggles.
7. Loyalty ledger, rules engine, rewards UI; birthday and bonus-credit jobs; gift cards; referrals.
8. Events, tickets with QR scan, bookings, venue finder.
9. Back office reporting.
10. Hardening: rate limits, audit log, error tracking, backups, load test at 40 tables ordering at once.

## 9. Open items (none block steps 1–5)

- **Confirm with Revolut + MarketMan before step 6:** that MarketMan picks up Merchant API orders (app and terminal) with their line items, not only Revolut POS app sales; how cash sales reach MarketMan; and where Round can read stock-outs. The fallback is the MarketMan API (higher-tier plan needed).
- Solicitor sign-off on the staff ID-check approach.
- How venues pay you: monthly SaaS fee, per-order fee, or both (Stripe Connect supports a per-payment fee; for Revolut, plan on a monthly invoice).
- Service charge or tipping in the app.
- How far ahead bookings can be made.
- Printer and Revolut Terminal models at each venue.
- Brand name and domain.
