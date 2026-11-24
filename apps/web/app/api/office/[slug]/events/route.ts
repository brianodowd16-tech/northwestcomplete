import { deleteEvent, saveEvent, setAutoSports, setFplCode } from "@round/db/events";
import { parseEuro } from "@round/core";
import { managerFor } from "@/lib/office";
import { errorJson, json } from "@/lib/server";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as Record<string, unknown>;
    if (b.action === "autoSports") {
      await setAutoSports(m.venue, b.on === "on");
      return json({ message: b.on === "on" ? "Ireland's top games will be listed every day" : "Top games are off" });
    }
    if (b.action === "fpl") {
      await setFplCode(m.venue, str(b.code));
      return json({ message: str(b.code) ? "Fantasy league link is live" : "Fantasy league link removed" });
    }
    if (b.action === "delete") {
      await deleteEvent(m.venue, str(b.id));
      return json({ message: "Event removed" });
    }
    await saveEvent(m.venue, {
      id: str(b.id) || undefined,
      kind: str(b.kind),
      title: str(b.title),
      details: str(b.details),
      where: str(b.where),
      startsLocal: str(b.starts),
      durationMins: Math.round(Number(str(b.hours) || "2") * 60),
      repeatWeekly: b.repeatWeekly === "on",
      repeatUntil: str(b.repeatUntil) || null,
      coverCents: str(b.cover) ? parseEuro(str(b.cover)) : 0,
    });
    return json({ message: str(b.id) ? "Event saved" : "Added to What's on" });
  } catch (e) {
    return errorJson(e);
  }
}
