// Builds the placeholder tour from a room layout in feet (layouts/<tour>.json):
// tour stops, links, floor sizes, placeholder products, and every product pin's
// yaw/pitch as seen from each stop. Run `npm run placeholders -- --force`
// afterwards to redraw the panoramas and plans to match.
//
//   node scripts/layout-room.mjs [--tour odowds]
//
// This is for the placeholder tour. Once real Insta360 captures are imported,
// pin products in the editor instead: re-running this overwrites stops and pins.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { KINDS, ftToPlan, pinPoint, planSize, project } from './room-geometry.mjs';

const { values: args } = parseArgs({ options: { tour: { type: 'string', default: 'odowds' } } });

const root = path.resolve('public/tours', args.tour);
const layout = JSON.parse(await readFile(path.resolve('layouts', `${args.tour}.json`), 'utf8'));
const tour = JSON.parse(await readFile(path.join(root, 'tour.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(root, 'products.json'), 'utf8'));

// ---- products: keep the shop's, regenerate the placeholders ----
const real = catalog.products.filter((p) => !p.placeholder);
const realSkus = new Set(real.map((p) => p.sku));
const placeholders = layout.displays
  .filter((d) => d.name)
  .map((d) => ({
    sku: d.sku,
    name: d.name,
    category: KINDS[d.kind].category,
    price: d.price,
    image: KINDS[d.kind].image,
    url: '',
    description: 'Placeholder product, standing in for a real display in this spot. Pin a real product here in the editor (?edit) once the showroom is photographed.',
    placeholder: true,
  }));
const missing = layout.displays.filter((d) => !d.name && !realSkus.has(d.sku)).map((d) => d.sku);
if (missing.length) console.warn(`warn  layout uses SKUs that are not in products.json: ${missing.join(', ')}`);
catalog.products = [...real, ...placeholders];

// ---- floors ----
for (const floor of tour.floors) {
  const room = layout.floors[floor.id];
  if (!room) continue;
  floor.size = planSize(layout, room);
  floor.room = { widthFt: room.widthFt, depthFt: room.depthFt };
  delete floor.sketch;
}

// ---- stops, links and pins ----
const byId = new Map(tour.nodes.map((n) => [n.id, n]));
const camH = layout.cameraHeightFt;
const radius = layout.pinRadiusFt;
const stopsByFloor = Map.groupBy(layout.stops, (s) => s.floor);

// A display is pinned at every stop within the radius, and always at its nearest stop.
const pinsByStop = new Map(layout.stops.map((s) => [s.id, []]));
for (const d of layout.displays) {
  const room = layout.floors[d.floor];
  const point = pinPoint(room, d);
  const seen = (stopsByFloor.get(d.floor) ?? []).map((s) => ({ s, ...project([...s.at, camH], 0, point) }));
  if (!seen.length) continue;
  const nearest = seen.reduce((a, c) => (c.dist < a.dist ? c : a));
  for (const v of seen) {
    if (v.dist > 3 && (v.dist <= radius || v === nearest)) {
      pinsByStop.get(v.s.id).push({ sku: d.sku, yaw: round(v.yaw), pitch: round(v.pitch), dist: v.dist });
    }
  }
}

tour.nodes = layout.stops.map((s) => {
  const old = byId.get(s.id) ?? {};
  return {
    id: s.id,
    name: s.name,
    floor: s.floor,
    plan: ftToPlan(layout, s.at),
    heading: 0,
    panorama: old.panorama ?? `panos/${s.id}.jpg`,
    thumbnail: old.thumbnail ?? `thumbs/${s.id}.jpg`,
    links: s.links.map((l) => (typeof l === 'string' ? { nodeId: l } : l)),
    hotspots: pinsByStop
      .get(s.id)
      .sort((a, b) => a.yaw - b.yaw)
      .map(({ sku, yaw, pitch }) => ({ sku, yaw, pitch })),
  };
});
if (!byId.has(tour.startNodeId) || !tour.nodes.some((n) => n.id === tour.startNodeId)) tour.startNodeId = layout.stops[0].id;

await writeFile(path.join(root, 'tour.json'), pretty(tour) + '\n');
await writeFile(path.join(root, 'products.json'), JSON.stringify(catalog, null, 2) + '\n');

const pins = tour.nodes.reduce((n, node) => n + node.hotspots.length, 0);
console.log(`${tour.nodes.length} stops, ${layout.displays.length} displays (${placeholders.length} placeholder products), ${pins} pins`);

function round(n) {
  return Math.round(n * 10) / 10;
}

// JSON with short objects and arrays kept on one line, like the hand-written files.
function pretty(value, indent = '') {
  const flat = JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']');
  if (typeof value !== 'object' || value === null || indent.length + flat.length <= 110) return flat;
  const inner = indent + '  ';
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + pretty(v, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${pretty(v, inner)}`).join(',\n')}\n${indent}}`;
}
