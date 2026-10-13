'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');

/**
 * Builds the Express app. `stripe` may be null, in which case the site runs in
 * demo mode: checkout skips payment and issues test tickets immediately.
 */
function createApp({ config, store, stripe, webhookSecret, publicUrl, adminToken, demoMode = !stripe }) {
  const app = express();
  app.disable('x-powered-by');

  const ticketsForSession = (session) => Number.parseInt(session.metadata?.ticketCount, 10);

  async function fulfilSession(session) {
    if (session.payment_status !== 'paid') return null;
    const field = (key) => session.custom_fields?.find((f) => f.key === key)?.text?.value?.trim() || null;
    return store.fulfil({
      id: session.id,
      ticketCount: ticketsForSession(session),
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
    const { clubName, clubShort, clubArea, drawName, currency, drawDate, drawLocation, salesCloseDate,
      ticketTarget, ticketsSoldOffset, facebookUrl, contactEmail, licenceNote, bundles, prizes, maxBundlesPerOrder } = config;
    res.json({
      clubName, clubShort, clubArea, drawName, currency, drawDate, drawLocation, salesCloseDate, ticketTarget,
      facebookUrl, contactEmail, licenceNote, bundles, prizes, maxBundlesPerOrder,
      ticketsSold: store.ticketsSold() + (ticketsSoldOffset || 0),
      salesOpen: Date.now() < Date.parse(salesCloseDate),
      demoMode,
    });
  });

  app.post('/api/checkout', async (req, res) => {
    const bundle = config.bundles.find((b) => b.id === req.body?.bundleId);
    const quantity = Number.parseInt(req.body?.quantity ?? 1, 10);
    if (!bundle) return res.status(400).json({ error: 'Please choose a ticket option.' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > config.maxBundlesPerOrder) {
      return res.status(400).json({ error: `Quantity must be between 1 and ${config.maxBundlesPerOrder}.` });
    }
    if (Date.now() >= Date.parse(config.salesCloseDate)) {
      return res.status(410).json({ error: 'Ticket sales for this draw have closed.' });
    }

    const ticketCount = bundle.tickets * quantity;

    if (demoMode) {
      const id = `demo_${crypto.randomUUID()}`;
      await store.fulfil({
        id, ticketCount, amount: bundle.price * quantity, currency: config.currency, bundleId: bundle.id,
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
              description: `${bundle.tickets} ticket${bundle.tickets > 1 ? 's' : ''} in the ${config.clubName} ${config.drawName}`,
            },
          },
        }],
        custom_fields: [
          { key: 'fullname', label: { type: 'custom', custom: 'Full name (for the draw)' }, type: 'text' },
          { key: 'soldby', label: { type: 'custom', custom: 'Club member who sent you (optional)' }, type: 'text', optional: true },
        ],
        phone_number_collection: { enabled: true },
        payment_intent_data: { description: `${config.drawName}: ${ticketCount} ticket(s)` },
        metadata: { bundleId: bundle.id, quantity: String(quantity), ticketCount: String(ticketCount) },
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
    res.json({
      tickets: order.tickets,
      firstName: order.customer.name?.split(/\s+/)[0] ?? null,
      email: order.customer.email,
      amount: order.amount,
      currency: order.currency,
      drawDate: config.drawDate,
      demo: id.startsWith('demo_'),
    });
  });

  const requireAdmin = (req, res, next) => {
    const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.token || '';
    const ok = adminToken && supplied.length === adminToken.length
      && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(adminToken));
    return ok ? next() : res.status(401).json({ error: 'Unauthorised' });
  };

  // One row per ticket: the file to run the draw from.
  app.get('/api/admin/tickets.csv', requireAdmin, (_req, res) => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['ticket', 'name', 'email', 'phone', 'sold_by', 'order_id', 'purchased_at'].join(',')];
    for (const o of store.all()) {
      for (const t of o.tickets) {
        rows.push([t, o.customer.name, o.customer.email, o.customer.phone, o.soldBy, o.id, o.createdAt].map(esc).join(','));
      }
    }
    res.type('text/csv').attachment('fuel-draw-tickets.csv').send(rows.join('\n'));
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  return app;
}

module.exports = { createApp };
