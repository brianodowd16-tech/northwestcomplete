'use strict';

// Wording for "order now, pay the club" mode, used until online card payment (Stripe or SumUp) is switched on.
// Each replacement must match, so a wording change in the pages is caught at build time rather than shipped stale.

const PAGES = {
  'index.html': [
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
    ['<p>Yes. At checkout there\'s an optional box', '<p>Yes. On the order form there\'s an optional box'],
  ],
  'terms.html': [
    ['Your Stripe receipt is your proof of entry.', 'Lines are entered once the Club has received payment, and the order email is your record of entry.'],
    ['Payments are processed by Stripe.', 'Orders placed online are paid to the Club directly.'],
  ],
};

function applyPayLaterCopy(file, html) {
  let out = html;
  for (const [from, to] of PAGES[file] ?? []) {
    if (!out.includes(from)) throw new Error(`pay-later copy: "${from.slice(0, 60)}…" not found in ${file}`);
    out = out.replace(from, to);
  }
  return out;
}

module.exports = { applyPayLaterCopy };
