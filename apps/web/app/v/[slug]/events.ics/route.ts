import { toIcs } from "@round/core";
import { whatsOn } from "@round/db/events";
import { venueBySlug } from "@round/db/services";
import { appUrl } from "@/lib/server";

/** The venue's What's on as a calendar file: one event (?e=key) or all of the next 8 weeks (subscribable). */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const v = await venueBySlug((await ctx.params).slug).catch(() => null);
  if (!v || v.status === "suspended") return new Response("Not found", { status: 404 });
  const one = new URL(req.url).searchParams.get("e");
  let occ = await whatsOn(v, new Date(Date.now() - 86_400_000), new Date(Date.now() + 56 * 86_400_000));
  if (one) occ = occ.filter((o) => o.key === one);
  const ics = toIcs(`${v.name}: What's on`, occ, { url: `${appUrl()}/v/${v.slug}/events`, location: [v.name, v.town].filter(Boolean).join(", "), host: new URL(appUrl()).host });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${one ? "attachment" : "inline"}; filename="${v.slug}-whats-on.ics"`,
      "Cache-Control": "public, max-age=900",
    },
  });
}
