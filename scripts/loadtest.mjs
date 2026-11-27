// Load test: a busy night at MJ O'Connor's. Thousands of signed-in guests load menus and order,
// bar staff poll dockets, managers open the briefing. Run against a STAGING copy only: it places
// real (test-payment) orders. Needs load-test guests first:
//   psql "$DATABASE_URL" -c "insert into customer (phone,email,name,date_of_birth) select '+35387'||lpad(g::text,7,'0'),'lt'||g||'@x.ie','Load Tester '||g,'1990-01-01' from generate_series(1,3000) g"
// Then: SESSION_SECRET=... DATABASE_URL=... LOAD_BASES=https://a,https://b node scripts/loadtest.mjs 60 300
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
const BASES = (process.env.LOAD_BASES || "http://localhost:3000").split(","), SECRET = process.env.SESSION_SECRET, DUR = Number(process.argv[2] || 60) * 1000, CONC = Number(process.argv[3] || 200);
if (!SECRET) throw new Error("Set SESSION_SECRET to the target server's secret");
const sql = (q) => execFileSync("psql", [process.env.DATABASE_URL, "-Atc", q]).toString().trim();
const sign = (kind, id) => { const p = `${kind}:${id}:${Date.now() + 864e5}`; return `${p}.${createHmac("sha256", SECRET).update(p).digest("base64url")}`; };
const guests = sql("select id from customer where name like 'Load Tester%'").split("\n");
const staff = sql("select s.id from staff_user s join venue v on v.id=s.venue_id where v.slug='mj-oconnors' limit 1");
const token = sql("select qr_token from venue_table t join venue v on v.id=t.venue_id where v.slug='mj-oconnors' and t.number=1");
const soft = sql("select i.id from menu_item i join venue v on v.id=i.venue_id where v.slug='mj-oconnors' and i.name='Soft drink'");
const S = [
  ["menu page", 30, (g) => ({ url: `/v/mj-oconnors/t/${token}`, cookie: `round_guest=${sign("guest", g)}` })],
  ["venue home", 15, () => ({ url: "/v/mj-oconnors" })],
  ["what's on", 8, () => ({ url: "/v/mj-oconnors/events" })],
  ["place order", 20, (g) => ({ url: "/api/v/mj-oconnors/orders", method: "POST", cookie: `round_guest=${sign("guest", g)}`, body: { channel: "collect", lines: [{ menuItemId: soft, qty: 1 }], idempotencyKey: crypto.randomUUID() } })],
  ["rewards", 7, (g) => ({ url: "/v/mj-oconnors/rewards", cookie: `round_guest=${sign("guest", g)}` })],
  ["bar dockets", 12, () => ({ url: "/api/staff/dockets?station=bar", cookie: `round_staff=${sign("staff", staff)}` })],
  ["manager home", 4, () => ({ url: "/office/mj-oconnors", cookie: `round_staff=${sign("staff", staff)}` })],
  ["health", 4, () => ({ url: "/api/health" })],
];
const total = S.reduce((s, x) => s + x[1], 0), stats = Object.fromEntries(S.map(([n]) => [n, { t: [], err: 0, codes: {} }]));
const pick = () => { let r = Math.random() * total; for (const s of S) if ((r -= s[1]) < 0) return s; return S[0]; };
const end = Date.now() + DUR;
async function worker() {
  while (Date.now() < end) {
    const [name, , mk] = pick(); const r = mk(guests[Math.floor(Math.random() * guests.length)]); const t0 = performance.now();
    try {
      const res = await fetch(BASES[Math.floor(Math.random() * BASES.length)] + r.url, { method: r.method || "GET", headers: { ...(r.cookie ? { cookie: r.cookie } : {}), ...(r.body ? { "content-type": "application/json" } : {}), "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1` }, body: r.body ? JSON.stringify(r.body) : undefined });
      await res.arrayBuffer(); const st = stats[name]; st.t.push(performance.now() - t0); st.codes[res.status] = (st.codes[res.status] || 0) + 1; if (res.status >= 500) st.err++;
    } catch { stats[name].err++; }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
const q = (a, p) => a.length ? Math.round(a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]) : 0;
let n = 0; for (const [k, v] of Object.entries(stats)) { n += v.t.length; console.log(`${k.padEnd(13)} n=${String(v.t.length).padStart(5)} p50=${String(q(v.t, .5)).padStart(5)}ms p95=${String(q(v.t, .95)).padStart(5)}ms p99=${String(q(v.t, .99)).padStart(5)}ms 5xx/fail=${v.err} codes=${JSON.stringify(v.codes)}`); }
console.log(`TOTAL ${n} requests in ${DUR / 1000}s = ${Math.round(n / (DUR / 1000))} req/s at ${CONC} concurrent`);
