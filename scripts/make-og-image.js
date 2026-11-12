'use strict';

// Renders public/img/og.png, the 1200x630 card shown when the site is shared on WhatsApp or Facebook.
// Needs Playwright. Usage: node scripts/make-og-image.js
// (Pass PLAYWRIGHT_PATH if Playwright is installed globally rather than in this project.)

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/draw.json'), 'utf8'));
const crest = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/img/crest.png')).toString('base64');
const fromPrice = Math.min(...config.bundles.map((b) => b.price)) / 100;
const drawDate = new Date(config.drawDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', timeZone: 'Europe/Dublin' });

const html = `<!doctype html>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: "Bricolage Grotesque", sans-serif; color: #f3f8f4;
    background: radial-gradient(700px 400px at 90% 0%, rgba(255,61,72,.28), transparent 60%),
                radial-gradient(600px 400px at 0% 100%, rgba(31,169,90,.28), transparent 60%), #06120c; }
  .wrap { position: relative; display: grid; grid-template-columns: 1fr 360px; gap: 24px; align-items: center; height: 100%; padding: 64px 72px; }
  .eyebrow { font: 700 22px "JetBrains Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: #ff3d48; }
  h1 { margin-top: 18px; font-size: 104px; line-height: .95; letter-spacing: -.04em; font-weight: 800; }
  h1 span { color: #ff3d48; }
  p { margin-top: 26px; font-size: 32px; font-weight: 600; color: #a8bfb1; }
  .price { display: inline-block; margin-top: 30px; padding: 14px 26px; border-radius: 999px; font-size: 32px; font-weight: 800;
    background: linear-gradient(100deg, #c4141f, #ff3d48); color: #fff; }
  .club { display: grid; justify-items: center; gap: 18px; text-align: center; }
  .club img { width: 260px; filter: drop-shadow(0 20px 40px rgba(0,0,0,.5)); }
  .club b { font-size: 28px; }
  .club small { display: block; font-size: 22px; color: #a8bfb1; }
</style>
<div class="wrap">
  <div>
    <div class="eyebrow">${config.drawName} 2026</div>
    <h1>Fly to Oz.<br><span>Or fill the tank.</span></h1>
    <p>${config.prizes.length} prizes · Draw ${drawDate}</p>
    <div class="price">Lines from €${fromPrice}</div>
  </div>
  <div class="club"><img src="${crest}" alt=""><div><b>${config.clubName}</b><small>${config.address}</small></div></div>
</div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(root, 'public/img/og.png');
  await page.screenshot({ path: out, type: 'png' });
  await browser.close();
  console.log('wrote', out);
})();
