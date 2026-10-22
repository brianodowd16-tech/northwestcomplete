# CLAUDE.md — Round: hospitality ordering, POS & loyalty platform

> Single hand-off file summarising the full planning chat. Put it in the repo root as `CLAUDE.md` (Claude Code reads it automatically). "Round" is a placeholder product name.

## 0. Context from the planning chat

**Founder goal:** build a SaaS like The Pass (thepassapp.com.au, Australian Venue Co's loyalty app across 200+ pubs) for Ireland, then the EU. It combines table ordering, a custom POS, inventory and loyalty, with Revolut Business as the payments and banking layer. The founder will build with Claude Code, connecting Revolut and (optionally) MarketMan.

**Scope answers given by the founder** (later decisions in section 2 override these where they conflict):
1. Pilot: 2 Irish venues (MJ O'Connor's and Drumhierny Woodland Hideaway; confirm spelling), 20 tables each.
2. SaaS model, each venue gets a bespoke programme; bespoke options for chains of bars.
3. Start in Ireland, expand across the EU.
4. Own POS replaces the Revolut POS app for app orders; Revolut POS stays as the fallback till. Revolut may be the simplest payment layer.
5. No card terminals needed. Guests scan a QR code and pay in the app through Revolut's online gateway (or Stripe).
6. Pay per order, upfront. No split bills.
7. Food goes to the table: kitchen screen + kitchen printer. Drinks are collected at the bar: bar printer + bar POS.
8. All loyalty features from The Pass: levels, points, birthday credit, bonus credit, double points, referrals, gift cards, sign-up credit.
9. No points for tapping a card at the till without the app (too complex).
10. Inventory: item counts, recipe-level tracking, supplier POs, stocktakes with variance, multiple stock locations. Asked whether MarketMan can be used (see 5.5).
11. Backend + QR web app first, then native iOS/Android apps.
12. V1 also includes events, ticketing, gig guide, live sport, bookings and venue finder.
13. Internet assumed stable (eSIM / backup connection). Revolut POS is the fallback if it drops. No offline mode.
14. Wanted: a clickable prototype + MVP spec, built further with Claude Code.

**Research findings:**
- **MarketMan:** has a REST API v3 (inventory, recipes, menu items, sales, POs). API access for custom integrations is only on higher-tier plans (Professional/Ultimate), with credentials from their account team. Sync is one-way (POS → MarketMan), and MarketMan cannot mark items sold out in the POS automatically. Recommendation: build native inventory for the pilot and add MarketMan as an optional connector.
- **Revolut Merchant API:** server creates an order and returns a token. The client mounts Revolut's widget, which covers Apple Pay and Google Pay in one widget, plus Revolut Pay and card; Apple Pay needs domain registration. Webhooks include ORDER_AUTHORISED and ORDER_COMPLETED and can arrive out of order, so handlers must be idempotent and verify signatures. Revolut also supports pushing payments to Revolut Terminal from a POS, but that isn't needed here.
- **Irish VAT:** since 1 July 2026, food, catering and hot drinks served with food are at 9%. Alcohol, soft drinks and bottled water stay at 23%.
- **Branding:** don't copy The Pass's name, branding or exact tier numbers.

**Prototype (already built, published as a claude.ai artifact named "Round Venue Platform"):** a single-file HTML/JS app with example data that shows the intended behaviour:
- **Guest app:** table picker, menu with live sell-out, cart with VAT split, 18+ checkbox, credit and double-points toggles, simulated payment sheet, live order tracking, rewards page, events/tickets with QR, bookings, venue switcher.
- **Bar POS:** docket lanes (new → pouring → ready → collected) and a walk-up sale grid.
- **Kitchen screen:** docket lanes (new → cooking → ready → run to table) with late timers.
- **Back office:**
  - Overview: KPIs and sales by hour.
  - Menu: food cost, GP and portions left.
  - Loyalty rules and editable levels, per venue.
  - Inventory by location, with stocktake variance.
  - Purchase orders: draft → sent → received.
  - Events and bookings.
  - Integrations (Revolut / Stripe / MarketMan) and an event log.
- **Example tiers:**
  - MJ O'Connor's "The Snug Club": Regular €0, Local €400, Stalwart €1,500, Legend €4,000.
  - Drumhierny "Woodland Club": Sapling €0, Birch €300, Oak €1,200, Yew €3,500.
  - Both programmes: 10 pts per €1, 100 pts = €1 credit, €10 sign-up credit, 500 referral points.

---




## 1. Product in one paragraph

A white-label SaaS for Irish (then EU) pubs, bars and venues. Guests scan a QR at the table, order and pay in a web app, and earn points in the venue's own loyalty programme. Drinks print at the bar for collection; food goes to the kitchen screen and printer and is run to the table. Staff use Round's bar POS, the venue's only POS, for walk-up drink sales collected at the bar. Managers run menus, events, ticketing and loyalty from a back office. Every sale is taken through the Revolut Merchant API (Stripe later), so Round is effectively a white-label POS on top of Revolut. Inventory lives in MarketMan, which gets sales from Revolut and reports stock-outs back; Round does not talk to MarketMan directly.

## 2. Decisions already made (from scoping)

| Area | Decision |
|---|---|
| Model | SaaS. Each venue gets its own bespoke programme; chains can share one programme across venues. |
| Market | Ireland first (EUR, Irish VAT), then EU. |
| Pilot | 2 venues, 20 tables each. |
| Payments | Guests pay in-app, upfront, per order. No split bills. No card terminals required. Revolut Merchant API primary, Stripe later. Round's bar POS is the **only** POS: a white-label POS built on the Merchant API. |
| Routing | Drinks → bar printer + bar POS, guest collects. Food → kitchen screen + kitchen printer, runner to table. |
| Loyalty | All features: spend-based levels, points per €, birthday credit, level-up bonus points, bonus credits, double-points transactions, referral points, sign-up credit, gift cards, points-to-credit conversion. No card-linked earning at the till. |
| Inventory | **MarketMan is the system of record**, with a live two-way inventory integration through Revolut. Recipes, counts, stocktakes, POs and suppliers stay in MarketMan, and it knows when items run out. Sales reach MarketMan via Revolut, so **Round has no direct MarketMan link**. Native inventory is deferred. |
| Guest app | QR web app (PWA) first, native iOS/Android later from the same backend. |
| V1 extras | Events + ticketing, gig guide, live sport listings, table bookings, venue finder. |
| Connectivity | Assume online. Backup 4G/eSIM at venue. Revolut POS app as manual fallback. No offline mode in v1. |
| Pilot venues | MJ O'Connor's and Drumhierny Woodland Hideaway only. O'Dowd's / odowdscarrick.com is **not** part of this project. Drumhierny is tables only in the pilot; ordering from lodges is phase 2. |
| Guest accounts | Account required to order (for retention). Saved card or Apple/Google Pay for fast repeat checkout. Age verification: staff-checked ID for the pilot, digital ID check (Yoti/Veriff) long term (see 6). |
| Walk-up sales | Rung up on Round's bar POS and paid through Revolut. Walk-up orders are drinks collected at the bar; food is always delivered to a table. Walk-ups earn **no** loyalty. |

## 3. Architecture

```
Guest PWA (Next.js)        Bar POS / KDS (Next.js, tablet)      Back office (Next.js)
        \                         |                                /
         \------------- API (TypeScript, REST + WebSocket) -------/
                         |            |              |
                    Postgres     Job queue       Realtime
                  (multi-tenant)  (webhooks,     (order + docket
                                   printing)       status push)
                         |            |
      Revolut Merchant API      Cloud printers (Epson Server Direct Print / Star CloudPRNT)
      Stripe (Connect, later)
            |
      MarketMan (via Revolut's integration; sales in, stock-outs out)
```

Suggested stack: Next.js + TypeScript monorepo (Turborepo), Postgres (Supabase or Neon), Prisma or Drizzle, a queue (BullMQ on Redis, or Postgres-backed like pg-boss), WebSockets or Supabase Realtime for live dockets. Host in the EU for GDPR.

Tenancy: every row carries `tenant_id` (operator/group) and most carry `venue_id`. Enforce with row-level security or a scoped repository layer. Never trust a venue ID from the client.

## 4. Core data model (first pass)

- `tenant` (group / chain), `venue` (name, branding, timezone, VAT settings, payment provider, tables count)
- `table` (venue, number, qr_token)
- `menu_category`, `menu_item` (price incl. VAT, vat_rate, station: bar | kitchen, active), `modifier_group`, `modifier`
- Inventory tables below (`recipe_line` to `stocktake_line`) are **deferred**: MarketMan owns inventory in the pilot. Keep `menu_item.external_id` mapped to the Revolut/MarketMan item so stock-outs can be matched.
- `recipe_line` (menu_item → stock_item, qty)
- `stock_location` (Cellar, Back bar, Kitchen cool room, Main store), `stock_item` (unit, pack size, cost, par, supplier), `stock_level` (item × location, on_hand)
- `stock_movement` (sale, receipt, transfer, waste, stocktake adjustment) — on_hand is derived from movements, never edited directly
- `supplier`, `purchase_order`, `purchase_order_line`, `stocktake`, `stocktake_line`
- `customer` (global identity, date of birth, `age_verified_at`, `age_verified_by` staff id, `age_verification_method`: staff_id_check | digital_id), `membership` (customer × programme: points, credit, rolling spend, level, doubles_remaining, referral_code)
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
3. Age gate: the guest gives a date of birth at sign-up (must be 18+). Until staff have checked their ID, alcohol dockets carry a **CHECK ID** flag (see 6).
4. Server creates a Revolut order via the Merchant API (amount in minor units, EUR, `merchant_order_data.reference` = our order ID, `line_items` with `external_id` = the Revolut/MarketMan item ID so MarketMan can deduct stock) and returns its token. Send the `Revolut-Api-Version` header.
5. Client mounts the Revolut checkout widget (Apple Pay / Google Pay / Revolut Pay / card). Apple Pay needs the domain registered with Revolut per venue domain. Link the order to a Revolut customer so a card can be saved and reused on later orders (confirm the saved-payment-method flow in the sandbox).
6. Revolut sends webhooks. **Only release dockets on `ORDER_COMPLETED`** (or `ORDER_AUTHORISED` if you capture later). Events can arrive out of order, so make handlers idempotent and keyed on the Revolut order ID. Verify the signature and timestamp.
7. On completion, in one transaction: mark order paid, create bar/kitchen dockets, write loyalty ledger entries. Then enqueue printing. (Stock is deducted by MarketMan from the Revolut sale.)
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
- Walk-up sales: the bar POS has a walk-up button. Walk-ups are drinks only, paid through Revolut, collected at the bar, and create a bar docket with no table. Food is never walk-up; it always goes to a table.
- Sold out: items MarketMan reports as out of stock are marked unavailable in the guest app and POS; staff can also toggle sold-out by hand.

### 5.4 Inventory (deferred — MarketMan owns this in the pilot)
- Every paid line writes negative `stock_movement` rows per recipe line, from the location mapped to that station (bar items from Back bar/Cellar, food from Kitchen).
- Auto sell-out: an item is unavailable when any recipe ingredient can't cover one portion. Recompute on each movement and push availability to open guest apps.
- Stocktake: staff enter counts per location; variance = counted − expected, valued at cost; post adjustments as movements.
- Purchase orders: suggest items below a threshold of par, quantity rounded up to pack size, grouped by supplier. Draft → sent (email PDF to supplier) → received (receipt movements, optional cost update).
- Units to support from day one: litres (kegs, spirits by 35.5 ml measure), bottles, kg, each.

### 5.5 MarketMan (via Revolut, no direct link)

Pilot decision: MarketMan has a live two-way inventory integration through Revolut. Every Round sale (app and walk-up) is a Revolut Merchant API order, MarketMan picks the sales up from Revolut, and MarketMan reports when items run out. Round does not call MarketMan.

**Verify before build step 5:** that MarketMan's Revolut integration reads Merchant API (online) orders and their `line_items`, not only Revolut POS app sales, and where Round can read stock-outs from (Revolut's item catalogue or a MarketMan feed). If it can't, fall back to manual sold-out toggles and the MarketMan API.

Background from earlier research (superseded where it conflicts with the above):
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
- Alcohol: minimum age 18. Under s.31 of the Intoxicating Liquor Act 1988 (as amended in 2000), the licensee's defence appears to rest on an **age card (or ID) being produced**, so a date of birth typed into an app is not enough on its own. A solicitor must confirm before launch.
- Pilot age verification (middle ground): date of birth at sign-up; the first alcohol docket for an unverified account is flagged **CHECK ID**; bar staff check a Garda age card, passport or driving licence when the guest collects, then tap "ID checked" on the POS. Store who checked, when and the document type, never an image or document number. Later orders show the account as verified, staff still challenge anyone who looks under 25, and the guest's name shows on the docket to discourage account sharing.
- Long term: digital ID check (Yoti, Veriff or similar) at sign-up.
- GDPR: marketing consent separate from account creation; data export and deletion; EU hosting; data processing agreements with venues.
- Never store card data. Payment details stay inside the Revolut/Stripe components.

## 7. MVP scope (pilot: 2 venues × 20 tables)

Must have:
1. Venue onboarding (manual by you): menu, tables + QR codes, Revolut keys, printers, programme rules
2. Guest PWA: menu, cart, account + age gate, pay, live order status, account with points/credit/level, rewards page, events, tickets, bookings
3. Bar screen + walk-up POS (drinks, paid via Revolut) with ID-check flow; kitchen screen; cloud printing to one bar and one kitchen printer
4. Back office: menu + prices + availability, loyalty rules and levels, events, bookings, sales overview (stock, stocktakes and POs live in MarketMan)
5. Revolut payments with webhooks and reconciliation
6. Revolut orders carry line items mapped to MarketMan items; stock-outs shown in the app and POS, plus manual sold-out toggles
7. Guest accounts with staff ID-check verification and saved payment methods

Later: Stripe provider, native inventory (recipes, stocktakes, POs) for venues without MarketMan, lodge ordering at Drumhierny (phase 2), digital ID verification, native apps, push notifications, multi-venue reporting, modifiers depth, refunds UI, staff roles beyond admin/staff.

Done when: a guest at either pilot venue can order and pay from a table, the docket prints and shows at the right station within 3 seconds of payment, points update correctly, the sale appears in MarketMan via Revolut, and an item MarketMan marks out of stock disappears from the menu.

## 8. Build order for Claude Code

1. Monorepo, auth (staff email login + required guest account with date of birth and ID-check status), tenancy, seed script with the prototype's example data for MJ O'Connor's and Drumhierny.
2. Menu + table + QR model, guest menu and cart (server-priced).
3. `PaymentProvider` + Revolut sandbox: create order, widget, webhook endpoint with signature check, reconciliation job.
4. Dockets + realtime bar/kitchen screens; then cloud printing.
5. Item mapping to Revolut/MarketMan IDs, stock-out sync into the menu, manual sold-out toggles, walk-up POS.
6. Loyalty ledger + rules engine + rewards UI; birthday/bonus-credit jobs.
7. Events, tickets with QR scan, bookings.
8. Back office reporting.
9. Hardening: rate limits, audit log, error tracking, backups, load test at 40 tables ordering at once.

Suggested first prompt: "Read SPEC.md. Scaffold step 1 and 2 as a Turborepo with apps/guest, apps/staff, apps/office and packages/db, packages/core. Use Postgres with row-level tenancy. Seed two venues from section 4 with example data."

## 9. Open questions to settle

- How venues pay you: monthly SaaS fee, per-order fee, or both (affects Revolut vs Stripe Connect).
- Walk-up payment: with no card terminal, how does a walk-up guest pay? A QR on the POS screen paid on the guest's phone, a Revolut payment link, or a Revolut card reader? Is cash accepted?
- MarketMan ↔ Revolut: confirm it picks up Merchant API orders (not just Revolut POS app sales) and how stock-outs are exposed to Round.
- If Round is down, is the Revolut POS app still the fallback till?
- Solicitor sign-off on the staff ID-check approach to age verification.
- Service charge or tipping in the app?
- Modifiers (e.g. "no ice", steak cooking) needed in v1?
- Who confirms bookings and how far ahead can people book?
- Printer models at the pilot venues.
- Brand name and domain (check trademark availability before committing).
