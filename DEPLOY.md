# Deploying Complete to complete.pub

One Docker image runs everything (guest app, staff screens, back office, scheduled jobs). It applies new database migrations on start (never drops data) and answers `/api/health`.

## 1. Hosting (EU)

Any host that runs a Dockerfile, with Postgres 16 in the EU. For example:
- **Render** (Frankfurt): new Web Service from this repo (Docker), plus a Render Postgres in Frankfurt.
- **Railway** or **Fly.io** (Amsterdam): same Dockerfile, managed Postgres in the same region.
- **Your own server**: `docker compose up -d` (includes Postgres).

## 2. Environment

| Variable | What |
|---|---|
| `DATABASE_URL` | Postgres connection string (from the host) |
| `APP_URL` | `https://complete.pub` |
| `SESSION_SECRET` | 64 random characters |
| `SECRETS_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Hostinger mailbox: `smtp.hostinger.com`, `465`, `hello@complete.pub`, its password |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`; subject `mailto:hello@complete.pub` |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | From developer.xero.com (redirect `https://complete.pub/api/xero/callback`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM` | Guest sign-in texts. In Twilio, allow only Ireland (and other countries you serve) under Geo permissions |
| `ANTHROPIC_API_KEY` | Optional: "Ask your data" |
| `SPORTSDB_KEY` | Optional: full fixture lists |
| `FUNDING_PARTNER_URL`, `BRAND_API_TOKENS` | Optional: partners |
| `SEED_DEMO` | `1` on a staging site only: adds the two demo venues to an empty database |

Keep secrets in the host's secret settings, never in the repo.

## 3. Domain and email

- Point `complete.pub` at the host (the host shows the DNS records; usually an A or CNAME record in Hostinger's DNS).
- In Hostinger, turn on SPF, DKIM and DMARC for complete.pub so sign-up and supplier emails aren't marked as spam.

## 4. After the first deploy

- Open `https://complete.pub/api/health`: it should say `{"ok":true}`.
- Sign up a venue at `https://complete.pub/start`, import a myPOS **test** configuration pack, place a test order, go live.
- Each pilot venue imports its own myPOS configuration pack and sets its VAT number, then presses Go live.


## Sizing for 10,000 users (measured Nov 2026)

One app process serves a menu page in ~15–20 ms and sustains ~65 requests/second per CPU core. A
load test (`scripts/loadtest.mjs`) with 150 simultaneous signed-in users across 3 processes ran
5,424 requests, including 1,090 orders in 45 seconds, with **zero errors**, on a 4-core box that also
ran Postgres and the load generator. For 10,000 registered guests (allow ~1,000 active at the
Friday-night peak, ~150–300 requests/second):

- **App:** 4 instances (2 vCPU, 1 GB each) behind the load balancer, `DB_POOL_MAX=10`. Any number of
  instances is safe: rate limits, job locks and caches are shared or short-lived; each instance holds
  one LISTEN connection for live screens.
- **Postgres 16 (EU):** 4 vCPU / 16 GB, daily backups + point-in-time recovery.
  Connections needed ≈ instances × (`DB_POOL_MAX` + `JOBS_POOL_MAX` + 1) + headroom; keep it under
  `max_connections`. Above ~8 instances, put **PgBouncer (transaction mode)** in front and set
  `DATABASE_URL` to PgBouncer and `DATABASE_URL_DIRECT` to Postgres (LISTEN and the job queue need a
  direct connection; tenant settings are per transaction, so transaction pooling is safe).
- **Caching:** venue and menu reads are cached 5 s per process, What's on 30 s; writes clear the
  cache on the server that made them, other servers catch up within the TTL.
- **Before launch:** run `scripts/loadtest.mjs` against staging at 2× expected peak and watch
  `/api/health?deep=1` and `/ops`.
