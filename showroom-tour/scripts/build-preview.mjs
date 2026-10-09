// Builds the tour as ONE self-contained HTML file (code, panoramas, plans,
// product photos and data inlined) that opens by double-click or as an email
// attachment, with no server. Checkout is switched to demo mode, so testing
// the preview never touches the live shop's cart.
//
//   node scripts/build-preview.mjs [--tour odowds] [--out preview/odowds-tour-preview.html]

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { build } from 'vite';

const { values: args } = parseArgs({
  options: {
    tour: { type: 'string', default: 'odowds' },
    out: { type: 'string' },
  },
});
const out = path.resolve(args.out ?? `preview/${args.tour}-tour-preview.html`);
const root = path.resolve('public/tours', args.tour);
const tour = JSON.parse(await readFile(path.join(root, 'tour.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(root, 'products.json'), 'utf8'));

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const dataUri = (buf, type) => `data:${type};base64,${buf.toString('base64')}`;

async function localAsset(rel) {
  if (!rel) return rel;
  const file = path.join(root, rel);
  return dataUri(await readFile(file), MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
}

// Remote product photos are shrunk to card size so the file stays small.
async function remoteImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const jpg = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    return dataUri(jpg, 'image/jpeg');
  } catch (err) {
    console.warn(`warn  could not inline ${url} (${err.message}); it will load from the web`);
    return url;
  }
}

for (const node of tour.nodes) {
  node.panorama = await localAsset(node.panorama);
  node.thumbnail = await localAsset(node.thumbnail);
}
for (const floor of tour.floors ?? []) floor.plan = await localAsset(floor.plan);
for (const p of catalog.products) {
  if (!p.image) continue;
  p.image = /^https?:/.test(p.image) ? await remoteImage(p.image) : await localAsset(p.image);
}
const shopName = catalog.checkout?.storeUrl ? new URL(catalog.checkout.storeUrl).host : 'the shop';
catalog.checkout = { ...catalog.checkout, mode: 'demo', message: `Preview only. On the live tour this button opens your cart on ${shopName} with these items in it.` };

// One JS chunk, so it can sit inside a <script> tag.
const tmp = await mkdtemp(path.join(os.tmpdir(), 'tour-preview-'));
await build({
  logLevel: 'warn',
  build: {
    outDir: tmp,
    emptyOutDir: true,
    copyPublicDir: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});

const assets = path.join(tmp, 'assets');
const files = await readdir(assets);
const js = await readFile(path.join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const css = await readFile(path.join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');
let html = await readFile(path.join(tmp, 'index.html'), 'utf8');
await rm(tmp, { recursive: true, force: true });

const inline = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');
// The viewer fetches tour.json and products.json; answer those from memory.
const shim = `window.__TOUR_PREVIEW__ = ${inline(JSON.stringify({ [`tours/${args.tour}/tour.json`]: tour, [`tours/${args.tour}/products.json`]: catalog }))};
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const hit = Object.keys(window.__TOUR_PREVIEW__).find((k) => url.split('?')[0].endsWith(k));
  return hit ? Promise.resolve(new Response(JSON.stringify(window.__TOUR_PREVIEW__[hit]), { headers: { 'Content-Type': 'application/json' } })) : realFetch(input, init);
};`;

html = html
  .replace(/<script type="module"[^>]*src="[^"]+"><\/script>/, '')
  .replace(/<link rel="stylesheet"[^>]*href="[^"]+">/, '')
  .replace('</head>', () => `<style>${inline(css)}</style>\n<script>${shim}</script>\n</head>`)
  .replace('</body>', () => `<script type="module">${inline(js)}</script>\n</body>`)
  .replace(/<title>[^<]*<\/title>/, `<title>${tour.name} – preview</title>`);

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);
