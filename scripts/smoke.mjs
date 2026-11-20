// Quick health check of a deployed storefront. Usage: SITE_URL=https://... npm run smoke
const site = (process.env.SITE_URL || "").replace(/\/$/, "");
if (!site) {
  console.error("Set SITE_URL");
  process.exit(1);
}

const checks = [
  ["home page", "/", (r, t) => r.status === 200 && t.includes("O'Dowd")],
  ["special offers", "/shop", (r, t) => r.status === 200 && t.includes("card__title")],
  ["range", "/range/stoves", (r) => r.status === 200],
  ["sitemap", "/sitemap.xml", (r, t) => r.status === 200 && t.includes("<urlset")],
  // An unsigned callback must be refused, which proves the endpoint is up and checking signatures.
  ["payment callback", "/api/mypos/notify", (r, t) => r.status === 400 && t === "ERROR", { method: "POST", body: "IPCmethod=IPCPurchaseNotify" }],
];

let failed = 0;
for (const [name, path, ok, init] of checks) {
  const started = Date.now();
  try {
    const r = await fetch(site + path, { redirect: "manual", ...init, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const t = await r.text();
    const pass = ok(r, t);
    console.log(`${pass ? "✓" : "✗"} ${name.padEnd(18)} ${r.status} ${Date.now() - started}ms`);
    if (!pass) failed++;
  } catch (err) {
    console.log(`✗ ${name.padEnd(18)} ${err.message}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
