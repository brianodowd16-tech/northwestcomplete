// Checks a tour for broken links, unknown SKUs and missing files.
//
//   node scripts/validate-tour.mjs [--tour odowds]

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateTour } from '../src/tour-model.js';

const { values: args } = parseArgs({ options: { tour: { type: 'string', default: 'odowds' } } });
const root = path.resolve('public/tours', args.tour);
const tour = JSON.parse(await readFile(path.join(root, 'tour.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(root, 'products.json'), 'utf8'));

const { errors, warnings } = validateTour(tour, catalog);
for (const node of tour.nodes) {
  for (const file of [node.panorama, node.thumbnail].filter(Boolean)) {
    if (!existsSync(path.join(root, file))) errors.push(`${node.id}: file not found ${file}`);
  }
}
for (const floor of tour.floors ?? []) {
  if (floor.plan && !existsSync(path.join(root, floor.plan))) errors.push(`floor ${floor.id}: plan not found ${floor.plan}`);
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`error ${e}`);
console.log(`${tour.nodes.length} nodes, ${catalog.products.length} products, ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
