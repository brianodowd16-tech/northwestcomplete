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

if (!STRIPE_SECRET_KEY && NODE_ENV === 'production') {
  console.error('STRIPE_SECRET_KEY is required in production.');
  process.exit(1);
}

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const store = new OrderStore(DATA_FILE, { startNumber: config.ticketStartNumber });

const app = createApp({
  config, store, stripe,
  webhookSecret: STRIPE_WEBHOOK_SECRET,
  publicUrl: PUBLIC_URL.replace(/\/$/, ''),
  adminToken: ADMIN_TOKEN,
});

app.listen(PORT, () => {
  console.log(`Christmas Holiday & Fuel Draw running on ${PUBLIC_URL}${stripe ? '' : '  (DEMO MODE — no Stripe key, payments are simulated)'}`);
});
