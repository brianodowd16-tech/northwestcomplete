// Generates stand-in panoramas, floor plans and product images so the tour
// runs before any Insta360 captures exist. Real captures from `npm run ingest`
// replace the panoramas one file at a time.
//
//   node scripts/make-placeholders.mjs [--tour odowds] [--force]

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { indexNodes, indexProducts, linkYaw } from '../src/tour-model.js';

const { values: args } = parseArgs({
  options: { tour: { type: 'string', default: 'odowds' }, force: { type: 'boolean', default: false } },
});

const root = path.resolve('public/tours', args.tour);
const tour = JSON.parse(await readFile(path.join(root, 'tour.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(root, 'products.json'), 'utf8'));
const nodes = indexNodes(tour);
const products = indexProducts(catalog);

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

function planSvg(floor) {
  const [w, h] = floor.size;
  const rooms = tour.nodes.filter((n) => n.floor === floor.id && n.plan);
  const parts = [`<rect width="${w}" height="${h}" fill="#f7f4ef"/>`, `<rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="#3b2f25" stroke-width="8"/>`];
  parts.push(`<line x1="${w * 0.7}" y1="20" x2="${w * 0.7}" y2="${h - 20}" stroke="#3b2f25" stroke-width="4" stroke-dasharray="60 40"/>`);
  parts.push(`<line x1="20" y1="${h * 0.52}" x2="${w * 0.7}" y2="${h * 0.52}" stroke="#3b2f25" stroke-width="4" stroke-dasharray="60 40"/>`);
  parts.push(`<g stroke="#3b2f25" stroke-width="2">${Array.from({ length: 8 }, (_, i) => `<line x1="${w * 0.78}" x2="${w * 0.9}" y1="${h * 0.3 + i * 14}" y2="${h * 0.3 + i * 14}"/>`).join('')}</g>`);
  for (const n of rooms) {
    parts.push(`<text x="${n.plan[0]}" y="${n.plan[1] + 48}" font-size="22" fill="#3b2f25" text-anchor="middle">${esc(n.name)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
}

const productIcons = {
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
  const pano = path.join(root, node.panorama);
  if (!existsSync(pano) || args.force) {
    const img = sharp(Buffer.from(panoramaSvg(node)));
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
  if (await writeIfMissing(path.join(root, floor.plan), planSvg(floor))) written++;
}
for (const [name, body] of Object.entries(productIcons)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"><rect width="240" height="200" fill="#f1ece4"/>${body}</svg>`;
  if (await writeIfMissing(path.join(root, 'products', name), svg)) written++;
}
console.log(`Wrote ${written} placeholder file(s) into ${path.relative(process.cwd(), root)}`);
