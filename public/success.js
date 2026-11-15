import { startSnow } from './shared.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const id = params.get('session_id');
const ref = params.get('ref');

startSnow($('#snow'));
load();

async function load() {
  if (ref) return renderReserved();
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

// Pay-later orders: the order is saved and emailed, and the club collects payment.
function renderReserved() {
  let order = {};
  try { order = JSON.parse(sessionStorage.getItem('fuelDrawOrder') || '{}'); } catch { /* storage blocked */ }
  if (order.ref !== ref) order = { ref, lines: Number(params.get('lines')) || 0, amount: Number(params.get('amount')) || 0 };
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
