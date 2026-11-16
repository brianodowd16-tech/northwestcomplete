'use strict';

// Wording for the Hostinger build, which takes orders through its own order form instead of Stripe:
// - "card": buyers pay by card with SumUp on the order form;
// - "later": card payments are off, buyers order and pay the club.
// Each replacement must match, so a wording change in the pages is caught at build time rather than shipped stale.

const SHARED = [
  ['<p>Yes. At checkout there\'s an optional box', '<p>Yes. On the order form there\'s an optional box'],
];

const PAGES = {
  later: {
    'index.html': [
      ...SHARED,
      ['>Secure Stripe checkout</li>', '>Order in under a minute</li>'],
      ['>Card, Apple Pay &amp; Google Pay</li>', '>Pay the club directly</li>'],
      ['>Entered in your name instantly</li>', '>Entered in your name once paid</li>'],
      ['Payments processed securely by Stripe. Over 18s only.', 'Order online, then pay the club. Over 18s only.'],
      ['<h3>Pay securely</h3><p>Check out with card, Apple Pay or Google Pay through Stripe.</p>',
        '<h3>Order online</h3><p>Leave your name and number. The club gets in touch to take payment.</p>'],
      ['<h3>You\'re entered</h3><p>Your lines go in under your name straight away, and your receipt comes by email.</p>',
        '<h3>You\'re entered</h3><p>Once you\'ve paid, your lines go into the draw under your name.</p>'],
      ['<p>You\'ll see a confirmation as soon as your payment goes through, and Stripe emails you a receipt. Keep it as your proof of entry.',
        '<p>After you order you\'ll get an email with your order reference. Once you\'ve paid, the club marks your order paid and your lines are entered.'],
      ['<summary>Is paying online safe?</summary><p>Yes. Payment is handled by Stripe, and your card details never touch our website. You can pay by card, Apple Pay or Google Pay.</p>',
        '<summary>How do I pay?</summary><p>Order online and the club will contact you to take payment. Your order email also says how to pay. No card details are taken on this website.</p>'],
    ],
  },
  card: {
    'index.html': [
      ...SHARED,
      ['>Secure Stripe checkout</li>', '>Secure card payment by SumUp</li>'],
      ['>Card, Apple Pay &amp; Google Pay</li>', '>All major cards accepted</li>'],
      ['Payments processed securely by Stripe. Over 18s only.', 'Card payments processed securely by SumUp. Over 18s only.'],
      ['<h3>Pay securely</h3><p>Check out with card, Apple Pay or Google Pay through Stripe.</p>',
        '<h3>Pay securely</h3><p>Pay by card with SumUp, right here on the page.</p>'],
      ['<h3>You\'re entered</h3><p>Your lines go in under your name straight away, and your receipt comes by email.</p>',
        '<h3>You\'re entered</h3><p>Your lines go in under your name straight away, and your confirmation comes by email.</p>'],
      ['<p>You\'ll see a confirmation as soon as your payment goes through, and Stripe emails you a receipt. Keep it as your proof of entry.',
        '<p>You\'ll see a confirmation as soon as your payment goes through, and we email you a confirmation too. Keep it as your proof of entry.'],
      ['Payment is handled by Stripe, and your card details never touch our website. You can pay by card, Apple Pay or Google Pay.',
        'Card payments are handled by SumUp, and your card details never touch our website.'],
      ['<p class="order__note">Fill in your details and the club will contact you to take payment. Your lines go into the draw once you\'ve paid.</p>',
        '<p class="order__note">Fill in your details, then pay by card on the next step. Your lines go into the draw as soon as it\'s through.</p>'],
    ],
  },
  // One set of terms covers both, since card payments can be switched on and off in config.php.
  terms: {
    'terms.html': [
      ['Your Stripe receipt is your proof of entry.', 'Lines are entered once payment is received, and your confirmation email is your proof of entry.'],
      ['Payments are processed by Stripe.', 'Card payments are processed by SumUp. Orders not paid by card are paid to the Club directly.'],
    ],
  },
};

function applyPaymentCopy(mode, file, html) {
  let out = html;
  for (const [from, to] of PAGES[mode]?.[file] ?? []) {
    if (!out.includes(from)) throw new Error(`payment copy (${mode}): "${from.slice(0, 60)}…" not found in ${file}`);
    out = out.replace(from, to);
  }
  return out;
}

// Kept for the preview build, which shows the pay-the-club flow.
const applyPayLaterCopy = (file, html) => applyPaymentCopy(file === 'terms.html' ? 'terms' : 'later', file, html);

module.exports = { applyPaymentCopy, applyPayLaterCopy };
