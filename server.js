'use strict';

require('dotenv').config({ quiet: true });

const Stripe = require('stripe');
const config = require('./config/draw.json');
const { OrderStore } = require('./src/store');
const { createApp } = require('./src/app');

const {
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ADMIN_TOKEN,
  PORT = 3000, PUBLIC_URL = `http://localhost:${PORT}`, DATA_FILE = './data/orders.json', NODE_ENV,
} = process.env;

if (NODE_ENV === 'production') {
  const problems = [
    !STRIPE_SECRET_KEY && 'STRIPE_SECRET_KEY is not set',
    !STRIPE_WEBHOOK_SECRET && 'STRIPE_WEBHOOK_SECRET is not set (paid orders would not get ticket numbers reliably)',
    (!ADMIN_TOKEN || ADMIN_TOKEN.length < 24) && 'ADMIN_TOKEN must be at least 24 characters',
    !PUBLIC_URL.startsWith('https://') && 'PUBLIC_URL must be the site\'s https:// address',
  ].filter(Boolean);
  if (problems.length) {
    console.error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  if (STRIPE_SECRET_KEY.startsWith('sk_test_')) console.warn('Warning: using a Stripe TEST key. No real payments will be taken.');
}

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const store = new OrderStore(DATA_FILE, { linesPerCard: config.linesPerCard });

const app = createApp({
  config, store, stripe,
  webhookSecret: STRIPE_WEBHOOK_SECRET,
  publicUrl: PUBLIC_URL.replace(/\/$/, ''),
  adminToken: ADMIN_TOKEN,
});

app.listen(PORT, () => {
  console.log(`Super Fuel & Holiday Draw running on ${PUBLIC_URL}${stripe ? '' : '  (DEMO MODE — no Stripe key, payments are simulated)'}`);
});
