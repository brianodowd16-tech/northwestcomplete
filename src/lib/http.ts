import "server-only";

const RETRY = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

/**
 * fetch() for the WordPress host. Its CDN briefly answers 403/429 to bursts
 * (e.g. during a build), so retry those with backoff before giving up.
 */
export async function wpFetch(url: string, init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {}, attempts = 4) {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", "ODowdsStorefront/1.0 (+https://odowdscarrick.com)");
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  let res: Response | undefined;
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, 400 * 2 ** i + Math.random() * 250));
    try {
      res = await fetch(url, { ...init, headers });
      if (!RETRY.has(res.status) || init.method === "POST") return res;
    } catch (err) {
      if (i === attempts - 1) throw err;
    }
  }
  return res!;
}
