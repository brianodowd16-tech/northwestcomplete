# Round

White-label table ordering, payments and loyalty for Irish pubs, built on the Revolut Merchant API. Pilot venues: MJ O'Connor's and Drumhierny Woodland Hideaway.

- `SPEC.md`: what Phase 1 is and why.
- `CLAUDE.md`: rules for building it.

## Run the prototype

Needs Node 22, pnpm 10 and Postgres 16.

```sh
cp .env.example .env          # set SESSION_SECRET; leave Revolut keys empty for test payments
createdb round                # or point DATABASE_URL at any empty database
pnpm install
pnpm db:reset                 # wipes the database, migrates, seeds both venues
pnpm dev                      # http://localhost:3000
```

The home page links to each venue's guest app (by table QR or collect-at-bar), bar and kitchen screens, and back office.

- Staff logins: `staff@mjoconnors.example` / `staff@drumhierny.example`, password `round-demo`.
- Guest sign-in texts a code. No SMS provider is wired yet, so in development the code is shown on screen.
- Without Revolut keys, checkout uses a test payment sheet that sends a properly signed webhook through the same code path as Revolut. Add sandbox keys to `.env` to use the real Revolut checkout widget, and point Revolut's webhook at `/api/webhooks/revolut`.

## Try the loop

1. Open table 1 at MJ O'Connor's, add a pint and fish & chips, sign up, pay.
2. On the bar screen the drinks docket has a red **CHECK ID** banner. Start it and mark it ready: the guest's order page updates live. It can't be marked collected until staff record the ID check.
3. On the kitchen screen, cook and serve the food.
4. Mark an item sold out: it disappears from open guest menus.
5. Rewards shows points, credit and level; the back office shows sales, VAT and this month's Round statement (subscription + 1%).

## Tests

`pnpm test` runs unit tests for pricing, VAT, loyalty, billing, sessions and webhook signatures, plus integration tests against Postgres covering tenant isolation, payment webhooks, idempotency, ID checks and refunds. The integration tests wipe `TEST_DATABASE_URL` (default `postgres://round:round@localhost:5432/round_test`).
