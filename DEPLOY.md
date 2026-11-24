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
