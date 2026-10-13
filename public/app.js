import { euro, countdown, startSnow, observeReveals, setOdometer } from './shared.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = { draw: null, bundleId: null, qty: 1 };

init();

async function init() {
  startSnow($('#snow'));
  observeReveals();
  buildGaugeTicks();

  if (new URLSearchParams(location.search).has('cancelled')) {
    toast('No charge made. Your tickets are still waiting.');
    history.replaceState(null, '', location.pathname + location.hash);
  }

  try {
    const res = await fetch('/api/draw');
    state.draw = await res.json();
  } catch {
    toast('Couldn’t load the draw. Please refresh.');
    return;
  }

  const d = state.draw;
  state.bundleId = (d.bundles.find((b) => b.featured) ?? d.bundles[0]).id;

  bindText(d);
  renderPrizes(d.prizes);
  renderBundles(d.bundles);
  updateTotals();
  setGauge(d.ticketsSold, d.ticketTarget);
  countdown($('[data-countdown]'), d.salesCloseDate, () => closeSales());
  if (!d.salesOpen) closeSales();
  if (d.demoMode) toast('Demo mode: payments are simulated');

  $$('[data-step]').forEach((b) => b.addEventListener('click', () => setQty(state.qty + Number(b.dataset.step))));
  $('#checkoutBtn').addEventListener('click', checkout);
  $('#buybarBtn').addEventListener('click', () => {
    if ($('#tickets').getBoundingClientRect().top > innerHeight * .5) $('#tickets').scrollIntoView();
    else checkout();
  });
  setupBuybar();
}

function bindText(d) {
  const drawDate = new Date(d.drawDate);
  const values = {
    ...d,
    fromPrice: euro(Math.min(...d.bundles.map((b) => b.price)), { trim: true }),
    ticketTarget: d.ticketTarget.toLocaleString('en-IE'),
    drawDateShort: drawDate.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Dublin' }),
    drawDateLong: `${drawDate.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Dublin' })} at ${drawDate.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: true, timeZone: 'Europe/Dublin' }).replace(/\s/g, '')}`,
  };
  $$('[data-bind]').forEach((el) => { if (values[el.dataset.bind] != null) el.textContent = values[el.dataset.bind]; });
  $$('[data-href]').forEach((el) => {
    const v = d[el.dataset.href];
    if (v) el.href = v.includes('@') ? `mailto:${v}` : v;
  });
}

const KIND_LABEL = { holiday: 'Holiday', fuel: 'Fuel', home: 'Home' };

function renderPrizes(prizes) {
  const top = prizes.slice(0, 3);
  const rest = prizes.slice(3);
  $('#prizeList').innerHTML = top.map((p, i) => `
    <article class="prize prize--${esc(p.kind)} reveal" style="transition-delay:${i * 90}ms">
      <span class="prize__badge">${esc(KIND_LABEL[p.kind] ?? 'Prize')}</span>
      <div>
        <div class="prize__place">${esc(p.place)}</div>
        <h3 class="prize__title">${esc(p.title)}</h3>
        ${p.detail ? `<p class="prize__detail">${esc(p.detail)}</p>` : ''}
        ${p.value ? `<p class="prize__value">${esc(p.value)}</p>` : ''}
        ${p.sponsor ? `<p class="prize__sponsor">Sponsored by ${esc(p.sponsor)}</p>` : ''}
      </div>
    </article>`).join('');

  const board = $('#prizeBoard');
  board.style.setProperty('--rows', Math.ceil(rest.length / 2));
  board.innerHTML = rest.map((p) => `
    <li class="board__row">
      <span class="board__place">${esc(p.place)}</span>
      <span class="board__prize">
        <strong>${esc(p.title)}</strong>
        ${p.detail ? `<span>${esc(p.detail)}</span>` : ''}
        <small>${p.sponsor ? `Sponsored by ${esc(p.sponsor)}` : 'Provided by the venue'}</small>
      </span>
      <span class="board__meta">
        ${p.value ? `<span class="board__value">${esc(p.value)}</span>` : ''}
        <span class="board__kind board__kind--${esc(p.kind)}">${esc(KIND_LABEL[p.kind] ?? '')}</span>
      </span>
    </li>`).join('');
  observeReveals();
}

function renderBundles(bundles) {
  const wrap = $('#bundles');
  wrap.innerHTML = bundles.map((b) => `
    <button type="button" class="bundle ${b.featured ? 'bundle--featured' : ''}" role="radio" data-id="${b.id}" aria-checked="false">
      <span class="bundle__check" aria-hidden="true">✓</span>
      <span class="bundle__top">
        <span class="bundle__name">${esc(b.label)}</span>
        ${b.tag ? `<span class="bundle__tag">${esc(b.tag)}</span>` : ''}
      </span>
      <span class="bundle__tickets"><strong>${b.tickets}</strong><span>ticket${b.tickets > 1 ? 's' : ''}</span></span>
      <span class="bundle__bottom">
        <span class="bundle__price">${euro(b.price)}</span>
        <span class="bundle__per">${euro(b.price / b.tickets)} each</span>
      </span>
    </button>`).join('');

  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.bundle');
    if (btn) selectBundle(btn.dataset.id);
  });
  // Arrow-key navigation, as expected for a radiogroup
  wrap.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = bundles.findIndex((b) => b.id === state.bundleId);
    const next = bundles[(i + dir + bundles.length) % bundles.length];
    selectBundle(next.id);
    $(`.bundle[data-id="${next.id}"]`).focus();
  });
  selectBundle(state.bundleId);
}

function selectBundle(id) {
  state.bundleId = id;
  $$('.bundle').forEach((el) => {
    const on = el.dataset.id === id;
    el.setAttribute('aria-checked', on);
    el.tabIndex = on ? 0 : -1;
  });
  setQty(1);
}

function setQty(n) {
  state.qty = Math.max(1, Math.min(state.draw.maxBundlesPerOrder, n));
  $('#qty').textContent = state.qty;
  updateTotals();
}

function currentBundle() {
  return state.draw.bundles.find((b) => b.id === state.bundleId);
}

function updateTotals() {
  const b = currentBundle();
  const total = b.price * state.qty;
  const tickets = b.tickets * state.qty;
  rollNumber($('#totalEuro'), total / 100, 2);
  rollNumber($('#totalTickets'), tickets, 0);
  rollNumber($('#perTicket'), total / tickets / 100, 2);
  $('#checkoutLabel').textContent = `Fill up · Pay ${euro(total)}`;
  $('#buybarLabel').textContent = b.label;
  $('#buybarMeta').textContent = `${tickets} ticket${tickets > 1 ? 's' : ''}`;
  $('#buybarTotal').textContent = euro(total);
}

// Pump-style rolling numbers
function rollNumber(el, to, decimals) {
  cancelAnimationFrame(el._raf);
  const from = Number.parseFloat(el.textContent) || 0;
  const start = performance.now();
  const dur = matchMedia('(prefers-reduced-motion: reduce)').matches || from === to ? 0 : 500;
  const tick = (now) => {
    const t = dur ? Math.min(1, (now - start) / dur) : 1;
    const eased = 1 - (1 - t) ** 3;
    el.textContent = (from + (to - from) * eased).toFixed(decimals);
    if (t < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

function buildGaugeTicks() {
  const g = $('#gaugeTicks');
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI - (i / 20) * Math.PI;
    const major = i % 5 === 0;
    const r1 = 108, r2 = major ? 92 : 99;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 160 + r1 * Math.cos(a)); line.setAttribute('y1', 170 - r1 * Math.sin(a));
    line.setAttribute('x2', 160 + r2 * Math.cos(a)); line.setAttribute('y2', 170 - r2 * Math.sin(a));
    if (major) line.classList.add('major');
    g.append(line);
  }
}

function setGauge(sold, target) {
  const pct = Math.max(0, Math.min(1, sold / target));
  // Never sit fully on E: a sliver of fuel reads better than an empty tank.
  const shown = Math.max(pct, .04);
  const gauge = $('.gauge');
  const go = () => {
    $('.gauge__fill').style.strokeDasharray = `${shown * 100} 100`;
    $('#needle').style.transform = `rotate(${-90 + shown * 180}deg)`;
    setOdometer($('[data-odometer]'), sold);
    $('[data-bind="pct"]').textContent = `${Math.round(pct * 100)}%`;
  };
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { setTimeout(go, 350); obs.disconnect(); }
  }, { threshold: .4 }).observe(gauge);
}

async function checkout() {
  const btn = $('#checkoutBtn');
  const err = $('#checkoutError');
  err.hidden = true;
  btn.disabled = true; $('#buybarBtn').disabled = true;
  $('#checkoutLabel').textContent = 'Opening secure checkout…';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundleId: state.bundleId, quantity: state.qty }),
    });
    const body = await res.json();
    if (!res.ok || !body.url) throw new Error(body.error || 'Checkout failed');
    location.assign(body.url);
  } catch (e) {
    err.textContent = e.message || 'Something went wrong. Please try again.';
    err.hidden = false;
    btn.disabled = false; $('#buybarBtn').disabled = false;
    updateTotals();
  }
}

function closeSales() {
  $$('#checkoutBtn, #buybarBtn').forEach((b) => { b.disabled = true; });
  $('#checkoutLabel').textContent = 'Sales closed';
  $('#buybarTotal').textContent = 'closed';
  $('[data-countdown]').textContent = 'now closed';
}

function setupBuybar() {
  const bar = $('#buybar');
  const hero = $('.hero__cta');
  const pump = $('.pump__display');
  let pastHero = false, pumpVisible = false;
  const sync = () => {
    const show = pastHero && !pumpVisible;
    bar.classList.toggle('is-visible', show);
    bar.setAttribute('aria-hidden', String(!show));
  };
  new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; sync(); }).observe(hero);
  new IntersectionObserver(([e]) => { pumpVisible = e.isIntersecting; sync(); }, { threshold: .2 }).observe(pump);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 4200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
