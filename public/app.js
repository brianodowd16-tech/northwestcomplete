import { euro, countdown, startSnow, observeReveals } from './shared.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// How this copy of the site takes orders. The Node server uses Stripe; the Hostinger
// build sets window.FUEL_DRAW to take orders that the club collects payment for.
const SITE = { drawUrl: '/api/draw', checkoutUrl: '/api/checkout', orderUrl: '/order.php', confirmUrl: null, mode: 'stripe', ...window.FUEL_DRAW };
const SUMUP_SDK = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';
const PAY_LATER = SITE.mode === 'pay-later';
// The Hostinger build takes orders on its own form, paid by card (SumUp) or to the club.
const ORDER_FORM = PAY_LATER || SITE.mode === 'card';
const CTA = PAY_LATER ? 'Fill up · Order' : 'Fill up · Pay';
const navigate = (url) => location.assign(url);

const state = { draw: null, bundleId: null, qty: 1, gaugeReady: false };

init();

async function init() {
  startSnow($('#snow'));
  observeReveals();
  buildGaugeTicks();

  if (new URLSearchParams(location.search).has('cancelled')) {
    toast('No charge made. Your lines are still waiting.');
    history.replaceState(null, '', location.pathname + location.hash);
  }

  try {
    const res = await fetch(SITE.drawUrl);
    state.draw = await res.json();
  } catch {
    toast('Couldn’t load the draw. Please refresh.');
    return;
  }

  const d = state.draw;
  state.bundleId = (d.bundles.find((b) => b.featured) ?? d.bundles[0]).id;

  bindText(d);
  renderPrizes(d.prizes);
  renderFills(d.bundles);
  renderBundles(d.bundles);
  startGauge();
  countdown($('[data-countdown]'), d.salesCloseDate, () => closeSales());
  if (!d.salesOpen) closeSales();
  if (d.demoMode) toast('Demo mode: payments are simulated');

  $$('[data-step]').forEach((b) => b.addEventListener('click', () => setQty(state.qty + Number(b.dataset.step))));
  $('#checkoutBtn').addEventListener('click', checkout);
  $('#gaugeCta').addEventListener('click', checkout);
  if (ORDER_FORM) setupOrderForm();
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
    drawDateShort: drawDate.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Dublin' }),
    drawDateLong: `${drawDate.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Dublin' })} at ${drawDate.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: true, timeZone: 'Europe/Dublin' }).replace(/\s/g, '')}`,
  };
  $$('[data-bind]').forEach((el) => { if (values[el.dataset.bind] != null) el.textContent = values[el.dataset.bind]; });
  $$('[data-href]').forEach((el) => {
    const v = d[el.dataset.href];
    if (v) el.href = v.includes('@') ? `mailto:${v}` : v;
  });
}

const KIND_LABEL = { holiday: 'Holiday', fuel: 'Fuel', home: 'Home', event: 'Event' };

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
  const card = (b) => `
    <button type="button" class="bundle ${b.featured ? 'bundle--featured' : ''} ${b.group === 'big' ? 'bundle--big' : ''}" role="radio" data-id="${b.id}" aria-checked="false">
      <span class="bundle__check" aria-hidden="true">✓</span>
      <span class="bundle__top">
        <span class="bundle__name">${esc(b.label)}</span>
        ${b.tag ? `<span class="bundle__tag">${esc(b.tag)}</span>` : ''}
      </span>
      <span class="bundle__tickets"><strong>${b.lines}</strong><span>line${b.lines > 1 ? 's' : ''}</span></span>
      <span class="bundle__bottom">
        <span class="bundle__price">${euro(b.price, { trim: true })}</span>
        <span class="bundle__per">${euro(b.price / b.lines)} each</span>
      </span>
    </button>`;
  const big = bundles.filter((b) => b.group === 'big');
  wrap.innerHTML = bundles.filter((b) => b.group !== 'big').map(card).join('')
    + (big.length ? `<div class="bundles__big"><p class="bundles__bighead">Go big for the club</p>${big.map(card).join('')}</div>` : '');

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

// The quick-fill buttons under the hero gauge: the same bundles, one tap each.
function renderFills(bundles) {
  const wrap = $('#fills');
  wrap.innerHTML = bundles.map((b) => `
    <button type="button" class="fill" role="radio" data-id="${b.id}" aria-checked="false"
      aria-label="${b.lines} line${b.lines > 1 ? 's' : ''} for ${euro(b.price, { trim: true })}">
      <strong>${euro(b.price, { trim: true })}</strong><span>${b.lines} line${b.lines > 1 ? 's' : ''}</span>
    </button>`).join('');
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.fill');
    if (btn) selectBundle(btn.dataset.id);
  });
  wrap.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = bundles.findIndex((b) => b.id === state.bundleId);
    const next = bundles[(i + dir + bundles.length) % bundles.length];
    selectBundle(next.id);
    $(`.fill[data-id="${next.id}"]`).focus();
  });
}

function selectBundle(id) {
  state.bundleId = id;
  $$('.bundle, .fill').forEach((el) => {
    const on = el.dataset.id === id;
    el.setAttribute('aria-checked', on);
    el.tabIndex = on ? 0 : -1;
  });
  setQty(1);
}

function setQty(n) {
  const { maxBundlesPerOrder, maxOrderTotal } = state.draw;
  const price = currentBundle().price;
  const max = Math.max(1, Math.min(maxBundlesPerOrder, maxOrderTotal ? Math.floor(maxOrderTotal / price) : Infinity));
  state.qty = Math.max(1, Math.min(max, n));
  $('#qty').textContent = state.qty;
  $('[data-step="1"]').disabled = state.qty >= max;
  $('[data-step="-1"]').disabled = state.qty <= 1;
  updateTotals();
}

function currentBundle() {
  return state.draw.bundles.find((b) => b.id === state.bundleId);
}

function updateTotals() {
  const b = currentBundle();
  const total = b.price * state.qty;
  const lines = b.lines * state.qty;
  rollNumber($('#totalEuro'), total / 100, 2);
  rollNumber($('#totalTickets'), lines, 0);
  rollNumber($('#perTicket'), total / lines / 100, 2);
  $('#checkoutLabel').textContent = `${CTA} ${euro(total)}`;
  $('#gaugeCtaLabel').textContent = `${CTA} ${euro(total)}`;
  $('#buybarLabel').textContent = b.label;
  $('#buybarMeta').textContent = `${lines} line${lines > 1 ? 's' : ''}`;
  $('#buybarTotal').textContent = euro(total);
  setTank(lines);
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

// The hero gauge shows the visitor's own fill: the biggest bundle fills the tank to F.
function setTank(lines) {
  rollNumber($('#gaugeLines'), lines, 0);
  $('#gaugeUnit').textContent = lines === 1 ? 'LINE' : 'LINES';
  if (!state.gaugeReady) return;
  const full = state.draw.fullTankLines ?? Math.max(...state.draw.bundles.map((b) => b.lines));
  pointGauge(Math.min(1, lines / full));
}

function pointGauge(fraction) {
  // Never sit fully on E: a sliver of fuel reads better than an empty tank.
  const shown = Math.max(fraction, .04);
  $('.gauge__fill').style.strokeDasharray = `${shown * 100} 100`;
  $('#needle').style.transform = `rotate(${-90 + shown * 180}deg)`;
  $('.gauge').classList.toggle('is-full', fraction >= 1);
}

// When the gauge first comes into view it does a "fuel check": sweep to F, then settle on the current fill.
function startGauge() {
  new IntersectionObserver((entries, obs) => {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    setTimeout(() => pointGauge(1), 300);
    setTimeout(() => { state.gaugeReady = true; updateTotals(); }, 1500);
  }, { threshold: .4 }).observe($('.gauge'));
}

async function checkout() {
  if (ORDER_FORM) return openOrderForm();
  const err = $('#checkoutError');
  err.hidden = true;
  $$('#checkoutBtn, #buybarBtn, #gaugeCta').forEach((b) => { b.disabled = true; });
  $('#checkoutLabel').textContent = 'Opening secure checkout…';
  $('#gaugeCtaLabel').textContent = 'Opening secure checkout…';
  try {
    const res = await fetch(SITE.checkoutUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundleId: state.bundleId, quantity: state.qty }),
    });
    const body = await res.json().catch(() => ({ error: 'We couldn’t start checkout. Please refresh the page and try again.' }));
    if (!res.ok || !body.url) throw new Error(body.error || 'Checkout failed');
    navigate(body.url);
  } catch (e) {
    err.textContent = e.message || 'Something went wrong. Please try again.';
    err.hidden = false;
    $$('#checkoutBtn, #buybarBtn, #gaugeCta').forEach((b) => { b.disabled = false; });
    updateTotals();
    toast(err.textContent);
  }
}

// Pay-later ordering: collect the buyer's details, save the order and email it to the club.
function openOrderForm() {
  const b = currentBundle();
  const lines = b.lines * state.qty;
  const total = euro(b.price * state.qty);
  $('#orderTitle').textContent = `${lines} line${lines > 1 ? 's' : ''} · ${total}`;
  $('#orderSubmit').textContent = `Place order · ${total}`;
  $('#orderError').hidden = true;
  // Start each order on the details step (a closed card step leaves an unpaid order the club can follow up).
  $('#orderForm').hidden = false;
  $('#cardStep').hidden = true;
  $('#sumup-card').replaceChildren();
  $('#orderSubmit').disabled = false;
  const dialog = $('#orderDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  $('#oName').focus();
}

function setupOrderForm() {
  const dialog = $('#orderDialog');
  const form = $('#orderForm');
  const close = () => (dialog.close ? dialog.close() : dialog.removeAttribute('open'));
  $('#orderClose').addEventListener('click', close);
  $('#cardClose').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#orderError');
    err.hidden = true;
    if (!form.reportValidity()) return;
    const submit = $('#orderSubmit');
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Placing your order…';
    const data = Object.fromEntries(new FormData(form));
    try {
      const res = await fetch(SITE.orderUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, adult: data.adult === 'on', bundleId: state.bundleId, quantity: state.qty }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ref) throw new Error(body.error || 'We couldn’t place your order. Please try again.');
      try { sessionStorage.setItem('fuelDrawOrder', JSON.stringify(body)); } catch { /* storage blocked: the URL carries the essentials */ }
      const done = `/success.html?${new URLSearchParams({ ref: body.ref, token: body.token ?? '', lines: body.lines, amount: body.amount })}`;
      if (body.checkoutId) return showCardStep(body, done);
      navigate(done);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}

// Card payment with SumUp's card widget, as in SumUp's own WooCommerce plugin.
function loadSumUp() {
  if (window.SumUpCard) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SUMUP_SDK;
    s.onload = () => (window.SumUpCard ? resolve() : reject(new Error('SumUp did not load')));
    s.onerror = reject;
    document.head.append(s);
  });
}

function showCardStep(order, doneUrl) {
  $('#orderForm').hidden = true;
  $('#cardStep').hidden = false;
  $('#cardRef').textContent = order.ref;
  $('#cardTitle').textContent = `Pay ${euro(order.amount)} by card`;
  const err = $('#cardError');
  const status = $('#cardStatus');
  err.hidden = true;
  status.hidden = true;
  loadSumUp().then(() => {
    window.SumUpCard.mount({
      id: 'sumup-card',
      checkoutId: order.checkoutId,
      email: order.email,
      locale: 'en-IE',
      showAmount: true,
      showFooter: true,
      onResponse: async (type, body) => {
        if (type === 'success' && body?.status !== 'FAILED') {
          err.hidden = true;
          status.hidden = false;
          await confirmPayment(order);
          navigate(doneUrl);
        } else if (type === 'success' || type === 'fail' || type === 'error' || type === 'invalid') {
          err.textContent = body?.message || 'The payment didn’t go through. Check your card details and try again.';
          err.hidden = false;
        }
      },
    });
  }).catch(() => {
    err.textContent = 'The card form couldn’t load. Your order is saved, and the club will be in touch about payment.';
    err.hidden = false;
    setTimeout(() => navigate(doneUrl), 2500);
  });
}

// SumUp's widget says the card was charged; the server checks with SumUp before the order counts as paid.
async function confirmPayment(order) {
  if (!SITE.confirmUrl) return;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(SITE.confirmUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: order.ref, token: order.token }) });
      if (res.ok && (await res.json()).status === 'paid') return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

function closeSales() {
  $$('#checkoutBtn, #buybarBtn, #gaugeCta').forEach((b) => { b.disabled = true; });
  $('#checkoutLabel').textContent = 'Entries closed';
  $('#gaugeCtaLabel').textContent = 'Entries closed';
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
