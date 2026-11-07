// Generates stand-in panoramas, floor plans and product images so the tour
// runs before any 360 photos exist. Real captures from `npm run ingest`
// replace the panoramas one file at a time.
//
// When layouts/<tour>.json exists (see layout-room.mjs), floors it describes
// are drawn as the real room in perspective, with every product display in place.
//
//   node scripts/make-placeholders.mjs [--tour odowds] [--force]

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { indexNodes, indexProducts, linkYaw } from '../src/tour-model.js';
import { roomPanoramaSvg, roomPlanSvg } from './room-render.mjs';

const { values: args } = parseArgs({
  options: { tour: { type: 'string', default: 'odowds' }, force: { type: 'boolean', default: false } },
});

const root = path.resolve('public/tours', args.tour);
const tour = JSON.parse(await readFile(path.join(root, 'tour.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(root, 'products.json'), 'utf8'));
const nodes = indexNodes(tour);
const products = indexProducts(catalog);
const layoutFile = path.resolve('layouts', `${args.tour}.json`);
const layout = existsSync(layoutFile) ? JSON.parse(await readFile(layoutFile, 'utf8')) : null;
const roomFor = (floorId) => layout?.floors?.[floorId] ?? null;
const floorName = (id) => tour.floors.find((f) => f.id === id)?.name ?? '';

function nodePanoramaSvg(node) {
  const room = roomFor(node.floor);
  if (!room) return panoramaSvg(node);
  return roomPanoramaSvg({ layout, room, node, floorName: floorName(node.floor), productName: (sku) => products.get(sku)?.name });
}

function floorPlanSvg(floor) {
  const room = roomFor(floor.id);
  return room ? roomPlanSvg({ layout, room, floor, nodes: tour.nodes }) : planSvg(floor);
}

const W = 4096;
const H = 2048;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const yawToX = (yaw) => ((((yaw / 360 + 0.5) * W) % W) + W) % W;
const pitchToY = (pitch) => (0.5 - pitch / 180) * H;

function panoramaSvg(node) {
  const floorName = tour.floors.find((f) => f.id === node.floor)?.name ?? '';
  const parts = [];
  parts.push(`<rect width="${W}" height="${H / 2}" fill="#e9e2d6"/>`);
  parts.push(`<rect y="${H / 2}" width="${W}" height="${H / 2}" fill="#7a6a58"/>`);
  parts.push(`<rect y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="#5e5043"/>`);
  for (let yaw = -180; yaw < 180; yaw += 15) {
    const x = yawToX(yaw);
    const major = yaw % 45 === 0;
    parts.push(`<line x1="${x}" x2="${x}" y1="${H * 0.15}" y2="${H * 0.85}" stroke="#00000022" stroke-width="${major ? 3 : 1}"/>`);
    if (major) parts.push(`<text x="${x}" y="${H * 0.14}" font-size="28" fill="#00000077" text-anchor="middle">${yaw}°</text>`);
  }
  parts.push(`<line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#00000044" stroke-width="2"/>`);
  for (const x of [W / 2, 0, W]) {
    parts.push(`<text x="${x}" y="${H * 0.3}" font-size="72" font-weight="700" fill="#3b2f25" text-anchor="middle">${esc(node.name)}</text>`);
    parts.push(`<text x="${x}" y="${H * 0.3 + 64}" font-size="40" fill="#3b2f25aa" text-anchor="middle">${esc(floorName)} · placeholder panorama</text>`);
  }
  for (const link of node.links ?? []) {
    const yaw = linkYaw(node, link, nodes);
    if (yaw === null) continue;
    const x = yawToX(yaw);
    const target = nodes.get(link.nodeId);
    parts.push(`<rect x="${x - 150}" y="${H * 0.36}" width="300" height="${H * 0.14}" fill="#2b2420" rx="6"/>`);
    parts.push(`<text x="${x}" y="${H * 0.34}" font-size="34" fill="#2b2420" text-anchor="middle">to ${esc(target?.name ?? link.nodeId)}</text>`);
  }
  for (const h of node.hotspots ?? []) {
    const p = products.get(h.sku);
    const x = yawToX(h.yaw);
    const y = pitchToY(h.pitch);
    parts.push(`<rect x="${x - 70}" y="${y - 60}" width="140" height="120" fill="#1f1a17" rx="10"/>`);
    parts.push(`<rect x="${x - 45}" y="${y - 35}" width="90" height="60" fill="#e86a2a" rx="6"/>`);
    parts.push(`<text x="${x}" y="${y + 100}" font-size="26" fill="#f4efe8" text-anchor="middle">${esc(p?.name ?? h.sku)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
}

// Rectangular footprint, front wall at the bottom. A floor's optional `sketch`
// adds features: { entrance: 'front', desk: 'left' | 'right', stairs: 'left' | 'right' }.
function planSvg(floor) {
  const [w, h] = floor.size;
  const sketch = floor.sketch ?? {};
  const ink = '#3b2f25';
  const m = 40; // wall inset
  const parts = [`<rect width="${w}" height="${h}" fill="#f7f4ef"/>`];
  parts.push(`<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" fill="#fffdf9" stroke="${ink}" stroke-width="10"/>`);
  parts.push(`<text x="${w / 2}" y="${m - 12}" font-size="16" fill="${ink}88" text-anchor="middle" letter-spacing="3">BACK</text>`);

  if (sketch.entrance === 'front') {
    const door = 120;
    const x0 = w / 2 - door / 2;
    parts.push(`<rect x="${x0}" y="${h - m - 8}" width="${door}" height="16" fill="#fffdf9"/>`);
    parts.push(`<path d="M${x0} ${h - m} A${door / 2} ${door / 2} 0 0 1 ${x0 + door / 2} ${h - m - door / 2} M${x0 + door} ${h - m} A${door / 2} ${door / 2} 0 0 0 ${x0 + door / 2} ${h - m - door / 2}" fill="none" stroke="${ink}88" stroke-width="2" stroke-dasharray="6 5"/>`);
    parts.push(`<text x="${w / 2}" y="${h - 12}" font-size="18" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="3">ENTRANCE</text>`);
  }

  if (sketch.desk) {
    const dw = 46;
    const x = sketch.desk === 'left' ? m + 14 : w - m - 14 - dw;
    parts.push(`<rect x="${x}" y="${h * 0.34}" width="${dw}" height="${h * 0.32}" rx="6" fill="#d9c7ae" stroke="${ink}" stroke-width="3"/>`);
    parts.push(`<text transform="translate(${x + dw / 2 + 6} ${h / 2}) rotate(-90)" font-size="16" fill="${ink}" text-anchor="middle">DESK</text>`);
  }

  if (sketch.stairs) {
    const sw = 90;
    const x = sketch.stairs === 'right' ? w - m - sw : m;
    const y0 = h * 0.22;
    const y1 = h * 0.78;
    const steps = 14;
    parts.push(`<rect x="${x}" y="${y0}" width="${sw}" height="${y1 - y0}" fill="#efe7db" stroke="${ink}" stroke-width="3"/>`);
    for (let i = 1; i < steps; i++) {
      const y = y0 + ((y1 - y0) * i) / steps;
      parts.push(`<line x1="${x}" x2="${x + sw}" y1="${y}" y2="${y}" stroke="${ink}" stroke-width="1.5"/>`);
    }
    parts.push(`<path d="M${x + sw * 0.7} ${y1 - 16} V${y0 + 22} m-10 12 l10 -12 l10 12" fill="none" stroke="${ink}" stroke-width="3"/>`);
    parts.push(`<rect x="${x + sw * 0.3 - 14}" y="${(y0 + y1) / 2 - 38}" width="22" height="76" fill="#efe7db"/>`);
    parts.push(`<text transform="translate(${x + sw * 0.3 + 2} ${(y0 + y1) / 2}) rotate(-90)" font-size="16" fill="${ink}" text-anchor="middle">STAIRS</text>`);
  }

  for (const n of tour.nodes.filter((node) => node.floor === floor.id && node.plan)) {
    parts.push(`<text x="${n.plan[0]}" y="${n.plan[1] + 40}" font-size="20" fill="${ink}" text-anchor="middle">${esc(n.name)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
}

const productIcons = {
  'clothing.svg': '<line x1="40" y1="40" x2="200" y2="40" stroke="#3d3530" stroke-width="6"/><path d="M60 42 l-14 140 h44 l-10 -140z" fill="#c2413b"/><path d="M105 42 l-16 140 h46 l-12 -140z" fill="#2f7f86"/><path d="M152 42 l-14 140 h44 l-10 -140z" fill="#e0a030"/>',
  'bag.svg': '<path d="M85 70 q35 -50 70 0" fill="none" stroke="#6b5848" stroke-width="8"/><rect x="60" y="70" width="120" height="110" rx="14" fill="#7d3c8c"/><path d="M60 110 h120 M60 140 h120" stroke="#e0a030" stroke-width="8"/>',
  'hanging.svg': '<circle cx="120" cy="80" r="50" fill="none" stroke="#a8743f" stroke-width="6"/><path d="M120 30 v100 M70 80 h100 M85 45 l70 70 M155 45 l-70 70" stroke="#d9c7ae" stroke-width="2"/><path d="M90 130 v50 M120 130 v60 M150 130 v50" stroke="#e8e0d4" stroke-width="10" stroke-linecap="round"/>',
  'crystal.svg': '<path d="M70 180 L95 70 L120 180 Z" fill="#9a7fc2" stroke="#6d5596" stroke-width="3"/><path d="M110 180 L140 40 L170 180 Z" fill="#b9a2d6" stroke="#6d5596" stroke-width="3"/><path d="M150 180 L170 100 L190 180 Z" fill="#8a6fb5" stroke="#6d5596" stroke-width="3"/><rect x="50" y="178" width="160" height="10" rx="4" fill="#6b4f3a"/>',
  'jewellery.svg': '<path d="M60 40 Q120 150 180 40" fill="none" stroke="#b8bfc4" stroke-width="5"/><path d="M120 120 L100 150 L120 185 L140 150 Z" fill="#9a7fc2" stroke="#6d5596" stroke-width="3"/><circle cx="120" cy="118" r="7" fill="#b8bfc4"/>',
  'slab.svg': '<rect x="50" y="20" width="140" height="170" rx="4" fill="#ece8e0" stroke="#b9b2a6" stroke-width="3"/><path d="M70 40 L120 110 L100 180 M150 30 L170 120" stroke="#9c958a" stroke-width="3" fill="none"/>',
  'tile.svg': '<g stroke="#a99b85" stroke-width="4"><rect x="40" y="30" width="160" height="160" fill="#d8cbb6"/><line x1="120" y1="30" x2="120" y2="190"/><line x1="40" y1="110" x2="200" y2="110"/></g>',
  'worktop.svg': '<rect x="20" y="70" width="200" height="22" fill="#3a3a3c"/><rect x="30" y="92" width="180" height="90" fill="#cfc8bc"/><rect x="95" y="58" width="50" height="12" rx="3" fill="#8f8a82"/>',
  'stone.svg': '<rect x="40" y="90" width="80" height="50" fill="#d9b77e" stroke="#a88a55" stroke-width="3"/><rect x="120" y="90" width="80" height="50" fill="#d9b77e" stroke="#a88a55" stroke-width="3"/><rect x="80" y="140" width="80" height="50" fill="#d9b77e" stroke="#a88a55" stroke-width="3"/><rect x="80" y="40" width="80" height="50" fill="#e1cfa8" stroke="#a88a55" stroke-width="3"/>',
  'stove.svg': '<rect x="70" y="40" width="100" height="20" fill="#2b2420"/><rect x="55" y="60" width="130" height="130" rx="8" fill="#2b2420"/><rect x="80" y="85" width="80" height="70" rx="4" fill="#e86a2a"/><rect x="110" y="0" width="20" height="40" fill="#2b2420"/>',
  'fireplace.svg': '<rect x="20" y="40" width="200" height="24" fill="#cbb89f"/><rect x="40" y="64" width="40" height="126" fill="#cbb89f"/><rect x="160" y="64" width="40" height="126" fill="#cbb89f"/><rect x="80" y="100" width="80" height="90" fill="#2b2420"/><path d="M120 180 q-25 -30 0 -60 q25 30 0 60z" fill="#e86a2a"/>',
  'accessory.svg': '<rect x="40" y="110" width="160" height="80" rx="10" fill="#7a6a58"/><circle cx="80" cy="110" r="22" fill="#a68a6d"/><circle cx="125" cy="105" r="22" fill="#a68a6d"/><circle cx="165" cy="112" r="22" fill="#a68a6d"/><rect x="200" y="20" width="6" height="170" fill="#2b2420"/>',
};

async function writeIfMissing(file, data) {
  if (existsSync(file) && !args.force) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return true;
}

let written = 0;
for (const node of tour.nodes) {
  if (node.captured) continue; // a real 360 photo: never overwrite it
  const pano = path.join(root, node.panorama);
  if (!existsSync(pano) || args.force) {
    const img = sharp(Buffer.from(nodePanoramaSvg(node)));
    await mkdir(path.dirname(pano), { recursive: true });
    await img.clone().jpeg({ quality: 80 }).toFile(pano);
    if (node.thumbnail) {
      await mkdir(path.dirname(path.join(root, node.thumbnail)), { recursive: true });
      await img.clone().resize(400, 200).jpeg({ quality: 75 }).toFile(path.join(root, node.thumbnail));
    }
    written++;
  }
}
for (const floor of tour.floors) {
  if (await writeIfMissing(path.join(root, floor.plan), floorPlanSvg(floor))) written++;
}
for (const [name, body] of Object.entries(productIcons)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"><rect width="240" height="200" fill="#f1ece4"/>${body}</svg>`;
  if (await writeIfMissing(path.join(root, 'products', name), svg)) written++;
}
console.log(`Wrote ${written} placeholder file(s) into ${path.relative(process.cwd(), root)}`);
