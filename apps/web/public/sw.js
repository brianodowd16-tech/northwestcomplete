// The Snug Club service worker: installable app, fast repeat loads, and an offline page.
// Never caches API calls, payments or anything personal: those always go to the network.
const VERSION = "snug-v1";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Build assets are content-hashed: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/api/icon/")) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages: always fresh from the network (menus, prices and orders change); offline page if there's no connection.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
