# Complete — final design

> Product name: **Complete**. Check trademark (EUIPO and the Irish Patents Office, classes 9, 42 and 43) and the domain before spending on the brand. `CLAUDE.md` holds the working rules for building it. Section 9 records what is built and what is left.

## 1. Product in one paragraph

Complete is a white-label ordering, payments and loyalty platform for Irish bars, hotels and restaurants (then the EU). Guests with an account scan a QR at their table, or choose **Collect at bar**, order and pay on their phone through the venue's own **myPOS** account (Revolut also supported), and earn points in the venue's own loyalty programme. Drinks go to the bar screen and printer for collection; food goes to the kitchen screen and printer and is run to the table. After paying, every guest is offered a link to leave the venue a Google review. Each night the day's app sales go to the venue's **Xero** as one invoice with the card payment applied. Counter sales stay on the venue's existing till. Venues pay a monthly subscription plus 1% of app payments.

## 2. Decisions

| Area | Decision |
|---|---|
| Model | SaaS for bars, hotels and restaurants. Each venue gets its own loyalty programme; groups can share one. |
| Market | Ireland first (EUR, Irish VAT), then EU. |
| Pilot | **MJ O'Connor's** and **Drumhierny Woodland Hideaway**, 20 tables each. Drumhierny is tables only; lodge ordering is a later phase. O'Dowd's / odowdscarrick.com is not part of this project. |
| App payments | Account required. Pay upfront, per order, no split bills. **myPOS Checkout** (hosted payment page: card, Apple Pay, Google Pay) is the default. Revolut Merchant API is supported for venues that prefer it. Each venue is paid straight into its own merchant account; Complete never holds guest money. |
| Venue credentials | Each venue's myPOS / Revolut keys and Xero tokens are stored encrypted (AES-256-GCM, key in `SECRETS_KEY`) and entered by the manager in Back office → Settings. Never shown again after saving. |
| Counter sales | The venue's existing till (Revolut POS or a myPOS terminal), unchanged. Counter sales earn no loyalty. A white-label counter POS is a later phase. |
| Routing | Drinks → bar screen + bar printer, collected at the bar. Food → kitchen screen + kitchen printer, run to a table. Food is never "collect at bar". |
| Loyalty | Spend-based levels, points per €, birthday credit, level-up bonus points, bonus credits, double points, referral points, sign-up credit, gift cards, points-to-credit conversion. Only card-paid app orders earn. |
| Google reviews | After paying, every guest sees the same "Leave a Google review" button, which opens Google's own review form for the venue. No points, credit or discounts for reviews, and no rating question first: Google bans review incentives and "review gating". The back office counts how many guests opened the form. |
| Accounting | **Xero**, per venue: one invoice per trading day (sales by VAT rate, less loyalty credit and refunds) plus one payment into the venue's card clearing account. Account codes and tax rates are set per venue with their accountant. |
| Inventory | Out of scope. MarketMan or the venue's own stock system carries on from its till. Staff get a manual sold-out toggle. |
| Age verification | Date of birth (18+) at sign-up; staff check physical ID on a guest's first alcohol collection (section 6). Digital ID later. |
| Billing (venues → you) | Monthly subscription per venue plus **1% of completed app payments** net of refunds. myPOS and Revolut can't split a platform fee from each payment, so Complete calculates it and invoices monthly. |
| Bookings | Each venue sets how far ahead guests can book; default 1 month. |
| Apps | Web app (works on any phone from the QR) first. iOS and Android apps wrap the same app and add push notifications ("drinks ready"), submitted from a company developer account. |
| myPOS setup | The manager pastes or uploads the **configuration pack** from the myPOS account (Online → Settings → Configuration pack). The server checks it (store ID, client number, key index, keys, a test signature) and stores it encrypted. Test packs only until the sandbox checks in section 9 pass. |
| AI and agents | Loyalty is machine-readable for guests' own AI assistants (Claude, ChatGPT and others): profile, benefits, live eligibility, quotes and prepared orders. A guest connects an assistant from Rewards, choosing what it may do, the largest order, the most credit per order, and how long access lasts (1–90 days). The token is shown once and only its SHA-256 is stored. Assistants can never pay: orders they prepare wait until the guest approves and pays in the app. Every request, allowed or refused, is logged for the guest and the venue. The guest can switch it off at any time. Assistants connect through an MCP server at `/api/mcp` (same tools as REST at `/api/agent/v1/tools`). |
| Redemption rules | Per programme: minimum order for credit, minimum order for double points, whether credit and double points stack (if not, credit wins), and an optional monthly cap on credit redeemed per venue. Enforced on the server for app orders and assistant requests alike. |
| Recommendations | "Your usual", "Goes with" and "Popular here", from the venue's own paid orders over the last 90 days. No third-party data, no profiling across venues. |
| Venue assistant | "Ask your data" in the back office: Claude answers managers' questions from a snapshot of that venue's sales, best sellers and loyalty totals. No guest personal data is sent. Off unless `ANTHROPIC_API_KEY` is set. |
| Brand and domain | The product is **Complete**, at **complete.pub** (`APP_URL=https://complete.pub`). Venues' guest apps carry the venue's own name, colour and icon. |
| Self-serve sign-up | Venues sign up at `/start` with no sales call: email code, venue details, owner password (10+ characters, not common or personal). They get tables, starter menu sections (optional example menu), a loyalty programme, an admin login and a **30-day free trial** (no subscription or app fee for payments in the trial; the first month after is charged pro rata). New venues start in **test mode** (test payments, banner on every guest page, hidden from the venue list) and **go live** themselves once the menu, myPOS (or Revolut) and VAT number are done. The platform can suspend a venue. Test-payment orders are never billed. |
| Self-serve admin | Managers edit the menu (sections, items, prices, VAT, bar/kitchen, alcohol, collectable), set the number of tables and print QR codes (one per table plus one for collect-at-bar; a code can be replaced), add staff or managers with a one-time password that must be changed at first sign-in, and edit venue details. |
| Mobile apps | Every venue is an installable web app (PWA) with its own manifest, icon and offline page; no store needed. Native iOS and Android apps are Capacitor shells (`apps/mobile`) loading `APP_URL`: one Complete app, and optionally one white-label app per venue. Push notifications are the first native feature, needed for App Store approval. |
| Connectivity | Assume online, with backup 4G/eSIM. If Complete is down, the venue keeps trading on its till. |

## 3. Architecture

```
Guest web app (/v/...)   Bar + kitchen screens (/staff/...)   Back office + Settings (/office/...)
            \                         |                                /
             \------------- one Next.js app (apps/web) ---------------/
                               |                |               |
                          Postgres 16       pg-boss jobs     Live updates
                       (row-level tenancy) (in Postgres)   (server-sent events over
                               |                |            Postgres LISTEN/NOTIFY)
                               |                |
   myPOS Checkout ─ hosted page + signed notify │      Xero API ─ nightly invoice + payment
   Revolut Merchant API ─ widget + webhooks ────┤      Google ─ "write a review" link
   Cloud printers (Star CloudPRNT / Epson SDP) ─┘
```

Stack: Turborepo (pnpm), Next.js 15 + TypeScript, Postgres 16 in the EU, Drizzle, pg-boss, Vitest, GitHub Actions.

Layout: `apps/web`; `packages/core` (pricing, VAT, loyalty, billing, sessions, payment providers, myPOS, Xero, reviews, secrets; no database); `packages/db` (schema, migrations, RLS, seed, services, integrations).

Tenancy: every tenant-scoped row has `tenant_id`; Postgres row-level security limits each request to one tenant. Platform-level lookups (a venue slug, a payment notification) use an explicit unscoped path. Never trust a venue, table or price from the browser.

## 4. Data model

**Tenancy and venue**: `tenant`; `venue` (slug, branding, timezone, VAT number, `payment_provider` mock | mypos | revolut, `google_place_id`, booking window); `venue_table` (QR token); `staff_user` (admin | staff); `venue_integration` (venue × kind mypos | revolut | xero: plain `config`, encrypted `secret_enc`); `subscription` (monthly fee, `app_fee_bps` = 100).

**Menu**: `menu_category`; `menu_item` (price incl. VAT in cents, VAT 9 | 23, station bar | kitchen, alcohol flag, collectable, sold out).

**Guests and loyalty**: `customer` (phone, email, name, date of birth, marketing consent, ID-check record without images or numbers); `otp_code`; `programme`; `programme_level`; `membership`; `loyalty_ledger` (points, credit, double-points tokens; all balances are sums).

**Orders**: `orders` (channel table | collect, status pending_payment | paid | cancelled | refunded, gross, VAT 9/23, credit used, amount paid, provider order id, `provider_txn_ref` for refunds, `refunded_at`, `review_clicked_at`, idempotency key); `order_line`; `docket` (station, status, ID-check flag and record); `webhook_event` (every notification stored raw with its signature result).

**AI assistants**: `programme.redemption_rules` (jsonb); `agent_grant` (customer × venue, name, `token_hash` unique, `token_hint`, scopes, `max_order_cents`, `max_credit_cents`, `expires_at`, `revoked_at`, `last_used_at`); `agent_action` (grant, tool, input, allowed, reasons, outcome) as the audit log.

**Accounting**: `xero_sync` (venue × trading day: done | nothing | error, invoice id, attempts) so no day is posted twice.

## 5. Key flows

### 5.1 Sign-in
Phone number + one-time text code. First time: name, date of birth (18+), email for receipts, separate marketing opt-in. Joining a venue grants its sign-up credit.

### 5.2 Order and pay (myPOS)
1. Guest scans the table QR (`/v/{venue}/t/{token}`) or picks **Collect at bar** (drinks only).
2. The server prices the basket (VAT per line, rounded half-up) and applies credit and double points.
3. The server builds the signed myPOS `IPCPurchase` form: amount, order id, cart lines with loyalty credit as a negative line, customer name and email, return URLs and `URL_Notify = {APP_URL}/api/webhooks/mypos/{venue}`. Signature: values joined with `-`, base64, RSA-SHA256 with the venue's private key.
4. The guest's browser posts the form to myPOS and pays (card, Apple Pay, Google Pay).
5. myPOS posts a signed `IPCPurchaseNotify`. The server verifies it with the venue's myPOS certificate over every field received, checks the store ID, venue and **amount**, stores it, and answers `OK`. Only this releases the order: dockets, loyalty, live update. A forged, altered or under-paid notification changes nothing.
6. myPOS sends the guest back to the order page (or to it with "payment cancelled").
7. A paid-but-unnotified order can't be looked up at myPOS, so the reconciliation job cancels unpaid orders after 30 minutes. Revolut orders are looked up and settled.
8. Repeating a request with the same idempotency key returns the same order and checkout.

Revolut venues use the Revolut widget and webhooks instead; everything after "paid" is the same.

### 5.3 Bar and kitchen
Dockets appear live on the bar or kitchen screen and print. Bar: new → pouring → ready → collected; kitchen: new → cooking → ready → served. A first alcohol order from a guest without a staff ID check shows **CHECK ID** and can't be marked collected until staff record **ID checked** (document type only) or **Refused**. Refusing refunds the card through myPOS (`IPCRefund` with the transaction reference) or Revolut **first**, then marks the order refunded and reverses its loyalty; if the card refund fails, nothing changes and staff can retry.

### 5.4 Google reviews
The manager pastes the venue's Google Place ID in Settings. Every paid order page then shows "Leave a Google review", which goes through `/api/v/{venue}/review/{order}` (records the first click on that order) to `https://search.google.com/local/writereview?placeid=…`. The back office shows today's clicks against orders. Not allowed, ever: rewarding reviews, asking for a rating first, or showing the button only to some guests.

### 5.5 Xero
1. Manager clicks **Connect to Xero** in Settings (OAuth 2, signed state bound to the manager and venue), picks the organisation, then fills in the account mapping with their accountant: sales account, tax rates for 9% and 23%, account and tax rate for loyalty credit, the bank/clearing account card payments land in, and the invoice contact.
2. Every night at 03:15 (Europe/Dublin) a job posts **yesterday** for each connected venue, and retries failed days from the past week:
   - one `ACCREC` invoice, amounts VAT-inclusive: food & hot drinks (9%), drinks (23%), less loyalty credit redeemed, less refunds (by rate), plus credit returned on refunds;
   - one payment for the card money (paid minus refunded) into the clearing account.
3. Each post carries an idempotency key (`complete:{venue}:{date}:inv|pay`) and the day is recorded in `xero_sync`, so reruns never duplicate. Tokens refresh automatically; Xero's rotated refresh token is saved before use.
4. A day where refunds exceed sales is flagged for a manual credit note. Managers can also press **Send yesterday now**.

### 5.6 Loyalty
Points = floor(card amount × points per €). Credit and gift-card amounts earn nothing. Double-points tokens, level-ups (every level crossed is awarded), birthday credit, referral (both sides on the first paid order), points → credit, and refunds reversing the order's ledger lines.

### 5.6a AI assistants
1. Guest: Rewards → AI assistants → Connect one. Pick scopes (`profile:read`, `benefits:read`, `orders:quote`, `points:convert`, `orders:create`) and limits; copy the server address and token into the assistant's custom connector.
2. Assistant calls tools: `get_profile`, `list_benefits`, `get_menu`, `recommend_items`, `check_eligibility`, `quote_order`, `start_order`, `convert_points`. Each call is checked against the grant's scopes, limits and expiry, and the venue's redemption rules, then audited.
3. `start_order` prices the order on the server and saves it as held (no payment provider contacted, no dockets) and returns an approval link.
4. Guest opens the link, checks the order and taps Approve and pay: normal checkout with the venue's own provider. Dockets release only on the verified payment notification, as for any order.

### 5.7 Billing
Each venue's statement: subscription + 1% of completed app payments net of refunds + 23% VAT on fees, shown live in the back office. Collect it by Stripe Billing, SEPA direct debit or your own Xero (open item).

## 6. Tax and compliance (Ireland)

- **VAT**: food and catering (including hot drinks served with it) 9% since 1 July 2026; alcohol, soft drinks and bottled water 23%. Each venue's accountant confirms the menu rates and the Xero mapping.
- **Receipts**: email receipt with VAT breakdown and the venue's VAT number.
- **Alcohol, 18+**: under s.31 of the Intoxicating Liquor Act 1988 (as amended 2000) the licensee's defence appears to rest on an age card or ID being produced, so staff check ID on first collection. A solicitor signs this off before launch.
- **Google reviews**: no incentives, no gating, no staff review quotas.
- **GDPR**: EU hosting; separate marketing consent; data export and deletion; data processing agreements with venues; no ID images or numbers; no card data (it stays with myPOS/Revolut).
- **Secrets**: venue keys and tokens encrypted at rest; `SECRETS_KEY`, `SESSION_SECRET` and the Xero app secret live only in the hosting provider's secret store.

## 7. Automation

| What | How |
|---|---|
| Payments settle | myPOS signed notify / Revolut webhook, verified and idempotent. |
| Missed or abandoned payments | `reconcile-payments` job every minute (pg-boss). |
| Accounting | `xero-nightly` job at 03:15, retries failures for 7 days. |
| Live screens | Postgres NOTIFY → server-sent events to guest, bar and kitchen. |
| Abandoned assistant orders | Held orders not approved within 30 minutes are cancelled by `reconcile-payments`. |
| Quality gate | GitHub Actions on every push: typecheck, 52 unit + Postgres integration tests, production build. |
| Schedules survive restarts | pg-boss keeps schedules in Postgres; several app instances never double-run a job. |

## 8. Environment

`DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `SECRETS_KEY` (32 random bytes, base64), `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, optional `XERO_SCOPES`, `REVOLUT_MODE`, optional `ANTHROPIC_API_KEY` (venue assistant). Venue keys are not environment variables: managers enter them in Settings.

## 9. Status

**Built and tested** (branch `prototype`): guest web app; sign-in; table and collect-at-bar ordering; myPOS hosted checkout and verified notifications; Revolut; test payments; bar and kitchen screens with ID checks and refunds; sold-out toggles; loyalty engine; Google review prompt and tracking; Xero connect, mapping and nightly sync; back office with sales, VAT, review clicks and the monthly statement; Settings for payments (including myPOS configuration pack import), reviews, redemption rules and Xero; encrypted venue credentials; AI features (recommendations, machine-readable benefits, guest-controlled assistant access with limits, held orders the guest approves, audit log, MCP server and REST API, venue "Ask your data"); pg-boss jobs; CI.

**Next to build**: text-message provider for sign-in codes and an email provider for business sign-up codes (EU region); push notifications in the native apps; platform admin (suspend venues, see sign-ups); collecting subscriptions; cloud printing to the bar and kitchen printers; events, tickets, bookings, gift cards, birthday and bonus-credit jobs; iOS and Android wrappers with push notifications; hosting and deploy pipeline; GDPR export and delete.

**Built for self-serve** (branch `prototype`): business sign-up, get-started checklist and go-live, free trial, menu editor, tables and printable QR codes, team accounts, venue details, landing page, per-venue installable app, Capacitor iOS/Android shell.

**To confirm before going live**
- **myPOS**: run one sandbox payment and one refund to confirm the signature format, `IPCRefund` fields and certificate format (the docs are inconsistent). Each venue needs a myPOS online store, its RSA 2048 key pair exchanged with myPOS, and the notify URL set.
- **Xero**: register the app; check whether new apps must use Xero's granular scopes (override with `XERO_SCOPES`); the Core tier covers up to 50 connected organisations, above that Plus requires certification. Each venue's accountant fills in the mapping.
- **Google**: each venue's Place ID.
- **AI assistants**: test the MCP server with Claude and ChatGPT custom connectors (both need a public HTTPS `APP_URL`); add OAuth sign-in for connectors that require it instead of a pasted token; add a privacy-notice line on assistant access.
- Solicitor sign-off on the ID check; accountant sign-off on VAT rates and Xero mapping.
- Trademark search for "Complete" in hospitality software (EUIPO and Irish register).
- How you collect your monthly statements, and the subscription price.
- Apple and Google developer accounts (company accounts need a D-U-N-S number; new personal Google Play accounts need a 14-day closed test).
