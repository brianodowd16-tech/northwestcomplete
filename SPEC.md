# Round — MVP build spec (for Claude Code)

> Working name "Round" is a placeholder. Put this file in the repo root as `SPEC.md` and point Claude Code at it. The clickable prototype shows the intended behaviour of every screen described here.

## 1. Product in one paragraph

A white-label SaaS for Irish (then EU) pubs, bars and venues. Guests scan a QR at the table, order and pay in a web app, and earn points in the venue's own loyalty programme. Drinks print at the bar for collection; food goes to the kitchen screen and printer and is run to the table. Staff use a bar POS for walk-up sales. Managers run menus, stock, purchase orders, events, ticketing and loyalty from a back office. Payments go through Revolut (Stripe as fallback). Inventory is built in, with optional sync to MarketMan.

## 2. Decisions already made (from scoping)

| Area | Decision |
|---|---|
| Model | SaaS. Each venue gets its own bespoke programme; chains can share one programme across venues. |
| Market | Ireland first (EUR, Irish VAT), then EU. |
| Pilot | 2 venues, 20 tables each. |
| Payments | Guests pay in-app, upfront, per order. No split bills. No card terminals required. Revolut Merchant API primary, Stripe fallback. Revolut POS app is the fallback till. |
| Routing | Drinks → bar printer + bar POS, guest collects. Food → kitchen screen + kitchen printer, runner to table. |
| Loyalty | All features: spend-based levels, points per €, birthday credit, level-up bonus points, bonus credits, double-points transactions, referral points, sign-up credit, gift cards, points-to-credit conversion. No card-linked earning at the till. |
| Inventory | **MarketMan is the system of record** (already linked to Revolut POS at both venues). Recipes, counts, stocktakes, POs and suppliers stay in MarketMan. Round pushes app sales to MarketMan. Native inventory is deferred. |
| Guest app | QR web app (PWA) first, native iOS/Android later from the same backend. |
| V1 extras | Events + ticketing, gig guide, live sport listings, table bookings, venue finder. |
| Connectivity | Assume online. Backup 4G/eSIM at venue. Revolut POS app as manual fallback. No offline mode in v1. |
| Pilot venues | MJ O'Connor's and Drumhierny Woodland Hideaway only. O'Dowd's / odowdscarrick.com is **not** part of this project. |
| Guest accounts | Account required to order (for retention). Age verification at sign-up. Saved card or Apple/Google Pay for fast repeat checkout. |
| Walk-up sales | Staff ring up the sale and the guest pays on the Revolut POS app. Walk-ups earn **no** loyalty. |

## 3. Architecture

```
Guest PWA (Next.js)        Bar POS / KDS (Next.js, tablet)      Back office (Next.js)
        \                         |                                /
         \------------- API (TypeScript, REST + WebSocket) -------/
                         |            |              |
                    Postgres     Job queue       Realtime
                  (multi-tenant)  (webhooks,     (order + docket
                                   printing,       status push)
                                   MarketMan sync)
                         |            |
      Revolut Merchant API      Cloud printers (Epson Server Direct Print / Star CloudPRNT)
      Stripe (Connect)          MarketMan API v3
```

Suggested stack: Next.js + TypeScript monorepo (Turborepo), Postgres (Supabase or Neon), Prisma or Drizzle, a queue (BullMQ on Redis, or Postgres-backed like pg-boss), WebSockets or Supabase Realtime for live dockets. Host in the EU for GDPR.

Tenancy: every row carries `tenant_id` (operator/group) and most carry `venue_id`. Enforce with row-level security or a scoped repository layer. Never trust a venue ID from the client.

## 4. Core data model (first pass)

- `tenant` (group / chain), `venue` (name, branding, timezone, VAT settings, payment provider, tables count)
- `table` (venue, number, qr_token)
- `menu_category`, `menu_item` (price incl. VAT, vat_rate, station: bar | kitchen, active), `modifier_group`, `modifier`
- `recipe_line` (menu_item → stock_item, qty)
- `stock_location` (Cellar, Back bar, Kitchen cool room, Main store), `stock_item` (unit, pack size, cost, par, supplier), `stock_level` (item × location, on_hand)
- `stock_movement` (sale, receipt, transfer, waste, stocktake adjustment) — on_hand is derived from movements, never edited directly
- `supplier`, `purchase_order`, `purchase_order_line`, `stocktake`, `stocktake_line`
- `customer` (global identity), `membership` (customer × programme: points, credit, rolling spend, level, doubles_remaining, referral_code)
- `programme` (venue or group: name, points_per_euro, points_per_credit_euro, signup_credit, referral_points, shared flag), `programme_level` (min_spend_12m, birthday_credit, levelup_points, bonus_credits, double_points_count)
- `loyalty_ledger` (every points/credit change with reason, order_id) — balances are sums of the ledger
- `order` (venue, table, customer, status, gross, vat_9, vat_23, credit_used, amount_paid, provider, provider_order_id, idempotency_key)
- `order_line`, `docket` (order, station, status: new | making | ready | done, timestamps)
- `event` (type: ticketed | gig | sport, capacity, price), `ticket` (code, status), `booking`, `gift_card`
- `integration_credential` (venue, provider, encrypted keys), `webhook_event` (raw payload, signature check result, processed_at)

## 5. Key flows

### 5.1 Table order and payment (Revolut)
1. Guest scans QR → `/v/{venueSlug}/t/{qrToken}`. Server resolves venue + table.
2. Cart is priced **server-side**. Client prices are display only.
3. Age gate: the guest's account must be age-verified (18+) at sign-up before alcohol can be ordered. Staff can still check ID at collection.
4. Server creates a Revolut order via the Merchant API (amount in minor units, EUR, `merchant_order_data.reference` = our order ID) and returns its token.
5. Client mounts the Revolut checkout widget (Apple Pay / Google Pay / Revolut Pay / card). Apple Pay needs the domain registered with Revolut per venue domain. Link the order to a Revolut customer so a card can be saved and reused on later orders (confirm the saved-payment-method flow in the sandbox).
6. Revolut sends webhooks. **Only release dockets on `ORDER_COMPLETED`** (or `ORDER_AUTHORISED` if you capture later). Events can arrive out of order, so make handlers idempotent and keyed on the Revolut order ID. Verify the signature and timestamp.
7. On completion, in one transaction: mark order paid, create bar/kitchen dockets, write stock movements from recipes, write loyalty ledger entries. Then enqueue printing and MarketMan sync.
8. A reconciliation job polls Revolut for any order stuck in `pending` for more than a few minutes.

Each venue has its own Revolut Business merchant account and API keys (secret key server-side only, public key for the widget). Store keys encrypted.

### 5.2 Payment provider abstraction
`PaymentProvider` interface: `createOrder`, `getOrder`, `refund`, `verifyWebhook`, `parseWebhook`. Implement `RevolutProvider` first, `StripeProvider` second. The venue setting picks one.

How you charge venues is an open decision (see 9). Stripe Connect supports a platform application fee per payment; I could not confirm an equivalent split for Revolut, so plan on a monthly subscription invoice for Revolut venues.

### 5.3 Docket routing and printing
- Split order lines by `menu_item.station`. Coffee goes to bar.
- Push to the station screen over WebSocket and to the printer via a cloud-print protocol (Epson Server Direct Print or Star CloudPRNT, so the printer polls our server and no local bridge is needed).
- Statuses: bar `new → pouring → ready → collected`; kitchen `new → cooking → ready → served`. Guest app shows each docket's progress live. "Ready at the bar" triggers a push or SMS later; in v1 the open web app updates.
- Late thresholds per station (prototype: bar 5 min, kitchen 15 min).

### 5.4 Inventory
- Every paid line writes negative `stock_movement` rows per recipe line, from the location mapped to that station (bar items from Back bar/Cellar, food from Kitchen).
- Auto sell-out: an item is unavailable when any recipe ingredient can't cover one portion. Recompute on each movement and push availability to open guest apps.
- Stocktake: staff enter counts per location; variance = counted − expected, valued at cost; post adjustments as movements.
- Purchase orders: suggest items below a threshold of par, quantity rounded up to pack size, grouped by supplier. Draft → sent (email PDF to supplier) → received (receipt movements, optional cost update).
- Units to support from day one: litres (kegs, spirits by 35.5 ml measure), bottles, kg, each.

### 5.5 MarketMan (required for the pilot)

Pilot decision: both venues already run MarketMan linked to Revolut POS, so MarketMan owns inventory. Round sends it the app sales; walk-up sales already reach it through Revolut POS. Auto sell-out in v1 is a manual sold-out toggle on the staff screens unless MarketMan's on-hand levels can be read back reliably (see 9).

Background from research:
- MarketMan has a REST API (v3) covering inventory, recipes, menu items, sales and POs. API access needs a higher-tier plan and partner credentials from their account team, so confirm cost before relying on it.
- Integration is effectively **one-way**: push menu items and each completed sale to MarketMan. Recipes, POs and counts then live in MarketMan.
- MarketMan cannot sell out items in a POS automatically, so keep our own stock mirror and recipe table for auto sell-out even when MarketMan is on.
- Recommendation: build the native inventory for the pilot (it is needed for sell-out anyway) and add MarketMan as a connector for venues that already use it.

### 5.6 Loyalty engine
- Points = floor(amount actually paid × points_per_euro). Credit-funded portions earn nothing. Gift card purchases earn nothing.
- Double-points: if the guest chooses to use one and has one, multiply that order's points by 2 and decrement.
- Level = highest level whose `min_spend_12m` ≤ rolling 12-month spend. On level-up, award level-up points, grant that level's double-points count, and schedule its bonus credits (e.g. 4 × €20 released quarterly).
- Birthday credit: a daily job credits members on their birthday at their current level's amount, with an expiry.
- Referral: both members get points once the referred member's first paid order completes.
- Sign-up credit: on first membership creation in a programme.
- Points → credit conversion at the programme's rate.
- Everything goes through `loyalty_ledger`; balances are derived. Refunds reverse the ledger lines for that order.
- Shared programmes: membership belongs to the group programme, so points earned at any venue in the group count.

### 5.7 Events, ticketing, bookings
- Ticketed events sell through the same payment flow; issue a ticket with a unique code and QR; door staff scan from the back office on a phone.
- Gig guide and live sport are free listings.
- Bookings are requests that venue staff confirm or decline in the back office (no table-management engine in v1).

## 6. Tax and compliance (Ireland)

- From 1 July 2026, food and catering (including hot drinks served with it) is 9% VAT; alcohol, soft drinks and bottled water stay at 23%. Store the VAT rate on each menu item and show both on receipts. Have an accountant confirm the mapping for each venue before launch.
- Prices are VAT-inclusive. Calculate VAT per line and round at line level consistently.
- Receipts: email receipt available on every order with VAT breakdown and the venue's VAT number.
- Alcohol: minimum age 18. In-app confirmation plus staff checks at collection.
- GDPR: marketing consent separate from account creation; data export and deletion; EU hosting; data processing agreements with venues.
- Never store card data. Payment details stay inside the Revolut/Stripe components.

## 7. MVP scope (pilot: 2 venues × 20 tables)

Must have:
1. Venue onboarding (manual by you): menu, tables + QR codes, Revolut keys, printers, programme rules
2. Guest PWA: menu, cart, age gate, pay, live order status, account with points/credit/level, rewards page, events, tickets, bookings
3. Bar screen + walk-up POS; kitchen screen; cloud printing to one bar and one kitchen printer
4. Back office: menu + prices + availability, loyalty rules and levels, events, bookings, sales overview (stock, stocktakes and POs live in MarketMan)
5. Revolut payments with webhooks and reconciliation
6. Push every paid app order to MarketMan; sold-out toggles on staff screens
7. Guest accounts with age verification and saved payment methods

Later: Stripe provider, native inventory (recipes, stocktakes, POs) for venues without MarketMan, native apps, push notifications, multi-venue reporting, modifiers depth, refunds UI, staff roles beyond admin/staff.

Done when: a guest at either pilot venue can order and pay from a table, the docket prints and shows at the right station within 3 seconds of payment, points update correctly, and the sale appears in MarketMan.

## 8. Build order for Claude Code

1. Monorepo, auth (staff email login + required guest account with age verification), tenancy, seed script with the prototype's example data for MJ O'Connor's and Drumhierny.
2. Menu + table + QR model, guest menu and cart (server-priced).
3. `PaymentProvider` + Revolut sandbox: create order, widget, webhook endpoint with signature check, reconciliation job.
4. Dockets + realtime bar/kitchen screens; then cloud printing.
5. MarketMan sales push (queued, retried, idempotent) + sold-out toggles.
6. Loyalty ledger + rules engine + rewards UI; birthday/bonus-credit jobs.
7. Events, tickets with QR scan, bookings.
8. Back office reporting.
9. Hardening: rate limits, audit log, error tracking, backups, load test at 40 tables ordering at once.

Suggested first prompt: "Read SPEC.md. Scaffold step 1 and 2 as a Turborepo with apps/guest, apps/staff, apps/office and packages/db, packages/core. Use Postgres with row-level tenancy. Seed two venues from section 4 with example data."

## 9. Open questions to settle

- How venues pay you: monthly SaaS fee, per-order fee, or both (affects Revolut vs Stripe Connect).
- Age verification method: date of birth declared at sign-up, or a document/selfie check through a provider (e.g. Yoti, Veriff)?
- Walk-ups: if they're rung on Revolut POS (which already feeds MarketMan), does the bar POS in Round need a walk-up grid at all? Ringing them in both would double-count stock.
- MarketMan: are the venues on a plan with API access, and how will app sales reach it (MarketMan API directly, or through Revolut POS)?
- Drumhierny: are some ordering points cabins or lodges rather than tables (delivery, opening hours)?
- Service charge or tipping in the app?
- Modifiers (e.g. "no ice", steak cooking) needed in v1?
- Who confirms bookings and how far ahead can people book?
- Printer models at the pilot venues.
- Brand name and domain (check trademark availability before committing).
