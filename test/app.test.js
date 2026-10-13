'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OrderStore } = require('../src/store');
const { createApp } = require('../src/app');
const baseConfig = require('../config/draw.json');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'draw-')), 'orders.json');
const config = { ...baseConfig, salesCloseDate: '2999-01-01T00:00:00Z' };

async function withServer(opts, fn) {
  const server = createApp(opts).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test('store allocates sequential tickets, is idempotent and persists', async () => {
  const file = tmpFile();
  const store = new OrderStore(file, { startNumber: 1001 });
  const a = await store.fulfil({ id: 'a', ticketCount: 3, amount: 2500, currency: 'eur' });
  const again = await store.fulfil({ id: 'a', ticketCount: 3, amount: 2500, currency: 'eur' });
  const b = await store.fulfil({ id: 'b', ticketCount: 2, amount: 2000, currency: 'eur' });
  assert.deepEqual(a.tickets, [1001, 1002, 1003]);
  assert.equal(again, a);
  assert.deepEqual(b.tickets, [1004, 1005]);

  const reloaded = new OrderStore(file);
  assert.equal(reloaded.ticketsSold(), 5);
  const c = await reloaded.fulfil({ id: 'c', ticketCount: 1, amount: 1000, currency: 'eur' });
  assert.deepEqual(c.tickets, [1006]);
});

test('concurrent fulfilments never share ticket numbers', async () => {
  const store = new OrderStore(tmpFile());
  const orders = await Promise.all(Array.from({ length: 20 }, (_, i) => store.fulfil({ id: `o${i}`, ticketCount: 3 })));
  const all = orders.flatMap((o) => o.tickets);
  assert.equal(new Set(all).size, 60);
});

test('demo checkout issues tickets and order lookup returns them', async () => {
  const store = new OrderStore(tmpFile());
  await withServer({ config, store, stripe: null, publicUrl: 'http://x' }, async (base) => {
    const res = await fetch(`${base}/api/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundleId: 'family', quantity: 2 }),
    });
    const { url } = await res.json();
    const id = new URL(url, base).searchParams.get('session_id');
    const order = await (await fetch(`${base}/api/order/${id}`)).json();
    assert.equal(order.tickets.length, 14);
    assert.equal(order.amount, 10000);

    const draw = await (await fetch(`${base}/api/draw`)).json();
    assert.equal(draw.ticketsSold, 14);
  });
});

test('checkout rejects bad input and closed sales', async () => {
  const store = new OrderStore(tmpFile());
  await withServer({ config, store, stripe: null, publicUrl: 'http://x' }, async (base) => {
    const post = (body) => fetch(`${base}/api/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ bundleId: 'nope' })).status, 400);
    assert.equal((await post({ bundleId: 'single', quantity: 0 })).status, 400);
    assert.equal((await post({ bundleId: 'single', quantity: 999 })).status, 400);
  });
  const closed = { ...config, salesCloseDate: '2000-01-01T00:00:00Z' };
  await withServer({ config: closed, store, stripe: null, publicUrl: 'http://x' }, async (base) => {
    const res = await fetch(`${base}/api/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bundleId: 'single' }) });
    assert.equal(res.status, 410);
  });
});

test('Stripe checkout session is built server-side from config prices', async () => {
  let params;
  const stripe = { checkout: { sessions: { create: async (p) => { params = p; return { url: 'https://checkout.stripe.com/x' }; } } } };
  await withServer({ config, store: new OrderStore(tmpFile()), stripe, publicUrl: 'https://draw.example' }, async (base) => {
    const res = await fetch(`${base}/api/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundleId: 'triple', quantity: 2, price: 1 }),
    });
    assert.equal((await res.json()).url, 'https://checkout.stripe.com/x');
  });
  assert.equal(params.line_items[0].price_data.unit_amount, 2500);
  assert.equal(params.line_items[0].quantity, 2);
  assert.equal(params.metadata.ticketCount, '6');
  assert.match(params.success_url, /^https:\/\/draw\.example\/success\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test('webhook fulfils paid sessions using signature-verified events', async () => {
  const Stripe = require('stripe');
  const stripe = Stripe('sk_test_dummy');
  const secret = 'whsec_test';
  const store = new OrderStore(tmpFile());
  const session = {
    id: 'cs_test_1', payment_status: 'paid', amount_total: 5000, currency: 'eur',
    metadata: { bundleId: 'family', ticketCount: '7' },
    customer_details: { email: 'mary@example.com', phone: '+353870000000', name: 'Card Name' },
    custom_fields: [{ key: 'fullname', text: { value: 'Mary Murphy' } }, { key: 'soldby', text: { value: 'Seán' } }],
  };
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: session } });
  await withServer({ config, store, stripe, webhookSecret: secret, publicUrl: 'http://x' }, async (base) => {
    const bad = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: payload });
    assert.equal(bad.status, 400);

    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const ok = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
    assert.equal(ok.status, 200);
  });
  const order = store.get('cs_test_1');
  assert.equal(order.tickets.length, 7);
  assert.equal(order.customer.name, 'Mary Murphy');
  assert.equal(order.soldBy, 'Seán');
});

test('admin CSV requires the token', async () => {
  const store = new OrderStore(tmpFile());
  await store.fulfil({ id: 'x', ticketCount: 2, customer: { name: 'A "B"' } });
  await withServer({ config, store, stripe: null, publicUrl: 'http://x', adminToken: 'secret-token' }, async (base) => {
    assert.equal((await fetch(`${base}/api/admin/tickets.csv`)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/tickets.csv?token=wrong-token!`)).status, 401);
    const res = await fetch(`${base}/api/admin/tickets.csv`, { headers: { authorization: 'Bearer secret-token' } });
    const csv = await res.text();
    assert.equal(csv.trim().split('\n').length, 3);
    assert.match(csv, /"A ""B"""/);
  });
});
