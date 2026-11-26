// Social media automation: what each venue posts, written from its own data (events,
// tonight's games, new food), and the clients for Facebook/Instagram (Meta Graph API)
// and Google Business Profile. Posts never promote alcohol prices or offers: anything
// that reads like a drinks promotion waits for a manager to approve it.

export type SocialChannel = "facebook" | "instagram" | "google";

export interface SocialRules {
  /** publish automatically; when false every post waits as a draft for approval */
  autoPublish: boolean;
  events: boolean;
  /** hours before an event to post it */
  eventHoursBefore: number;
  games: boolean;
  weekly: boolean;
  newFood: boolean;
}

export const DEFAULT_SOCIAL_RULES: SocialRules = { autoPublish: false, events: true, eventHoursBefore: 6, games: true, weekly: true, newFood: false };

/** Wording that reads like a drinks promotion. Such posts are never published without a manager. */
const DRINKS_PROMO = /happy hour|\b\d\s*for\s*\d\b|two for one|bogof|cheap (pints|drinks|shots)|€\s?\d+(\.\d\d)? (pints?|shots?|cocktails?|drinks?)|(pints?|shots?|cocktails?|drinks?) (for|at) €|free (shots?|pints?|drinks?)|bottomless|drink(s)? deals?|all you can drink|shots? (deal|offer|special)|drinking (game|challenge)/i;
export const looksLikeDrinksPromo = (text: string) => DRINKS_PROMO.test(text);

export interface DraftPost {
  sourceKey: string;
  text: string;
  link: string;
  imageTitle: string;
  imageSubtitle: string;
  scheduledFor: Date;
  needsApproval: boolean;
}

const hashtag = (s: string | null | undefined) => (s ? "#" + s.replace(/[^\p{L}\p{N}]/gu, "") : "");
const when = (d: Date, tz: string) => d.toLocaleString("en-IE", { timeZone: tz, weekday: "long", hour: "2-digit", minute: "2-digit" });

export function eventPost(v: { name: string; slug: string; county: string | null; timezone: string }, e: { id: string; title: string; details: string; start: Date; kind: string; partnerName?: string | null }, appUrl: string, hoursBefore: number): DraftPost {
  const icon = { music: "🎶", sport: "📺", quiz: "🧠", comedy: "🎤", other: "📅" }[e.kind] ?? "📅";
  const text = [
    `${icon} ${e.title} at ${v.name}${e.partnerName ? ` with ${e.partnerName}` : ""}, ${when(e.start, v.timezone)}.`,
    e.details ? e.details.slice(0, 280) : "",
    `Book a table or see what's on: ${appUrl}/v/${v.slug}/events`,
    [hashtag(v.county), "#WhatsOn", e.kind === "music" ? "#LiveMusic" : e.kind === "sport" ? "#Sport" : ""].filter(Boolean).join(" "),
  ].filter(Boolean).join("\n\n");
  return {
    sourceKey: `event:${e.id}:${e.start.toISOString().slice(0, 10)}`,
    text,
    link: `${appUrl}/v/${v.slug}/events`,
    imageTitle: e.title,
    imageSubtitle: `${v.name} · ${when(e.start, v.timezone)}`,
    scheduledFor: new Date(e.start.getTime() - hoursBefore * 3_600_000),
    needsApproval: looksLikeDrinksPromo(`${e.title} ${e.details}`),
  };
}

export function gamesPost(v: { name: string; slug: string; county: string | null; timezone: string }, date: string, games: { title: string; start: Date }[], appUrl: string, postAt: Date): DraftPost | null {
  if (!games.length) return null;
  const lines = games.slice(0, 5).map((g) => `• ${g.start.toLocaleTimeString("en-IE", { timeZone: v.timezone, hour: "2-digit", minute: "2-digit" })} ${g.title}`);
  return {
    sourceKey: `games:${date}`,
    text: `📺 On the screens at ${v.name} today:\n\n${lines.join("\n")}\n\nBook a table for the match: ${appUrl}/v/${v.slug}/events\n\n${[hashtag(v.county), "#Sport", "#WatchItHere"].filter(Boolean).join(" ")}`,
    link: `${appUrl}/v/${v.slug}/events`,
    imageTitle: "On the screens today",
    imageSubtitle: `${v.name} · ${games.length} ${games.length === 1 ? "game" : "games"}`,
    scheduledFor: postAt,
    needsApproval: false,
  };
}

export function weeklyPost(v: { name: string; slug: string; county: string | null; timezone: string }, week: string, items: { title: string; start: Date }[], appUrl: string, postAt: Date): DraftPost | null {
  if (!items.length) return null;
  const lines = items.slice(0, 8).map((o) => `• ${o.start.toLocaleString("en-IE", { timeZone: v.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" })} ${o.title}`);
  return {
    sourceKey: `weekly:${week}`,
    text: `This week at ${v.name}:\n\n${lines.join("\n")}\n\nFull calendar and bookings: ${appUrl}/v/${v.slug}/events\n\n${[hashtag(v.county), "#WhatsOn"].filter(Boolean).join(" ")}`,
    link: `${appUrl}/v/${v.slug}/events`,
    imageTitle: "This week",
    imageSubtitle: v.name,
    scheduledFor: postAt,
    needsApproval: items.some((i) => looksLikeDrinksPromo(i.title)),
  };
}

/** New food or soft-drink item. Alcohol items are never posted automatically. */
export function newItemPost(v: { name: string; slug: string }, item: { id: string; name: string; description: string; containsAlcohol: boolean }, appUrl: string, postAt: Date): DraftPost | null {
  if (item.containsAlcohol) return null;
  return {
    sourceKey: `item:${item.id}`,
    text: `New at ${v.name}: ${item.name}.${item.description ? ` ${item.description.slice(0, 200)}` : ""}\n\nOrder from your table: ${appUrl}/v/${v.slug}`,
    link: `${appUrl}/v/${v.slug}`,
    imageTitle: item.name,
    imageSubtitle: `New at ${v.name}`,
    scheduledFor: postAt,
    needsApproval: looksLikeDrinksPromo(`${item.name} ${item.description}`),
  };
}

/** Complete's own accounts: what's on this week across opted-in venues in one county. */
export function networkPost(county: string, week: string, picks: { venue: string; slug: string; title: string; start: Date; tz: string }[], appUrl: string, postAt: Date): DraftPost | null {
  if (picks.length < 2) return null;
  const lines = picks.slice(0, 8).map((p) => `• ${p.start.toLocaleString("en-IE", { timeZone: p.tz, weekday: "short", hour: "2-digit", minute: "2-digit" })} ${p.title} · ${p.venue}`);
  return {
    sourceKey: `network:${county}:${week}`,
    text: `Out in ${county} this week:\n\n${lines.join("\n")}\n\nEvery venue's calendar: ${appUrl}/me\n\n#${county.replace(/\s/g, "")} #WhatsOn`,
    link: `${appUrl}/me`,
    imageTitle: `Out in ${county}`,
    imageSubtitle: `${new Set(picks.map((p) => p.slug)).size} venues on Complete`,
    scheduledFor: postAt,
    needsApproval: picks.some((p) => looksLikeDrinksPromo(p.title)),
  };
}

// ---------------------------------------------------------------- clients

export const META_GRAPH = "https://graph.facebook.com/v26.0";
export const META_SCOPES = "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management";
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/business.manage";

export interface MetaTarget { pageId: string; pageToken: string; igUserId?: string | null }

async function call<T>(fetchImpl: typeof fetch, url: string, init: RequestInit, what: string): Promise<T> {
  const res = await fetchImpl(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** Posts to a Facebook Page: a photo with caption when there's an image, else a link post. */
export async function postFacebook(t: MetaTarget, p: { text: string; link?: string | null; imageUrl?: string | null }, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = p.imageUrl ? new URLSearchParams({ url: p.imageUrl, caption: p.text, access_token: t.pageToken }) : new URLSearchParams({ message: p.text, ...(p.link ? { link: p.link } : {}), access_token: t.pageToken });
  const r = await call<{ id?: string; post_id?: string }>(fetchImpl, `${META_GRAPH}/${t.pageId}/${p.imageUrl ? "photos" : "feed"}`, { method: "POST", body }, "Facebook post");
  return r.post_id ?? r.id ?? "";
}

/** Instagram needs an image: create a media container (with co-host collaborators), then publish it. */
export async function postInstagram(t: MetaTarget, p: { text: string; imageUrl: string; collaborators?: string[] }, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!t.igUserId) throw new Error("No Instagram business account is linked to this Page");
  const params = new URLSearchParams({ image_url: p.imageUrl, caption: p.text.slice(0, 2200), access_token: t.pageToken });
  if (p.collaborators?.length) params.set("collaborators", JSON.stringify(p.collaborators.slice(0, 5)));
  const c = await call<{ id: string }>(fetchImpl, `${META_GRAPH}/${t.igUserId}/media`, { method: "POST", body: params }, "Instagram media");
  const r = await call<{ id: string }>(fetchImpl, `${META_GRAPH}/${t.igUserId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: t.pageToken }) }, "Instagram publish");
  return r.id;
}

/** Posts an update to a Google Business Profile location (v4 localPosts). */
export async function postGoogle(accessToken: string, location: string, p: { text: string; link?: string | null }, fetchImpl: typeof fetch = fetch): Promise<string> {
  const r = await call<{ name: string }>(fetchImpl, `https://mybusiness.googleapis.com/v4/${location}/localPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ languageCode: "en-IE", summary: p.text.slice(0, 1500), topicType: "STANDARD", ...(p.link ? { callToAction: { actionType: "LEARN_MORE", url: p.link } } : {}) }),
  }, "Google post");
  return r.name;
}

// ---------------------------------------------------------------- connecting accounts

export interface OAuthApp { clientId: string; clientSecret: string; redirectUri: string }

export function metaAuthorizeUrl(app: OAuthApp, state: string) {
  return `https://www.facebook.com/v26.0/dialog/oauth?${new URLSearchParams({ client_id: app.clientId, redirect_uri: app.redirectUri, state, scope: META_SCOPES, response_type: "code" })}`;
}

/**
 * Exchanges the login code for a long-lived user token, then lists the Pages the manager
 * granted, each with its own Page token and linked Instagram business account.
 */
export async function metaPages(app: OAuthApp, code: string, fetchImpl: typeof fetch = fetch) {
  const q = (p: Record<string, string>) => new URLSearchParams(p).toString();
  const short = await call<{ access_token: string }>(fetchImpl, `${META_GRAPH}/oauth/access_token?${q({ client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: app.redirectUri, code })}`, {}, "Facebook login");
  const long = await call<{ access_token: string }>(fetchImpl, `${META_GRAPH}/oauth/access_token?${q({ grant_type: "fb_exchange_token", client_id: app.clientId, client_secret: app.clientSecret, fb_exchange_token: short.access_token })}`, {}, "Facebook token");
  const pages = await call<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(
    fetchImpl, `${META_GRAPH}/me/accounts?${q({ fields: "id,name,access_token,instagram_business_account{id,username}", access_token: long.access_token })}`, {}, "Facebook Pages",
  );
  return pages.data.map((p) => ({ pageId: p.id, pageName: p.name, pageToken: p.access_token, igUserId: p.instagram_business_account?.id ?? null, igUsername: p.instagram_business_account?.username ?? null }));
}

export function googleAuthorizeUrl(app: OAuthApp, state: string) {
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: app.clientId, redirect_uri: app.redirectUri, state, scope: GOOGLE_SCOPES, response_type: "code", access_type: "offline", prompt: "consent" })}`;
}

export async function googleToken(app: OAuthApp, body: Record<string, string>, fetchImpl: typeof fetch = fetch) {
  return call<{ access_token: string; refresh_token?: string }>(fetchImpl, "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...body }),
  }, "Google token");
}

/** Code → refresh token, and the Business Profile locations the account manages. */
export async function googleLocations(app: OAuthApp, code: string, fetchImpl: typeof fetch = fetch) {
  const tok = await googleToken(app, { grant_type: "authorization_code", code, redirect_uri: app.redirectUri }, fetchImpl);
  if (!tok.refresh_token) throw new Error("Google didn't return a refresh token: remove Complete's access in your Google account and connect again");
  const auth = { headers: { Authorization: `Bearer ${tok.access_token}` } };
  const accounts = await call<{ accounts?: { name: string }[] }>(fetchImpl, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts", auth, "Google accounts");
  const out: { location: string; title: string }[] = [];
  for (const a of accounts.accounts ?? []) {
    const locs = await call<{ locations?: { name: string; title: string }[] }>(fetchImpl, `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=100`, auth, "Google locations");
    // Posting uses the v4 path accounts/{a}/locations/{l}.
    for (const l of locs.locations ?? []) out.push({ location: `${a.name}/${l.name}`, title: l.title });
  }
  return { refreshToken: tok.refresh_token, locations: out };
}

/** The location whose name best matches the venue (exact, then contains), else the first. */
export function pickLocation(locs: { location: string; title: string }[], venueName: string) {
  const n = venueName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return locs.find((l) => norm(l.title) === n) ?? locs.find((l) => norm(l.title).includes(n) || n.includes(norm(l.title))) ?? locs[0] ?? null;
}
