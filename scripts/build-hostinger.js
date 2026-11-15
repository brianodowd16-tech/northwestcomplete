'use strict';

// Builds the site for Hostinger (or any PHP host) as a folder and a zip to upload to public_html.
// Orders are taken as "order now, pay the club": saved on the server, emailed to the club and the buyer,
// and marked paid in /admin.php. No Node.js or Stripe needed.
//
// Usage: node scripts/build-hostinger.js [--password <admin password>]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { applyPayLaterCopy } = require('./pay-later-copy');

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

const siteSettings = '<script>window.FUEL_DRAW = { drawUrl: "/draw.json", orderUrl: "/order.php", mode: "pay-later" };</script>\n  ';
const fixLinks = (html) => html.replaceAll('href="/terms"', 'href="/terms.html"');

// index.php fills in the site's own address for the WhatsApp/Facebook share tags.
let index = fixLinks(applyPayLaterCopy('index.html', read('public/index.html')))
  .replace('<script src="/app.js" type="module"></script>', `${siteSettings}<script src="/app.js" type="module"></script>`);
if (index.includes('<?')) throw new Error('index.html must not contain "<?"');
fs.rmSync(path.join(outDir, 'index.html'));
fs.writeFileSync(path.join(outDir, 'index.php'), `<?php
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' ? 'https' : 'http';
$site = $scheme . '://' . preg_replace('/[^a-z0-9.\\-:]/i', '', $_SERVER['HTTP_HOST'] ?? '');
ob_start();
?>${index}<?php echo str_replace('__PUBLIC_URL__', $site, ob_get_clean());
`);

fs.writeFileSync(path.join(outDir, 'terms.html'), fixLinks(applyPayLaterCopy('terms.html', read('public/terms.html'))));
fs.writeFileSync(path.join(outDir, 'success.html'), fixLinks(read('public/success.html'))
  .replace('<script src="/success.js" type="module"></script>', `${siteSettings}<script src="/success.js" type="module"></script>`));

// PHP back end.
for (const f of ['lib.php', 'order.php', 'admin.php', '.htaccess']) fs.copyFileSync(path.join(root, 'hostinger', f), path.join(outDir, f));
fs.mkdirSync(path.join(outDir, 'data'));
for (const f of ['.htaccess', 'index.html']) fs.copyFileSync(path.join(root, 'hostinger', 'data', f), path.join(outDir, 'data', f));
fs.writeFileSync(path.join(outDir, 'config.php'), read('hostinger/config.sample.php').replace('__ADMIN_PASSWORD__', password));

fs.copyFileSync(path.join(root, 'docs', 'HOSTINGER.md'), path.join(outDir, 'HOW-TO-UPLOAD.md'));
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-qr', zipPath, '.'], { cwd: outDir });
console.log(`Built ${path.relative(root, outDir)} and ${path.relative(root, zipPath)}`);
console.log(`Admin password (in config.php): ${password}`);
