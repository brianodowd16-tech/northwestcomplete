'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OrderStore, describeLines } = require('../src/store');
const { createApp } = require('../src/app');
const baseConfig = require('../config/draw.json');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'draw-')), 'orders.json');
const config = { ...baseConfig, salesCloseDate: '2999-01-01T00:00:00Z' };
const cardLines = (order) => order.lines.map(({ card, line }) => `${card}.${line}`);

async function withServer(opts, fn) {
  const server = createApp(opts).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test('store fills online cards in order, is idempotent and persists', async () => {
  const file = tmpFile();
  const store = new OrderStore(file);
  const a = await store.fulfil({ id: 'a', lineCount: 3, amount: 1000, currency: 'eur' });
  const again = await store.fulfil({ id: 'a', lineCount: 3, amount: 1000, currency: 'eur' });
  const b = await store.fulfil({ id: 'b', lineCount: 2, amount: 1000, currency: 'eur' });
  assert.deepEqual(cardLines(a), ['1.1', '1.2', '1.3']);
  assert.equal(again, a);
  assert.deepEqual(cardLines(b), ['1.4', '1.5']);

  const reloaded = new OrderStore(file);
  assert.equal(reloaded.linesSold(), 5);
  const c = await reloaded.fulfil({ id: 'c', lineCount: 1, amount: 500, currency: 'eur' });
  assert.deepEqual(cardLines(c), ['1.6']);
});

test('an order that fits on one card is kept together; big orders span cards', async () => {
  const store = new OrderStore(tmpFile(), { linesPerCard: 20 });
  await store.fulfil({ id: 'a', lineCount: 15 });
  const b = await store.fulfil({ id: 'b', lineCount: 7 });
  const c = await store.fulfil({ id: 'c', lineCount: 3 });
  const d = await store.fulfil({ id: 'd', lineCount: 45 });
  assert.equal(describeLines(b.lines), 'Card 2, lines 1-7');
  assert.equal(describeLines(c.lines), 'Card 2, lines 8-10');
  assert.equal(describeLines(d.lines), 'Card 3, lines 1-20; Card 4, lines 1-20; Card 5, lines 1-5');
  assert.deepEqual(store.cards().map((card) => [card.card, card.lines.filter(Boolean).length]), [[1, 15], [2, 10], [3, 20], [4, 20], [5, 5]]);
});

test('concurrent fulfilments never share a line', async () => {
  const store = new OrderStore(tmpFile());
  const orders = await Promise.all(Array.from({ length: 20 }, (_, i) => store.fulfil({ id: `o${i}`, lineCount: 3 })));
  const all = orders.flatMap(cardLines);
  assert.equal(new Set(all).size, 60);
});

test('demo checkout enters lines and the order lookup shows a count, not positions', async () => {
  const store = new OrderStore(tmpFile());
  await withServer({ config, store, stripe: null, publicUrl: 'http://x' }, async (base) => {
    const res = await fetch(`${base}/api/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundleId: 'seven', quantity: 2 }),
    });
    const { url } = await res.json();
    const id = new URL(url, base).searchParams.get('session_id');
    const order = await (await fetch(`${base}/api/order/${id}`)).json();
    assert.equal(order.lines, 14);
    assert.equal(order.amount, 4000);
    assert.equal(order.drawLocation, config.drawLocation);
    assert.ok(!JSON.stringify(order).includes('card'));

    const draw = await (await fetch(`${base}/api/draw`)).json();
    assert.equal(draw.ticketsSold, undefined);
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
      body: JSON.stringify({ bundleId: 'three', quantity: 2, price: 1 }),
    });
    assert.equal((await res.json()).url, 'https://checkout.stripe.com/x');
  });
  assert.equal(params.line_items[0].price_data.unit_amount, 1000);
  assert.equal(params.line_items[0].quantity, 2);
  assert.equal(params.metadata.lineCount, '6');
  assert.match(params.success_url, /^https:\/\/draw\.example\/success\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test('webhook fulfils paid sessions using signature-verified events', async () => {
  const Stripe = require('stripe');
  const stripe = Stripe('sk_test_dummy');
  const secret = 'whsec_test';
  const store = new OrderStore(tmpFile());
  const session = {
    id: 'cs_test_1', payment_status: 'paid', amount_total: 2000, currency: 'eur',
    metadata: { bundleId: 'seven', lineCount: '7' },
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
  assert.equal(order.lines.length, 7);
  assert.equal(order.customer.name, 'Mary Murphy');
  assert.equal(order.soldBy, 'Seán');
});

test('paid sessions label the Stripe payment with their card and lines once', async () => {
  const updates = [];
  const stripe = {
    paymentIntents: { update: async (id, params) => { updates.push({ id, params }); return {}; } },
    checkout: { sessions: { retrieve: async (id) => ({
      id, payment_status: 'paid', payment_intent: 'pi_123', amount_total: 1000, currency: 'eur',
      metadata: { bundleId: 'three', lineCount: '3' }, customer_details: { email: 'a@example.com', name: 'Ann Lee' },
    }) } },
  };
  const store = new OrderStore(tmpFile());
  await withServer({ config, store, stripe, publicUrl: 'http://x' }, async (base) => {
    const first = await (await fetch(`${base}/api/order/cs_test_label`)).json();
    assert.equal(first.lines, 3);
    await new Promise((r) => setTimeout(r, 50));
    await fetch(`${base}/api/order/cs_test_label`);
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'pi_123');
  assert.equal(updates[0].params.metadata.onlineCards, 'Card 1, lines 1-3');
  assert.match(updates[0].params.description, /: 3 lines for Ann Lee$/);
  assert.equal(store.get('cs_test_label').stripeLabelled, true);
});

test('admin cards page and CSV require the token and escape names', async () => {
  const store = new OrderStore(tmpFile());
  await store.fulfil({ id: 'x', lineCount: 2, customer: { name: '<b>A "B"</b>', phone: '087' }, soldBy: 'Seán' });
  await withServer({ config, store, stripe: null, publicUrl: 'http://x', adminToken: 'secret-token' }, async (base) => {
    assert.equal((await fetch(`${base}/admin/cards`)).status, 401);
    assert.equal((await fetch(`${base}/admin/cards?token=wrong-token!`)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/lines.csv`)).status, 401);

    const html = await (await fetch(`${base}/admin/cards?token=secret-token`)).text();
    assert.match(html, /Online card 1/);
    assert.match(html, /2 online lines on 1 card/);
    assert.ok(html.includes('&lt;b&gt;A &quot;B&quot;&lt;/b&gt;'));
    assert.ok(!html.includes('<b>A'));
    assert.equal((html.match(/<tr><td>/g) || []).length, config.linesPerCard);

    const csv = await (await fetch(`${base}/api/admin/lines.csv`, { headers: { authorization: 'Bearer secret-token' } })).text();
    const rows = csv.trim().split('\n');
    assert.equal(rows.length, 3);
    assert.match(rows[1], /^"1","1","<b>A ""B""<\/b>","087"/);
  });
});

test('pages carry security headers and absolute share URLs', async () => {
  await withServer({ config, store: new OrderStore(tmpFile()), stripe: null, publicUrl: 'https://draw.example' }, async (base) => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('strict-transport-security'));
    assert.ok(!html.includes('__PUBLIC_URL__'));
    assert.match(html, /<meta property="og:image" content="https:\/\/draw\.example\/img\/og\.png">/);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  });
});

test('big-spend bundles enter their lines across whole cards', async () => {
  const store = new OrderStore(tmpFile(), { linesPerCard: config.linesPerCard });
  await withServer({ config, store, stripe: null, publicUrl: 'http://x' }, async (base) => {
    const res = await fetch(`${base}/api/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundleId: 'twohundred', quantity: 1 }),
    });
    const id = new URL((await res.json()).url, base).searchParams.get('session_id');
    const order = await (await fetch(`${base}/api/order/${id}`)).json();
    assert.equal(order.lines, 200);
    assert.equal(order.amount, 50000);
  });
  assert.equal(store.cards().length, 10);
  assert.ok(config.bundles.some((b) => b.price === 10000 && b.lines === 40));
  assert.ok(config.bundles.some((b) => b.price === 20000 && b.lines === 80));
});

test('a single order cannot go over the maximum spend', async () => {
  await withServer({ config, store: new OrderStore(tmpFile()), stripe: null, publicUrl: 'http://x' }, async (base) => {
    const post = (body) => fetch(`${base}/api/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ bundleId: 'twohundred', quantity: 2 })).status, 400);
    assert.equal((await post({ bundleId: 'twenty', quantity: 10 })).status, 200);
    assert.equal((await post({ bundleId: 'eighty', quantity: 3 })).status, 400);
  });
});
