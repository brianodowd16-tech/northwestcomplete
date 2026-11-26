import "server-only";
import { decryptSecret, googleToken, postFacebook, postGoogle, postInstagram, type SocialChannel } from "@round/core";
import { loadIntegration } from "@round/db/integrations";
import { recordError } from "@round/db/platform";
import { duePosts, markPost, planNetworkPosts, planVenuePosts, venuesWithSocial } from "@round/db/social";
import { venueById } from "@round/db/services";
import { appUrl, googleApp, secretsKey } from "./server";

type Post = Awaited<ReturnType<typeof duePosts>>[number];

/** Complete's own network accounts (county round-ups), from the environment. */
export function networkTargets() {
  const { NETWORK_META_PAGE_ID: pageId, NETWORK_META_PAGE_TOKEN: pageToken, NETWORK_IG_USER_ID: igUserId } = process.env;
  const channels: SocialChannel[] = [];
  if (pageId && pageToken) channels.push("facebook");
  if (pageId && pageToken && igUserId) channels.push("instagram");
  return { channels, meta: pageId && pageToken ? { pageId, pageToken, igUserId: igUserId ?? null } : null };
}

/** Publishes one post to each of its channels; any channel failing marks the post failed (with the others' results kept). */
export async function publishPost(p: Post, fetchImpl: typeof fetch = fetch) {
  const key = secretsKey();
  const results: Record<string, string> = { ...(p.results ?? {}) };
  const errors: string[] = [];
  const image = `${appUrl()}/api/social/image/${p.id}.jpg`;
  let meta: { pageId: string; pageToken: string; igUserId?: string | null } | null = null;
  let google: { location: string; refreshToken: string } | null = null;
  if (p.venueId) {
    const venue = await venueById(p.venueId);
    const m = await loadIntegration(venue, "meta"), g = await loadIntegration(venue, "google_business");
    if (m?.secretEnc && key) meta = { pageId: (m.config as Record<string, string>).pageId, pageToken: decryptSecret(m.secretEnc, key), igUserId: (m.config as Record<string, string>).igUserId || null };
    if (g?.secretEnc && key) google = { location: (g.config as Record<string, string>).location, refreshToken: decryptSecret(g.secretEnc, key) };
  } else meta = networkTargets().meta;
  for (const ch of p.channels) {
    if (results[ch]) continue; // already went out on an earlier try
    try {
      if (ch === "facebook") {
        if (!meta) throw new Error("Facebook isn't connected");
        results.facebook = await postFacebook(meta, { text: p.text, link: p.link, imageUrl: image }, fetchImpl);
      } else if (ch === "instagram") {
        if (!meta?.igUserId) throw new Error("Instagram isn't connected");
        results.instagram = await postInstagram(meta, { text: p.text, imageUrl: image, collaborators: p.collaborators }, fetchImpl);
      } else if (ch === "google") {
        const app = googleApp();
        if (!google || !app) throw new Error("Google Business Profile isn't connected");
        const { access_token } = await googleToken(app, { grant_type: "refresh_token", refresh_token: google.refreshToken }, fetchImpl);
        results.google = await postGoogle(access_token, google.location, { text: p.text, link: p.link }, fetchImpl);
      }
    } catch (e) {
      errors.push(`${ch}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await markPost(p.id, errors.length === 0, results, errors.join("; ") || null);
  return errors.length === 0;
}

/** The posting job: plan from each venue's data, then publish what's due. */
export async function socialTick() {
  let planned = 0, posted = 0;
  for (const v of await venuesWithSocial()) {
    try { planned += await planVenuePosts(v, appUrl()); } catch (e) { await recordError(e, `social plan ${v.slug}`); }
  }
  const net = networkTargets();
  if (net.channels.length) planned += await planNetworkPosts(appUrl(), net.channels, process.env.NETWORK_AUTOPUBLISH === "1");
  for (const p of await duePosts()) if (await publishPost(p).catch(async (e) => (await recordError(e, "social publish"), false))) posted++;
  return planned || posted ? { planned, posted } : 0;
}
