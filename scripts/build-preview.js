'use strict';

// Bundles the site into one self-contained HTML page with a mocked API, for sharing a clickable preview.
// Payments are simulated and no server is needed.
// Usage: node scripts/build-preview.js <output.html>

const fs = require('node:fs');
const { applyPayLaterCopy } = require('./pay-later-copy');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/build-preview.js <output.html>');
  process.exit(1);
}

function must(src, from, to) {
  if (!src.includes(from)) throw new Error(`build-preview: "${from}" not found`);
  return src.replace(from, to);
}
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const config = JSON.parse(read('config/draw.json'));

const body = (html) => html.split(/<body>/)[1].split(/<\/body>/)[0].replace(/<script[^>]*><\/script>/g, '');
// The preview shows the site as it runs on Hostinger: order now, pay the club.
const index = body(applyPayLaterCopy('index.html', read('public/index.html')));
const success = body(read('public/success.html'))
  .replace(/<canvas id="snow"[^>]*><\/canvas>/, '')
  .replace(/<header class="nav">[\s\S]*?<\/header>/, '');

const strip = (js) => js.replace(/^import .*$/m, '').replace(/^export /gm, '');
const shared = strip(read('public/shared.js'));
const app = must(strip(read('public/app.js')), 'const navigate = (url) => location.assign(url);', 'const navigate = (url) => showSuccess(url);');
const succ = strip(read('public/success.js'))
  .replace("startSnow($('#snow'));\nload();", '')
  .replace("const params = new URLSearchParams(location.search);\nconst id = params.get('session_id');\nconst ref = params.get('ref');",
    'let params = new URLSearchParams();\nlet id = null;\nlet ref = null;')
  .replace('const $ = (s) => document.querySelector(s);', '');

const mock = `
// ---- Preview-only mock of the server API (the real site talks to Node + Stripe) ----
const DRAW = ${JSON.stringify({ ...config, salesOpen: true, demoMode: false })};
const ORDERS = {};
const realFetch = window.fetch.bind(window);
window.FUEL_DRAW = { drawUrl: '/api/draw', orderUrl: '/order.php', mode: 'pay-later' };
let orderCount = 0;
window.fetch = async (url, opts = {}) => {
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  if (url === '/api/draw') return json(DRAW);
  if (url === '/api/checkout') {
    const { bundleId, quantity } = JSON.parse(opts.body);
    const b = DRAW.bundles.find((x) => x.id === bundleId);
    const n = b.lines * quantity;
    const oid = 'demo_' + Math.random().toString(36).slice(2);
    ORDERS[oid] = { lines: n, name: 'Mary Murphy', firstName: 'Mary', email: 'mary@example.com', amount: b.price * quantity, currency: 'eur', drawDate: DRAW.drawDate, drawLocation: DRAW.drawLocation, demo: true };
    await new Promise((r) => setTimeout(r, 700));
    return json({ url: '/success.html?session_id=' + oid });
  }
  if (url === '/order.php') {
    const o = JSON.parse(opts.body);
    const b = DRAW.bundles.find((x) => x.id === o.bundleId);
    await new Promise((r) => setTimeout(r, 600));
    return json({ ref: 'SM-' + String(++orderCount).padStart(4, '0'), lines: b.lines * o.quantity, amount: b.price * o.quantity,
      name: o.name, firstName: o.name.split(' ')[0], email: o.email, drawDate: DRAW.drawDate, drawLocation: DRAW.drawLocation,
      instructions: 'The club will contact you shortly to take payment.\\nYour lines go into the draw once payment is received.' });
  }
  const m = String(url).match(/^\\/api\\/order\\/(.+)$/);
  if (m) return ORDERS[decodeURIComponent(m[1])] ? json(ORDERS[decodeURIComponent(m[1])]) : json({ error: 'not found' }, 404);
  return realFetch(url, opts);
};
function showSuccess(url) {
  params = new URLSearchParams(url.split('?')[1]);
  id = params.get('session_id');
  ref = params.get('ref');
  document.getElementById('landing').hidden = true;
  document.getElementById('successView').hidden = false;
  scrollTo(0, 0);
  load();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="/"], a[href^="/#"]');
  if (!a) return;
  e.preventDefault();
  document.getElementById('successView').hidden = true;
  document.getElementById('landing').hidden = false;
  location.hash = '';
  document.querySelector(a.getAttribute('href').slice(1) || 'body')?.scrollIntoView();
});
`;

const fonts = read('public/index.html').match(/<link href="https:\/\/fonts[^>]+>/)[0];
const css = read('public/styles.css')
  .replace(/:root \{/, ':root {\n  color-scheme: dark;')
  .replace('.reveal { opacity: 0; transform: translateY(24px);', '.reveal { opacity: 1; transform: translateY(18px);')
  + '\n' + read('public/success.css')
  + `
/* preview */
.buybar { bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
.preview-flag { position: relative; z-index: 2; text-align: center; padding: .45rem 16px; font: 500 .75rem var(--mono); letter-spacing: .06em; background: var(--night-3); color: var(--frost-dim); }
`;

const html = `<title>St Michael's Fuel Draw</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${css}
</style>
<div class="preview-flag">PREVIEW · orders here are not saved or emailed</div>
<div id="landing">
${index}
</div>
<div id="successView" hidden>
<header class="nav"><a class="brand" href="/"><img class="brand__crest" src="/img/crest-96.png" alt="" width="44" height="44"><span class="brand__text"><strong>St Michael's</strong> <small>GAA &amp; LGFA · ${config.drawName.replace(/&/g, '&amp;')}</small></span></a></header>
${success}
</div>
<script>
${shared}
${mock}
${app}
${succ}
</script>
`;

// Images are inlined so the single file works anywhere.
const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public', f)).toString('base64');
const final = html.replace(/\/img\/([\w-]+\.png)/g, (_, f) => dataUri('img/' + f));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, final);
console.log('wrote', out, final.length, 'bytes');
