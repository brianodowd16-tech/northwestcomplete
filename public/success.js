import { startSnow } from './shared.js';

const $ = (s) => document.querySelector(s);
const SITE = { confirmUrl: null, ...window.FUEL_DRAW };
const params = new URLSearchParams(location.search);
const id = params.get('session_id');
const ref = params.get('ref');
const token = params.get('token');

startSnow($('#snow'));
load();

async function load() {
  if (ref) return SITE.confirmUrl && token ? checkOrder() : renderReserved();
  if (!id) return showPending();
  // The webhook can lag a second or two behind the redirect, so retry briefly.
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(`/api/order/${encodeURIComponent(id)}`);
      if (res.ok) return render(await res.json());
    } catch { /* network blip, retry */ }
    await new Promise((r) => setTimeout(r, 1200 + attempt * 400));
  }
  showPending();
}

// Orders taken on the Hostinger site: ask the server (which asks SumUp) whether it's paid. A card payment
// can take a moment to confirm, e.g. after a bank's 3-D Secure check, so unpaid card orders are re-checked.
async function checkOrder() {
  let order = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(SITE.confirmUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, token }) });
      if (res.ok) order = await res.json();
    } catch { /* network blip, retry */ }
    if (order && (order.status === 'paid' || order.payMode !== 'card')) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!order) return renderReserved();
  if (order.status === 'paid') return renderPaid(order);
  renderReserved(order.payMode === 'card'
    ? { ...order, instructions: 'Your card payment hasn’t come through. If you were charged, refresh this page in a minute. Otherwise, use “Add more lines” to try again, or the club will contact you about payment.' }
    : order);
}

function renderPaid(order) {
  render({ ...order, demo: false });
  $('#doneEyebrow').textContent = `Payment confirmed · Order ${order.ref}`;
  $('#doneTitle').textContent = order.firstName ? `You're in, ${order.firstName}!` : "You're in!";
  $('#doneLede').textContent = `Your lines are in the draw. We've emailed confirmation to ${order.email}. Keep it as your proof of entry.`;
}

// Pay-later orders: the order is saved and emailed, and the club collects payment.
function renderReserved(known) {
  let order = known ?? {};
  if (!known) {
    try { order = JSON.parse(sessionStorage.getItem('fuelDrawOrder') || '{}'); } catch { /* storage blocked */ }
    if (order.ref !== ref) order = { ref, lines: Number(params.get('lines')) || 0, amount: Number(params.get('amount')) || 0 };
  }
  render({ ...order, demo: false });
  $('#doneEyebrow').textContent = `Order ${ref} received`;
  $('#doneTitle').textContent = order.firstName ? `Nearly there, ${order.firstName}!` : 'Nearly there!';
  $('#doneLede').textContent = order.email
    ? `We've emailed your order to ${order.email} and to the club. Your lines go into the draw once you've paid.`
    : "We've emailed your order to you and to the club. Your lines go into the draw once you've paid.";
  $('#paid').textContent = `TO PAY ${(order.amount / 100).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' })}`;
  $('#lineWord').textContent = order.lines === 1 ? 'LINE RESERVED' : 'LINES RESERVED';
  $('#payText').textContent = order.instructions || 'The club will contact you shortly to take payment.';
  $('#payBox').hidden = false;
  if (!order.name) $('.receipt__name').hidden = true;
  if (!order.drawDate) $('.receipt__foot').hidden = true;
}

function render(order) {
  $('#loading').hidden = true;
  $('#result').hidden = false;
  if (order.firstName) $('#name').textContent = `, ${order.firstName}`;
  if (order.email) $('#email').textContent = order.email;
  if (order.name) $('#fullName').textContent = order.name;
  $('#paid').textContent = `PAID ${(order.amount / 100).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' })}`;
  $('#lineCount').textContent = order.lines;
  $('#lineWord').textContent = order.lines === 1 ? 'LINE ENTERED' : 'LINES ENTERED';
  const drawDate = new Date(order.drawDate);
  $('#drawDate').textContent = [
    drawDate.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'Europe/Dublin' }),
    drawDate.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: true, timeZone: 'Europe/Dublin' }).replace(/\s/g, ''),
    order.drawLocation,
  ].filter(Boolean).join(' · ').toUpperCase();
  $('#demoNote').hidden = !order.demo;

  // One fuel segment per line, lighting up in turn once the receipt has printed (capped so big orders stay tidy).
  const tank = $('#tank');
  const shown = Math.min(order.lines, 20);
  for (let i = 0; i < shown; i++) {
    const seg = document.createElement('span');
    seg.style.animationDelay = `${1.3 + i * 0.07}s`;
    tank.append(seg);
  }
  if (order.lines > shown) tank.dataset.more = `+${order.lines - shown}`;

  const url = location.origin;
  const text = `I just entered the St Michael's GAA & LGFA Super Fuel & Holiday Draw. 15 prizes including trips to Australia and New York. Lines from €5. Support the club: ${url}`;
  $('#shareWhatsapp').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  $('#shareFacebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  if (navigator.share) {
    const btn = $('#shareNative');
    btn.hidden = false;
    btn.addEventListener('click', () => navigator.share({ title: 'Super Fuel & Holiday Draw', text, url }).catch(() => {}));
  }
}

function showPending() {
  $('#loading').hidden = true;
  $('#pending').hidden = false;
  $('#ref').textContent = id || 'no reference';
}
