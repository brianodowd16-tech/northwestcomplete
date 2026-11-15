'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { describeLines } = require('./store');

/**
 * Builds the Express app. `stripe` may be null, in which case the site runs in
 * demo mode: checkout skips payment and enters test lines immediately.
 */
function createApp({ config, store, stripe, webhookSecret, publicUrl, adminToken, demoMode = !stripe }) {
  const app = express();
  app.disable('x-powered-by');
  // Hosts such as Render and Railway sit behind one proxy; this makes req.ip the visitor's address.
  app.set('trust proxy', 1);
  const publicDir = path.join(__dirname, '..', 'public');
  const isHttps = publicUrl.startsWith('https://');

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
      ].join('; '),
    });
    if (isHttps) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  const linesForSession = (session) => Number.parseInt(session.metadata?.lineCount, 10);

  async function fulfilSession(session) {
    if (session.payment_status !== 'paid') return null;
    const field = (key) => session.custom_fields?.find((f) => f.key === key)?.text?.value?.trim() || null;
    const order = await store.fulfil({
      id: session.id,
      lineCount: linesForSession(session),
      amount: session.amount_total,
      currency: session.currency,
      bundleId: session.metadata?.bundleId ?? null,
      soldBy: field('soldby'),
      customer: {
        name: field('fullname') ?? session.customer_details?.name ?? null,
        email: session.customer_details?.email ?? null,
        phone: session.customer_details?.phone ?? null,
      },
    });
    if (!order.stripeLabelled) labelPayment(session.payment_intent, order);
    return order;
  }

  // Note the order's online card and lines on the payment in Stripe, so the club can match
  // payments to printed cards in the Dashboard even without this server's data file.
  function labelPayment(paymentIntentId, order) {
    if (!stripe?.paymentIntents || typeof paymentIntentId !== 'string') return;
    const n = order.lines.length;
    const where = describeLines(order.lines);
    stripe.paymentIntents.update(paymentIntentId, {
      description: `${config.drawName}: ${n} line${n > 1 ? 's' : ''}${order.customer.name ? ` for ${order.customer.name}` : ''}`,
      metadata: { lineCount: String(n), onlineCards: where.slice(0, 500) },
    }).then(() => store.markLabelled(order.id))
      .catch((err) => console.error(`Could not label payment ${paymentIntentId} (${where}):`, err.message));
  }

  // Stripe needs the raw body to verify the signature, so this route is registered before express.json().
  app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !webhookSecret) return res.status(503).send('Webhook not configured');
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }
    try {
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        await fulfilSession(event.data.object);
      }
      res.json({ received: true });
    } catch (err) {
      console.error('Webhook fulfilment failed', err);
      res.status(500).send('Fulfilment failed');
    }
  });

  app.use(express.json({ limit: '10kb' }));

  app.get('/api/draw', (_req, res) => {
    const { clubName, clubShort, clubArea, address, mapsUrl, drawName, currency, drawDate, drawLocation, salesCloseDate,
      facebookUrl, contactEmail, licenceNote, bundles, prizes, maxBundlesPerOrder } = config;
    res.json({
      clubName, clubShort, clubArea, address, mapsUrl, drawName, currency, drawDate, drawLocation, salesCloseDate,
      facebookUrl, contactEmail, licenceNote, bundles, prizes, maxBundlesPerOrder,
      salesOpen: Date.now() < Date.parse(salesCloseDate),
      demoMode,
    });
  });

  // A light per-visitor limit on starting checkouts, to stop scripted abuse.
  const checkoutHits = new Map();
  const rateLimited = (ip) => {
    const now = Date.now();
    const recent = (checkoutHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    checkoutHits.set(ip, recent);
    if (checkoutHits.size > 5000) checkoutHits.clear();
    return recent.length > 20;
  };

  app.post('/api/checkout', async (req, res) => {
    if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
    const bundle = config.bundles.find((b) => b.id === req.body?.bundleId);
    const quantity = Number.parseInt(req.body?.quantity ?? 1, 10);
    if (!bundle) return res.status(400).json({ error: 'Please choose how many lines you want.' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > config.maxBundlesPerOrder) {
      return res.status(400).json({ error: `Quantity must be between 1 and ${config.maxBundlesPerOrder}.` });
    }
    if (Date.now() >= Date.parse(config.salesCloseDate)) {
      return res.status(410).json({ error: 'Online entries for this draw have closed.' });
    }

    const lineCount = bundle.lines * quantity;

    if (demoMode) {
      const id = `demo_${crypto.randomUUID()}`;
      await store.fulfil({
        id, lineCount, amount: bundle.price * quantity, currency: config.currency, bundleId: bundle.id,
        customer: { name: 'Demo Customer', email: 'demo@example.com' },
      });
      return res.json({ url: `/success.html?session_id=${id}` });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          quantity,
          price_data: {
            currency: config.currency,
            unit_amount: bundle.price,
            product_data: {
              name: `${config.drawName} — ${bundle.label}`,
              description: `${bundle.lines} line${bundle.lines > 1 ? 's' : ''} in the ${config.clubName} ${config.drawName}`,
            },
          },
        }],
        custom_fields: [
          { key: 'fullname', label: { type: 'custom', custom: 'Full name (for the draw)' }, type: 'text' },
          { key: 'soldby', label: { type: 'custom', custom: 'Club member who sent you (optional)' }, type: 'text', optional: true },
        ],
        phone_number_collection: { enabled: true },
        payment_intent_data: { description: `${config.drawName}: ${lineCount} line${lineCount > 1 ? 's' : ''}` },
        metadata: { bundleId: bundle.id, quantity: String(quantity), lineCount: String(lineCount) },
        success_url: `${publicUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicUrl}/?cancelled=1#tickets`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe checkout failed', err);
      res.status(502).json({ error: 'We couldn’t start checkout. Please try again in a moment.' });
    }
  });

  // Called by the success page. Falls back to fetching the session from Stripe
  // in case the customer lands before the webhook has been processed.
  app.get('/api/order/:id', async (req, res) => {
    const { id } = req.params;
    let order = store.get(id);
    if (!order && stripe && id.startsWith('cs_')) {
      try {
        order = await fulfilSession(await stripe.checkout.sessions.retrieve(id));
      } catch {
        return res.status(404).json({ error: 'Order not found.' });
      }
    }
    if (!order) return res.status(404).json({ error: 'Order not found yet.' });
    // Line positions on the printed cards stay with the club; buyers just see what they entered.
    res.json({
      lines: order.lines.length,
      name: order.customer.name,
      firstName: order.customer.name?.split(/\s+/)[0] ?? null,
      email: order.customer.email,
      amount: order.amount,
      currency: order.currency,
      drawDate: config.drawDate,
      drawLocation: config.drawLocation,
      demo: id.startsWith('demo_'),
    });
  });

  const requireAdmin = (req, res, next) => {
    const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.token || '';
    const ok = adminToken && supplied.length === adminToken.length
      && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(adminToken));
    return ok ? next() : res.status(401).json({ error: 'Unauthorised' });
  };

  // One row per line, in card order: a backup of what the printed cards hold.
  app.get('/api/admin/lines.csv', requireAdmin, (_req, res) => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['card', 'line', 'name', 'phone', 'email', 'sold_by', 'order_id', 'purchased_at'].join(',')];
    for (const { card, lines } of store.cards()) {
      lines.forEach((o, i) => {
        if (o) rows.push([card, i + 1, o.customer.name, o.customer.phone, o.customer.email, o.soldBy, o.id, o.createdAt].map(esc).join(','));
      });
    }
    res.type('text/csv').attachment('online-lines.csv').send(rows.join('\n'));
  });

  // Printable online cards in the same layout as the paper draw cards, one card per A4 page.
  app.get('/admin/cards', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(renderCards({
      config, cards: store.cards(), linesPerCard: store.linesPerCard, token: String(req.query.token ?? ''),
    }));
  });

  // The landing page needs absolute URLs in its share tags (Facebook and WhatsApp ignore relative ones).
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8').replaceAll('__PUBLIC_URL__', publicUrl);
  app.get(['/', '/index.html'], (_req, res) => res.set('Cache-Control', 'no-cache').type('html').send(indexHtml));

  app.use(express.static(publicDir, {
    extensions: ['html'],
    setHeaders: (res, file) => res.set('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'),
  }));

  return app;
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderCards({ config, cards, linesPerCard, token }) {
  const drawDate = new Date(config.drawDate);
  const when = `${drawDate.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Dublin' })} at ${drawDate.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: true, timeZone: 'Europe/Dublin' }).replace(/\s/g, '')}`;
  const total = cards.reduce((n, c) => n + c.lines.filter(Boolean).length, 0);
  const csv = `/api/admin/lines.csv?token=${encodeURIComponent(token)}`;
  const sheet = ({ card, lines }) => `
    <section class="card">
      <header><img src="/img/crest-96.png" alt="" width="48" height="48"><div><strong>${escapeHtml(config.clubName)}</strong><span>${escapeHtml(config.drawName)} 2026</span></div><b>Online card ${card}</b></header>
      <table>
        <thead><tr><th>#</th><th>Name &amp; contact details</th><th>Seller</th></tr></thead>
        <tbody>${Array.from({ length: linesPerCard }, (_, i) => {
          const o = lines[i];
          const contact = o ? [o.customer.phone, o.customer.email].filter(Boolean).map(escapeHtml).join(' · ') : '';
          return `<tr><td>${i + 1}</td><td>${o ? `<strong>${escapeHtml(o.customer.name || '(no name given)')}</strong><small>${contact}</small>` : ''}</td><td>${o ? escapeHtml(o.soldBy || 'Online') : ''}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <footer>Big Draw in ${escapeHtml(config.drawLocation)}, ${escapeHtml(when)} · Entered online, paid by card</footer>
    </section>`;
  return `<!doctype html>
<html lang="en-IE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Online cards · ${escapeHtml(config.drawName)}</title>
<style>
  body { margin: 0; font: 15px/1.4 system-ui, sans-serif; color: #102018; background: #e9efeb; }
  .bar { position: sticky; top: 0; display: flex; flex-wrap: wrap; gap: .8rem 1.5rem; align-items: center; padding: 1rem 1.5rem; background: #0d6b36; color: #fff; }
  .bar a, .bar button { color: #fff; font: inherit; font-weight: 700; }
  .bar button { padding: .5rem 1rem; border: 0; border-radius: 999px; background: #c4141f; cursor: pointer; }
  .empty { padding: 3rem 1.5rem; text-align: center; }
  .card { max-width: 760px; margin: 1.5rem auto; padding: 1.5rem; background: #fff; border-top: 10px solid #0d6b36; }
  .card header { display: flex; gap: .8rem; align-items: center; margin-bottom: 1rem; }
  .card header div { flex: 1; display: grid; }
  .card header span { color: #4a5c52; }
  .card header b { padding: .4rem .8rem; border-radius: 6px; background: #c4141f; color: #fff; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: .4rem; background: #0d6b36; color: #fff; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
  td { height: 2.3rem; padding: .25rem .4rem; border-bottom: 1px solid #b9c8bf; vertical-align: middle; }
  td:first-child { width: 2rem; font-weight: 700; color: #0d6b36; }
  td:last-child { width: 9rem; }
  td small { display: block; color: #4a5c52; }
  .card footer { margin-top: .8rem; font-size: .8rem; color: #4a5c52; }
  @media print {
    body { background: #fff; } .bar { display: none; }
    .card { margin: 0; max-width: none; page-break-after: always; break-after: page; }
    @page { size: A4; margin: 12mm; }
  }
</style></head><body>
<div class="bar"><strong>${total} online line${total === 1 ? '' : 's'} on ${cards.length} card${cards.length === 1 ? '' : 's'}</strong>
<button type="button" id="print">Print cards</button><a href="${escapeHtml(csv)}">Download as spreadsheet (CSV)</a></div>
${cards.length ? cards.map(sheet).join('') : '<p class="empty">No online entries yet.</p>'}
<script src="/admin-print.js"></script>
</body></html>`;
}

module.exports = { createApp, renderCards };
