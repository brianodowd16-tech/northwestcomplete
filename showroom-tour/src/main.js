import { Viewer } from '@photo-sphere-viewer/core';
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import '@photo-sphere-viewer/virtual-tour-plugin/index.css';
import './style.css';

import { createCart } from './cart.js';
import { checkout } from './checkout.js';
import { indexNodes, indexProducts, linkYaw } from './tour-model.js';

const params = new URLSearchParams(location.search);
const tourId = /^[\w-]+$/.test(params.get('tour') ?? '') ? params.get('tour') : 'odowds';
const editMode = params.has('edit');
const base = `${import.meta.env.BASE_URL}tours/${tourId}/`;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const asset = (p) => (!p ? '' : /^((https?:)?\/\/|data:|blob:)/.test(p) ? p : base + p);

async function loadJson(file) {
  const res = await fetch(base + file, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
  return res.json();
}

const [savedTour, catalog] = await Promise.all([loadJson('tour.json'), loadJson('products.json')]);

const app = {
  tour: savedTour,
  catalog,
  products: indexProducts(catalog),
  nodesById: indexNodes(savedTour),
  editMode,
  base,
  asset,
  esc,
};

if (editMode) {
  const { loadDraft } = await import('./editor.js');
  app.tour = loadDraft(tourId) ?? savedTour;
  app.nodesById = indexNodes(app.tour);
}

const money = new Intl.NumberFormat(catalog.locale ?? 'en-IE', { style: 'currency', currency: catalog.currency ?? 'EUR' });
app.money = (n) => money.format(n);

// ---------- tour -> Photo Sphere Viewer nodes ----------

function floorName(id) {
  return app.tour.floors?.find((f) => f.id === id)?.name ?? '';
}

function hotspotMarker(node, h, i) {
  const p = app.products.get(h.sku);
  if (!p) return null;
  return {
    id: `hs:${node.id}:${i}`,
    position: { yaw: `${h.yaw}deg`, pitch: `${h.pitch}deg` },
    html: `<div class="hotspot${p.inStock === false ? ' is-out' : ''}"><span class="hs-dot"></span><span class="hs-tag">${esc(app.money(p.price))}</span></div>`,
    anchor: 'center center',
    tooltip: { content: `<strong>${esc(p.name)}</strong><br>${esc(app.money(p.price))}`, position: 'top center' },
    data: { sku: h.sku, nodeId: node.id, index: i },
  };
}

function nodeLinksAndMarkers(node) {
  return {
    links: (node.links ?? [])
      .map((l) => ({ l, yaw: linkYaw(node, l, app.nodesById) }))
      .filter(({ yaw }) => yaw !== null)
      .map(({ l, yaw }) => ({ nodeId: l.nodeId, position: { yaw: `${yaw}deg`, pitch: 0 } })),
    markers: (node.hotspots ?? []).map((h, i) => hotspotMarker(node, h, i)).filter(Boolean),
  };
}

function toPsvNode(node) {
  return {
    id: node.id,
    name: node.name,
    caption: [floorName(node.floor), node.name].filter(Boolean).join(' · '),
    panorama: asset(node.panorama),
    thumbnail: asset(node.thumbnail) || undefined,
    sphereCorrection: node.sphereCorrection
      ? Object.fromEntries(Object.entries(node.sphereCorrection).map(([k, v]) => [k, `${v}deg`]))
      : undefined,
    ...nodeLinksAndMarkers(node),
    data: { floor: node.floor },
  };
}

// Re-applies links and hotspots after the editor changes the tour.
app.refreshNodes = () => {
  app.nodesById = indexNodes(app.tour);
  for (const node of app.tour.nodes) app.vt.updateNode({ id: node.id, ...nodeLinksAndMarkers(node) });
  renderPlan();
  renderRoomBar();
};

// ---------- viewer ----------

const requested = params.get('node');
const startNodeId = app.nodesById.has(requested) ? requested : app.tour.startNodeId;

app.viewer = new Viewer({
  container: $('#viewer'),
  defaultZoomLvl: 30,
  touchmoveTwoFingers: false,
  mousewheelCtrlKey: false,
  navbar: ['zoom', 'move', 'caption', 'gyroscope', 'fullscreen'],
  loadingTxt: 'Loading showroom…',
  plugins: [
    MarkersPlugin,
    GyroscopePlugin,
    [
      VirtualTourPlugin,
      {
        positionMode: 'manual',
        renderMode: '3d',
        nodes: app.tour.nodes.map(toPsvNode),
        startNodeId,
        preload: true,
        transitionOptions: { showLoader: false, effect: 'fade', speed: 1200, rotation: true },
      },
    ],
  ],
});
app.vt = app.viewer.getPlugin(VirtualTourPlugin);
app.markers = app.viewer.getPlugin(MarkersPlugin);
app.currentNode = () => app.nodesById.get(app.vt.getCurrentNode()?.id);

app.vt.addEventListener('node-changed', ({ node }) => {
  try {
    const url = new URL(location.href);
    url.searchParams.set('node', node.id);
    url.searchParams.delete('sku');
    history.replaceState(null, '', url);
  } catch {
    // sandboxed frames may refuse history updates
  }
  renderPlan();
  renderRoomBar();
  app.onNodeChanged?.(node.id);
});

app.markers.addEventListener('select-marker', ({ marker }) => {
  if (marker.data?.sku) openProduct(marker.data.sku);
});

// ---------- floor plan ----------

let shownFloor = null;

function renderPlan() {
  const current = app.currentNode();
  const floors = app.tour.floors ?? [];
  if (!floors.length) return;
  if (current?.floor && current.floor !== app.lastFloor) {
    shownFloor = current.floor;
    app.lastFloor = current.floor;
  }
  shownFloor ??= floors[0].id;
  const floor = floors.find((f) => f.id === shownFloor) ?? floors[0];
  const [w, h] = floor.size ?? [1000, 600];

  $('#planTabs').innerHTML = floors
    .map((f) => `<button type="button" data-floor="${esc(f.id)}" aria-pressed="${f.id === floor.id}">${esc(f.name)}</button>`)
    .join('');

  const dots = app.tour.nodes
    .filter((n) => n.floor === floor.id && n.plan)
    .map((n) => {
      const here = n.id === current?.id;
      const facing = here ? (n.heading ?? 0) + app.viewer.getPosition().yaw * (180 / Math.PI) : 0;
      return `<button type="button" class="plan-dot${here ? ' is-here' : ''}" data-node="${esc(n.id)}"
        style="left:${(n.plan[0] / w) * 100}%;top:${(n.plan[1] / h) * 100}%" title="${esc(n.name)}">
        ${here ? `<span class="plan-cone" style="transform:rotate(${facing}deg)"></span>` : ''}</button>`;
    })
    .join('');

  $('#planMap').style.aspectRatio = `${w} / ${h}`;
  $('#planMap').innerHTML = `<img src="${esc(asset(floor.plan))}" alt="${esc(floor.name)} plan" draggable="false">${dots}`;
}

$('#planTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-floor]');
  if (!btn) return;
  shownFloor = btn.dataset.floor;
  renderPlan();
});

$('#planMap').addEventListener('click', (e) => {
  const dot = e.target.closest('[data-node]');
  if (dot) {
    app.vt.setCurrentNode(dot.dataset.node);
    return;
  }
  if (app.editMode && app.onPlanClick) {
    const floor = app.tour.floors.find((f) => f.id === shownFloor);
    const rect = $('#planMap').getBoundingClientRect();
    const [w, h] = floor.size ?? [1000, 600];
    app.onPlanClick(floor.id, [Math.round(((e.clientX - rect.left) / rect.width) * w), Math.round(((e.clientY - rect.top) / rect.height) * h)]);
  }
});

$('#planToggle').addEventListener('click', () => {
  const plan = $('#plan');
  plan.classList.toggle('is-collapsed');
  $('#planToggle').setAttribute('aria-expanded', String(!plan.classList.contains('is-collapsed')));
});

let coneFrame = 0;
app.viewer.addEventListener('position-updated', () => {
  cancelAnimationFrame(coneFrame);
  coneFrame = requestAnimationFrame(() => {
    const cone = $('.plan-cone');
    const node = app.currentNode();
    if (cone && node) cone.style.transform = `rotate(${(node.heading ?? 0) + app.viewer.getPosition().yaw * (180 / Math.PI)}deg)`;
  });
});

// ---------- products in this room ----------

function roomProducts() {
  const node = app.currentNode();
  return (node?.hotspots ?? []).map((h) => ({ h, p: app.products.get(h.sku) })).filter(({ p }) => p);
}

function renderRoomBar() {
  const node = app.currentNode();
  const items = roomProducts();
  $('#roomName').textContent = node?.name ?? '';
  $('#roomProducts').textContent = items.length ? `${items.length} product${items.length > 1 ? 's' : ''} here` : 'No products here';
  $('#roomProducts').disabled = !items.length;
}

$('#roomProducts').addEventListener('click', () => {
  const items = roomProducts();
  openDrawer(
    'In this room',
    `<ul class="room-list">${items
      .map(
        ({ h, p }) => `<li><button type="button" class="room-item" data-sku="${esc(p.sku)}" data-yaw="${h.yaw}" data-pitch="${h.pitch}">
          <img src="${esc(asset(p.image))}" alt="" loading="lazy"><span><strong>${esc(p.name)}</strong><small>${esc(p.category ?? '')}</small></span>
          <span class="price">${esc(app.money(p.price))}</span></button></li>`,
      )
      .join('')}</ul>`,
  );
});

$('#drawerBody').addEventListener('click', (e) => {
  const item = e.target.closest('.room-item');
  if (!item) return;
  app.viewer.animate({ yaw: `${item.dataset.yaw}deg`, pitch: `${item.dataset.pitch}deg`, speed: '6rpm' });
  openProduct(item.dataset.sku);
});

// ---------- drawer: product card + cart ----------

function openDrawer(title, html) {
  $('#drawerTitle').textContent = title;
  $('#drawerBody').innerHTML = html;
  $('#drawer').hidden = false;
  $('#drawer').dataset.view = title;
}

function closeDrawer() {
  $('#drawer').hidden = true;
}
$('#drawerClose').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());

function openProduct(sku) {
  const p = app.products.get(sku);
  if (!p) return;
  const out = p.inStock === false;
  openDrawer(
    p.category ?? 'Product',
    `<article class="product" data-sku="${esc(p.sku)}">
      ${p.image ? `<img class="product-img" src="${esc(asset(p.image))}" alt="${esc(p.name)}">` : ''}
      <h2>${esc(p.name)}</h2>
      <p class="product-price">${p.compareAtPrice ? `<s>${esc(app.money(p.compareAtPrice))}</s> ` : ''}${esc(app.money(p.price))}</p>
      <p class="product-desc">${esc(p.description)}</p>
      <div class="buy-row">
        <div class="qty" role="group" aria-label="Quantity">
          <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
          <input type="number" min="1" ${p.maxQty ? `max="${p.maxQty}"` : ''} value="1" inputmode="numeric" aria-label="Quantity">
          <button type="button" data-step="1" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn-primary" data-add ${out ? 'disabled' : ''}>${out ? 'Out of stock' : 'Add to cart'}</button>
      </div>
      ${p.url ? `<a class="product-link" href="${esc(p.url)}" target="_blank" rel="noopener">View full details on website ↗</a>` : ''}
      <p class="sku">SKU ${esc(p.sku)}</p>
    </article>`,
  );
}
app.openProduct = openProduct;

$('#drawerBody').addEventListener('click', (e) => {
  const product = e.target.closest('.product');
  if (!product) return;
  const input = product.querySelector('.qty input');
  const step = e.target.closest('[data-step]');
  const max = Number(input.max) || Infinity;
  if (step) input.value = Math.min(max, Math.max(1, (parseInt(input.value, 10) || 1) + Number(step.dataset.step)));
  if (e.target.closest('[data-add]')) {
    const p = app.products.get(product.dataset.sku);
    const added = app.cart.add(p.sku, Math.max(1, parseInt(input.value, 10) || 1));
    if (added) toast(`Added ${added} × ${p.name}`, { action: 'View cart', onAction: openCart });
    else toast(`Only ${p.maxQty} available, and it's already in your cart`, { action: 'View cart', onAction: openCart });
  }
});

function openCart() {
  const lines = app.cart.lines();
  openDrawer(
    'Your cart',
    lines.length
      ? `<ul class="cart-lines">${lines
          .map(
            (l) => `<li data-sku="${esc(l.sku)}">
            <img src="${esc(asset(l.product.image))}" alt="" loading="lazy">
            <div><strong>${esc(l.product.name)}</strong><small>${esc(app.money(l.product.price))} each</small>
              <div class="qty small"><button type="button" data-cart-step="-1" aria-label="Decrease">−</button><span>${l.qty}</span><button type="button" data-cart-step="1" aria-label="Increase">+</button></div></div>
            <span class="price">${esc(app.money(l.product.price * l.qty))}</span></li>`,
          )
          .join('')}</ul>
        <div class="cart-total"><span>Total</span><strong>${esc(app.money(app.cart.total()))}</strong></div>
        <button type="button" class="btn-primary wide" data-checkout>${['shopify', 'woocommerce'].includes(app.catalog.checkout?.mode) ? 'Continue to cart' : 'Checkout'}</button>
        <button type="button" class="btn-link" data-continue>Keep browsing</button>`
      : '<p class="empty">Your cart is empty. Tap a price tag in the showroom to add products.</p>',
  );
}

$('#drawerBody').addEventListener('click', (e) => {
  const step = e.target.closest('[data-cart-step]');
  if (step) {
    const sku = step.closest('[data-sku]').dataset.sku;
    const line = app.cart.lines().find((l) => l.sku === sku);
    app.cart.setQty(sku, (line?.qty ?? 0) + Number(step.dataset.cartStep));
    openCart();
  }
  if (e.target.closest('[data-checkout]')) checkout(app.cart, app.catalog, { showMessage: (m) => toast(m) });
  if (e.target.closest('[data-continue]')) closeDrawer();
});

$('#cartBtn').addEventListener('click', openCart);

// ---------- toast ----------

let toastTimer;
function toast(message, { action, onAction } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.querySelector('button')?.addEventListener('click', () => {
    el.hidden = true;
    onAction?.();
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
}
app.toast = toast;

// ---------- boot ----------

$('#brandName').textContent = app.tour.name;
document.title = app.tour.name;

app.cart = createCart(tourId, app.products);
const updateCount = () => {
  $('#cartCount').textContent = app.cart.count();
  $('#cartBtn').setAttribute('aria-label', `Cart, ${app.cart.count()} items`);
};
app.cart.subscribe(updateCount);
updateCount();

renderPlan();
renderRoomBar();
if (app.products.has(params.get('sku'))) openProduct(params.get('sku'));

if (editMode) {
  const { initEditor } = await import('./editor.js');
  initEditor(app, tourId);
}
