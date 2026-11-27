import { IRISH_COUNTIES } from "@round/core";
import { saveVenueCommunity } from "@round/db/groups";
import { setSongPrice } from "@round/db/songs";
import { disconnectSocial, manualPost, planVenuePosts, saveSocialRules, updateVenuePost } from "@round/db/social";
import { managerFor } from "@/lib/office";
import { appUrl, errorJson, json, secretsKey } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as Record<string, string>;
    const key = secretsKey();
    switch (b.action) {
      case "community": {
        const county = b.county && (IRISH_COUNTIES as readonly string[]).includes(b.county) ? b.county : null;
        await saveVenueCommunity(m.venue, { county, shareNetwork: b.shareNetwork === "on", songRequests: b.songRequests === "on" });
        const price = String(b.songPrice ?? "").trim();
        await setSongPrice(m.venue, price ? Math.round(Number(price.replace(",", ".")) * 100) : null);
        return json({ message: "Saved" });
      }
      case "rules":
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        await saveSocialRules(m.venue, { autoPublish: b.autoPublish === "on", events: b.events === "on", eventHoursBefore: Number(b.hours || 6), games: b.games === "on", weekly: b.weekly === "on", newFood: b.newFood === "on" }, key);
        return json({ message: b.autoPublish === "on" ? "Posts will go out automatically" : "Posts will wait for your approval" });
      case "plan": {
        const n = await planVenuePosts(m.venue, appUrl());
        return json({ message: n ? `${n} new ${n === 1 ? "post" : "posts"} planned` : "Nothing new to plan right now" });
      }
      case "approve": await updateVenuePost(m.venue, b.id, { status: "approved", ...(b.text ? { text: b.text } : {}) }); return json({ message: "Approved: it goes out at its time" });
      case "skip": await updateVenuePost(m.venue, b.id, { status: "skipped" }); return json({ message: "Skipped" });
      case "edit": await updateVenuePost(m.venue, b.id, { text: b.text }); return json({ message: "Saved" });
      case "manual": await manualPost(m.venue, { text: b.text, title: b.title, scheduledFor: b.when ? new Date(b.when) : undefined }); return json({ message: b.when ? "Scheduled" : "Posting in the next few minutes" });
      case "disconnect": await disconnectSocial(m.venue, b.kind === "google" ? "google_business" : "meta"); return json({ message: "Disconnected" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
