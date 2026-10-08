// Tour editor, enabled with ?edit in the URL.
//
// Click in the panorama to pick a direction, then pin a product or a link to
// another panorama there. Nudge a node's heading until the walk arrows line up
// with the doorways, and click the floor plan to place the node. Changes are
// kept as a local draft; "Download tour.json" exports the file to commit.

import { normalizeDeg as normalize } from './tour-model.js';

const DEG = 180 / Math.PI;
const draftKey = (tourId) => `showroom-tour-draft:${tourId}`;

export function loadDraft(tourId) {
  try {
    const raw = localStorage.getItem(draftKey(tourId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function initEditor(app, tourId) {
  const { esc } = app;
  let lastClick = null;
  let placing = false;

  const panel = document.createElement('aside');
  panel.className = 'editor';
  panel.setAttribute('aria-label', 'Tour editor');
  document.body.append(panel);

  const save = () => {
    try {
      localStorage.setItem(draftKey(tourId), JSON.stringify(app.tour));
    } catch {
      app.toast('Draft could not be saved in this browser. Download before leaving.');
    }
    app.refreshNodes();
    showCursor();
    render();
  };

  const node = () => app.currentNode();
  const round = (n) => Math.round(n * 10) / 10;

  function showCursor() {
    if (!lastClick) return;
    const cfg = {
      id: 'edit-cursor',
      position: { yaw: `${lastClick.yaw}deg`, pitch: `${lastClick.pitch}deg` },
      html: '<div class="edit-cursor"></div>',
      anchor: 'center center',
    };
    try {
      app.markers.updateMarker(cfg);
    } catch {
      app.markers.addMarker(cfg);
    }
  }

  function render() {
    const n = node();
    if (!n) return;
    const others = app.tour.nodes.filter((o) => o.id !== n.id);
    panel.innerHTML = `
      <header><strong>Editor</strong><span class="draft-note">draft saved in this browser</span></header>
      <label>Panorama
        <select data-field="goto">${app.tour.nodes.map((o) => `<option value="${esc(o.id)}" ${o.id === n.id ? 'selected' : ''}>${esc(o.name)} (${esc(o.id)})</option>`).join('')}</select>
      </label>
      <div class="row">
        <label class="grow">Name <input data-field="name" value="${esc(n.name)}"></label>
        <label>Floor <select data-field="floor">${(app.tour.floors ?? []).map((f) => `<option value="${esc(f.id)}" ${f.id === n.floor ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
      </div>
      <div class="row">
        <label class="grow">Heading° <input data-field="heading" type="number" step="1" value="${n.heading ?? 0}"></label>
        <button type="button" data-nudge="-5">−5°</button><button type="button" data-nudge="5">+5°</button>
      </div>
      <button type="button" data-action="place" class="${placing ? 'is-armed' : ''}">${placing ? 'Now click the floor plan…' : n.plan ? `On plan at ${n.plan.join(', ')} — move` : 'Place on floor plan'}</button>

      <h3>Clicked direction</h3>
      <p class="mono">${lastClick ? `yaw ${lastClick.yaw}° · pitch ${lastClick.pitch}°` : 'Click in the panorama'}</p>
      <div class="row">
        <select data-field="sku" class="grow">${app.catalog.products.map((p) => `<option value="${esc(p.sku)}">${esc(p.name)} (${esc(p.sku)})</option>`).join('')}</select>
        <button type="button" data-action="add-hotspot" ${lastClick ? '' : 'disabled'}>Pin product</button>
      </div>
      <div class="row">
        <select data-field="link" class="grow">${others.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select>
        <button type="button" data-action="add-link" ${lastClick ? '' : 'disabled'}>Link here</button>
        <button type="button" data-action="add-auto-link" title="Direction worked out from the floor plan">Auto</button>
      </div>

      <h3>Links</h3>
      <ul>${(n.links ?? []).map((l, i) => `<li>→ ${esc(app.nodesById.get(l.nodeId)?.name ?? l.nodeId)} <small>${typeof l.yaw === 'number' ? `${l.yaw}°` : 'auto'}</small><button type="button" data-remove-link="${i}" aria-label="Remove link">×</button></li>`).join('') || '<li class="muted">None</li>'}</ul>
      <h3>Products</h3>
      <ul>${(n.hotspots ?? []).map((h, i) => `<li>${esc(app.products.get(h.sku)?.name ?? h.sku)} <small>${h.yaw}°, ${h.pitch}°</small><button type="button" data-move-hotspot="${i}" ${lastClick ? '' : 'disabled'} title="Move to clicked direction">⤳</button><button type="button" data-remove-hotspot="${i}" aria-label="Remove product">×</button></li>`).join('') || '<li class="muted">None</li>'}</ul>

      <footer>
        <button type="button" data-action="download" class="btn-primary">Download tour.json</button>
        <button type="button" data-action="discard">Discard draft</button>
      </footer>`;
  }

  app.viewer.addEventListener('click', ({ data }) => {
    if (data.rightclick || data.marker) return;
    lastClick = { yaw: round(normalize(data.yaw * DEG)), pitch: round(data.pitch * DEG) };
    showCursor();
    render();
  });

  app.onNodeChanged = () => {
    lastClick = null;
    placing = false;
    render();
  };

  app.onPlanClick = (floorId, xy) => {
    if (!placing) return;
    const n = node();
    n.plan = xy;
    n.floor = floorId;
    placing = false;
    save();
  };

  panel.addEventListener('change', (e) => {
    const n = node();
    const field = e.target.dataset.field;
    if (field === 'goto') app.vt.setCurrentNode(e.target.value);
    if (field === 'name') {
      n.name = e.target.value;
      app.vt.updateNode({ id: n.id, name: n.name });
      save();
    }
    if (field === 'floor') {
      n.floor = e.target.value;
      save();
    }
    if (field === 'heading') {
      n.heading = Number(e.target.value) || 0;
      save();
    }
  });

  panel.addEventListener('click', (e) => {
    const n = node();
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.nudge) {
      n.heading = normalize((n.heading ?? 0) + Number(btn.dataset.nudge));
      return save();
    }
    if (btn.dataset.removeLink) {
      n.links.splice(Number(btn.dataset.removeLink), 1);
      return save();
    }
    if (btn.dataset.removeHotspot) {
      n.hotspots.splice(Number(btn.dataset.removeHotspot), 1);
      return save();
    }
    if (btn.dataset.moveHotspot && lastClick) {
      Object.assign(n.hotspots[Number(btn.dataset.moveHotspot)], lastClick);
      return save();
    }

    switch (btn.dataset.action) {
      case 'place':
        placing = !placing;
        if (placing) app.toast('Click where this panorama was taken on the floor plan (switch floors with the tabs).');
        return render();
      case 'add-hotspot':
        (n.hotspots ??= []).push({ sku: panel.querySelector('[data-field="sku"]').value, ...lastClick });
        return save();
      case 'add-link':
      case 'add-auto-link': {
        const target = panel.querySelector('[data-field="link"]').value;
        if (!target) return;
        n.links = (n.links ?? []).filter((l) => l.nodeId !== target);
        const link = { nodeId: target };
        if (btn.dataset.action === 'add-link') link.yaw = lastClick.yaw;
        else if (!n.plan || !app.nodesById.get(target)?.plan) return app.toast('Place both panoramas on the floor plan first, or click a direction and use "Link here".');
        n.links.push(link);
        const back = app.nodesById.get(target);
        if (!(back.links ?? []).some((l) => l.nodeId === n.id)) {
          app.toast(`Linked. Open "${back.name}" to add the way back.`);
        }
        return save();
      }
      case 'download': {
        const blob = new Blob([JSON.stringify(app.tour, null, 2) + '\n'], { type: 'application/json' });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'tour.json' });
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      }
      case 'discard':
        if (!confirm('Discard all unsaved edits and reload the published tour?')) return;
        try {
          localStorage.removeItem(draftKey(tourId));
        } catch {
          // nothing stored
        }
        location.reload();
    }
  });

  render();
}

