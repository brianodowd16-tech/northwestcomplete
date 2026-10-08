// Adds Insta360 captures to a tour.
//
// Export from Insta360 Studio first (the raw .insv/.insp files are not
// stitched): photos as equirectangular JPG, videos as 360 MP4 with direction
// lock / FlowState on so the front of the camera stays the walking direction.
//
//   node scripts/ingest.mjs --in captures/ground --floor ground
//   node scripts/ingest.mjs --in captures/first/walk.mp4 --floor first --every 2
//
// Photos become separate panoramas: place and link them in the editor (?edit).
// Videos become a chain of panoramas, one frame every --every seconds (walk
// slowly, ~0.5 m/s, so 2 s is about a metre), already linked forwards (yaw 0)
// and backwards (yaw 180) like Street View.

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const { values: args } = parseArgs({
  options: {
    tour: { type: 'string', default: 'odowds' },
    in: { type: 'string' },
    floor: { type: 'string' },
    prefix: { type: 'string', default: '' },
    every: { type: 'string', default: '2' },
    width: { type: 'string', default: '6144' },
    ffmpeg: { type: 'string', default: 'ffmpeg' },
    force: { type: 'boolean', default: false },
  },
});

if (!args.in) {
  console.error('Usage: node scripts/ingest.mjs --in <folder|file> [--floor ground] [--prefix g-] [--every 2] [--width 6144]');
  process.exit(1);
}

const root = path.resolve('public/tours', args.tour);
const tourFile = path.join(root, 'tour.json');
const tour = JSON.parse(await readFile(tourFile, 'utf8'));
const nodes = new Map(tour.nodes.map((n) => [n.id, n]));
const width = Number(args.width);

if (args.floor && !tour.floors?.some((f) => f.id === args.floor)) {
  console.error(`Unknown floor "${args.floor}". Floors in tour.json: ${tour.floors.map((f) => f.id).join(', ')}`);
  process.exit(1);
}

const IMAGE = /\.(jpe?g|png|webp)$/i;
const VIDEO = /\.(mp4|mov)$/i;
const slug = (s) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const title = (s) => s.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function addPanorama(src, id, name, links = []) {
  if (nodes.has(id) && !args.force) {
    console.log(`skip  ${id} (exists, use --force to replace)`);
    return false;
  }
  const meta = await sharp(src).metadata();
  if (Math.abs(meta.width / meta.height - 2) > 0.02) {
    console.warn(`warn  ${path.basename(src)} is ${meta.width}x${meta.height}, not 2:1 — is it an equirectangular export?`);
  }
  const panorama = `panos/${id}.jpg`;
  const thumbnail = `thumbs/${id}.jpg`;
  await mkdir(path.join(root, 'panos'), { recursive: true });
  await mkdir(path.join(root, 'thumbs'), { recursive: true });
  await sharp(src).rotate().resize({ width: Math.min(width, meta.width) }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(root, panorama));
  await sharp(src).resize(400, 200, { fit: 'cover' }).jpeg({ quality: 72 }).toFile(path.join(root, thumbnail));

  const existing = nodes.get(id);
  const node = {
    id,
    name: existing?.name ?? name,
    floor: args.floor ?? existing?.floor ?? tour.floors?.[0]?.id,
    ...(existing?.plan ? { plan: existing.plan } : {}),
    heading: existing?.heading ?? 0,
    panorama,
    thumbnail,
    links: existing?.links ?? links,
    hotspots: existing?.hotspots ?? [],
  };
  if (existing) tour.nodes[tour.nodes.indexOf(existing)] = node;
  else tour.nodes.push(node);
  nodes.set(id, node);
  console.log(`added ${id}`);
  return true;
}

async function ingestVideo(file) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ingest-'));
  try {
    execFileSync(args.ffmpeg, ['-loglevel', 'error', '-i', file, '-vf', `fps=1/${Number(args.every)}`, '-q:v', '2', path.join(tmp, 'f%04d.jpg')], { stdio: 'inherit' });
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    throw new Error(`ffmpeg failed (${err.message}). Install ffmpeg or pass --ffmpeg /path/to/ffmpeg`);
  }
  const frames = (await readdir(tmp)).filter((f) => f.endsWith('.jpg')).sort();
  const base = `${args.prefix}${slug(path.basename(file))}`;
  const ids = frames.map((_, i) => `${base}-${String(i + 1).padStart(3, '0')}`);
  for (const [i, frame] of frames.entries()) {
    const links = [];
    if (i > 0) links.push({ nodeId: ids[i - 1], yaw: 180 });
    if (i < frames.length - 1) links.push({ nodeId: ids[i + 1], yaw: 0 });
    await addPanorama(path.join(tmp, frame), ids[i], `${title(path.basename(file))} ${i + 1}`, links);
  }
  await rm(tmp, { recursive: true, force: true });
}

const input = path.resolve(args.in);
const files = statSync(input).isDirectory()
  ? (await readdir(input)).sort().map((f) => path.join(input, f))
  : [input];

let count = 0;
for (const file of files) {
  if (IMAGE.test(file)) {
    if (await addPanorama(file, `${args.prefix}${slug(path.basename(file))}`, title(path.basename(file)))) count++;
  } else if (VIDEO.test(file)) {
    await ingestVideo(file);
    count++;
  } else if (/\.ins[vp]$/i.test(file)) {
    console.warn(`skip  ${path.basename(file)}: export it from Insta360 Studio as an equirectangular JPG/MP4 first`);
  }
}

if (!tour.startNodeId || !nodes.has(tour.startNodeId)) tour.startNodeId = tour.nodes[0]?.id;
await writeFile(tourFile, JSON.stringify(tour, null, 2) + '\n');
console.log(`${count} capture(s) processed. Next: npm run dev, open /?edit, place each panorama on the plan and pin products.`);
if (!existsSync(path.join(root, 'plans'))) console.log('Tip: add floor plan images under plans/ and reference them in tour.json floors.');
