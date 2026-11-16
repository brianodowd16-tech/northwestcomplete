'use strict';

// Builds the site for Hostinger (or any PHP host) as a folder and a zip to upload to public_html.
// Orders go through the site's own order form. With SumUp keys in config.php buyers pay by card on the
// page; without them they order and pay the club. Either way /admin.php shows orders and prints the
// online cards. No Node.js or Stripe needed.
//
// Usage: node scripts/build-hostinger.js [--password <admin password>]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { applyPaymentCopy } = require('./pay-later-copy');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist', 'hostinger');
const zipPath = path.join(root, 'dist', 'stmichaels-draw-hostinger.zip');
const pwIndex = process.argv.indexOf('--password');
const password = pwIndex > -1 ? process.argv[pwIndex + 1] : crypto.randomBytes(9).toString('base64url');

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const config = JSON.parse(read('config/draw.json'));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Static files: everything in public/ except the Node-only admin script.
fs.cpSync(path.join(root, 'public'), outDir, { recursive: true, filter: (src) => !src.endsWith('admin-print.js') });

// The public draw settings the pages and order.php read.
const { clubName, clubShort, clubArea, address, mapsUrl, drawName, currency, drawDate, drawLocation, salesCloseDate,
  facebookUrl, contactEmail, licenceNote, bundles, prizes, maxBundlesPerOrder, maxOrderTotal, fullTankLines, linesPerCard } = config;
fs.writeFileSync(path.join(outDir, 'draw.json'), JSON.stringify({
  clubName, clubShort, clubArea, address, mapsUrl, drawName, currency, drawDate, drawLocation, salesCloseDate,
  facebookUrl, contactEmail, licenceNote, bundles, prizes, maxBundlesPerOrder, maxOrderTotal, fullTankLines, linesPerCard,
  salesOpen: true, demoMode: false,
}, null, 2));

const settings = (mode) => `<script>window.FUEL_DRAW = { drawUrl: "/draw.json", orderUrl: "/order.php", confirmUrl: "/confirm.php", mode: ${mode} };</script>\n  `;
const fixLinks = (html) => html.replaceAll('href="/terms"', 'href="/terms.html"');

// index.php serves the card-payment page when SumUp is set up in config.php, otherwise the pay-the-club
// page, and fills in the site's own address for the WhatsApp/Facebook share tags.
const page = (mode) => {
  const html = fixLinks(applyPaymentCopy(mode, 'index.html', read('public/index.html')))
    .replace('<script src="/app.js" type="module"></script>', `${settings(`"${mode === 'card' ? 'card' : 'pay-later'}"`)}<script src="/app.js" type="module"></script>`);
  if (html.includes('<?')) throw new Error('index.html must not contain "<?"');
  return html;
};
fs.rmSync(path.join(outDir, 'index.html'));
fs.writeFileSync(path.join(outDir, 'index.php'), `<?php
require __DIR__ . '/lib.php';
ob_start();
if (sumup_enabled()) { ?>${page('card')}<?php } else { ?>${page('later')}<?php }
echo str_replace('__PUBLIC_URL__', site_url(), ob_get_clean());
`);

fs.writeFileSync(path.join(outDir, 'terms.html'), fixLinks(applyPaymentCopy('terms', 'terms.html', read('public/terms.html'))));
fs.writeFileSync(path.join(outDir, 'success.html'), fixLinks(read('public/success.html'))
  .replace('<script src="/success.js" type="module"></script>', `${settings('null')}<script src="/success.js" type="module"></script>`));

// PHP back end.
for (const f of ['lib.php', 'order.php', 'confirm.php', 'sumup-webhook.php', 'admin.php', '.htaccess']) fs.copyFileSync(path.join(root, 'hostinger', f), path.join(outDir, f));
fs.mkdirSync(path.join(outDir, 'data'));
for (const f of ['.htaccess', 'index.html']) fs.copyFileSync(path.join(root, 'hostinger', 'data', f), path.join(outDir, 'data', f));
fs.writeFileSync(path.join(outDir, 'config.php'), read('hostinger/config.sample.php').replace('__ADMIN_PASSWORD__', password));

fs.copyFileSync(path.join(root, 'docs', 'HOSTINGER.md'), path.join(outDir, 'HOW-TO-UPLOAD.md'));
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-qr', zipPath, '.'], { cwd: outDir });
console.log(`Built ${path.relative(root, outDir)} and ${path.relative(root, zipPath)}`);
console.log(`Admin password (in config.php): ${password}`);
