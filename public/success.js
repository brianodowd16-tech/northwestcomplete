import { startSnow } from './shared.js';

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get('session_id');

startSnow($('#snow'));
load();

async function load() {
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

function render(order) {
  $('#loading').hidden = true;
  $('#result').hidden = false;
  if (order.firstName) $('#name').textContent = `, ${order.firstName}`;
  if (order.email) $('#email').textContent = order.email;
  $('#count').textContent = `${order.tickets.length} TICKET${order.tickets.length > 1 ? 'S' : ''}`;
  $('#drawDate').textContent = new Date(order.drawDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  $('#demoNote').hidden = !order.demo;

  const list = $('#ticketList');
  order.tickets.forEach((n, i) => {
    const li = document.createElement('li');
    li.textContent = n;
    li.style.animationDelay = `${1.2 + Math.min(i, 30) * 0.06}s`;
    list.append(li);
  });

  const url = location.origin;
  const text = `I just entered the St Michael's GAA & LGFA Christmas Holiday & Fuel Draw. 16 prizes including a trip to Australia. Support the club: ${url}`;
  $('#shareWhatsapp').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  $('#shareFacebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  if (navigator.share) {
    const btn = $('#shareNative');
    btn.hidden = false;
    btn.addEventListener('click', () => navigator.share({ title: 'Christmas Holiday & Fuel Draw', text, url }).catch(() => {}));
  }
}

function showPending() {
  $('#loading').hidden = true;
  $('#pending').hidden = false;
  $('#ref').textContent = id || 'no reference';
}
