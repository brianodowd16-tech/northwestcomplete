import { parseEuro } from "@round/core";
import * as g from "@round/db/groups";
import { currentGuest, errorJson, json } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };

/** Everything the group screen needs; `since` returns only newer chat messages (polling). */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const id = (await ctx.params).id;
    const since = new URL(req.url).searchParams.get("since");
    if (since) return json({ messages: await g.messages(id, guest.id, new Date(since)) });
    const [detail, messages, sessions, money, orders] = await Promise.all([g.groupDetail(id, guest.id), g.messages(id, guest.id), g.groupSessions(id, guest.id), g.groupMoney(id, guest.id), g.recentOrdersToSplit(guest.id)]);
    return json({ detail, messages, sessions, money, orders });
  } catch (e) {
    return errorJson(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const id = (await ctx.params).id;
    const b = (await req.json()) as Record<string, unknown>;
    const s = (k: string) => String(b[k] ?? "");
    switch (b.action) {
      case "message": return json({ posted: (await g.postMessage(guest, id, s("body"))).id });
      case "report": await g.reportMessage(guest, s("messageId")); return json({ ok: true, message: "Reported and hidden" });
      case "leave": await g.leaveGroup(guest, id); return json({ ok: true });
      case "remove": await g.removeMember(guest, id, s("customerId")); return json({ ok: true, message: "Removed. The invite link has changed." });
      case "playlist": await g.setPlaylist(guest, id, s("url")); return json({ ok: true, message: s("url") ? "Playlist shared" : "Playlist removed" });
      case "session": {
        const startsAt = b.startsAt ? new Date(s("startsAt")) : undefined;
        const r = await g.createSession(guest, id, { venueSlug: s("venue"), kind: b.kind === "party" ? "party" : "session", title: s("title"), startsAt, hours: Number(b.hours) || undefined, book: Number(b.book) || 0 });
        return json({ id: r.id, message: r.kind === "session" ? "You're out! Orders you place there show up for the group." : "Party planned and the group's been told" });
      }
      case "rsvp": await g.rsvp(guest, s("sessionId"), b.answer === "maybe" ? "maybe" : b.answer === "no" ? "no" : "going"); return json({ ok: true });
      case "cancelSession": await g.cancelSession(guest, s("sessionId")); return json({ ok: true, message: "Cancelled" });
      case "song": await g.requestSong(guest, s("sessionId"), { title: s("title"), link: s("link") }); return json({ ok: true, message: "Sent to the venue" });
      case "split": {
        const lines = Array.isArray(b.lines) ? (b.lines as { name: string; amount: string; ticket?: boolean }[]).map((l) => ({ name: String(l.name ?? ""), cents: parseEuro(String(l.amount ?? "")), ticket: !!l.ticket })) : undefined;
        const amounts = b.amounts && typeof b.amounts === "object" ? Object.fromEntries(Object.entries(b.amounts as Record<string, string>).map(([k, v]) => [k, parseEuro(String(v || "0"))])) : undefined;
        const r = await g.createSplit(guest, id, {
          title: s("title"), method: b.method === "items" ? "items" : b.method === "custom" ? "custom" : "equal",
          people: Array.isArray(b.people) ? (b.people as string[]).map(String) : [], orderId: s("orderId") || undefined, sessionId: s("sessionId") || undefined,
          totalCents: b.total ? parseEuro(s("total")) : undefined, lines, claims: (b.claims as Record<string, string[]>) ?? undefined, amounts,
        });
        return json({ id: r.id, message: "Split shared with the group" });
      }
      case "paid": await g.markSharePaid(guest, s("shareId")); return json({ ok: true, message: "Marked as paid" });
      case "cover": await g.coverShare(guest, s("shareId")); return json({ ok: true, message: "Covered" });
      case "remind": await g.remindShare(guest, s("shareId")); return json({ ok: true, message: "Reminder sent in the chat" });
      case "cancelSplit": await g.cancelSplit(guest, s("splitId")); return json({ ok: true, message: "Split cancelled" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
