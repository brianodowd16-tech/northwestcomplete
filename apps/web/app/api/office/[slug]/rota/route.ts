import { parseEuro } from "@round/core";
import { setHourlyRate } from "@round/db/growth";
import { copyWeek, deleteShift, publishWeek, saveShift, setPayrollRef, setSundayPremium } from "@round/db/rota";
import { mailConfigured, sendEmail } from "@/lib/mail";
import { managerFor } from "@/lib/office";
import { appUrl, errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const { venue } = m;
    const b = (await req.json()) as Record<string, string>;
    switch (b.action) {
      case "save":
        await saveShift(venue, { id: b.id || undefined, staffId: b.staffId, date: b.date, start: b.start, end: b.end, role: b.role, note: b.note });
        return json({ message: "Shift saved" });
      case "delete":
        await deleteShift(venue, b.id);
        return json({ message: "Shift removed" });
      case "copy":
        return json({ message: `${await copyWeek(venue, b.from, b.to)} shifts copied from last week` });
      case "publish": {
        const told = await publishWeek(venue, b.week);
        let emailed = 0;
        if (mailConfigured())
          for (const p of told) {
            if (!p.email) continue;
            const lines = p.shifts.map((s) => `${s.startsAt.toLocaleString("en-IE", { timeZone: venue.timezone, weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} to ${s.endsAt.toLocaleTimeString("en-IE", { timeZone: venue.timezone, hour: "2-digit", minute: "2-digit" })} (${s.role})`);
            await sendEmail(p.email, `Your shifts at ${venue.name}`, `Hi ${p.name.split(" ")[0]},\n\nYour shifts for the week:\n\n${lines.join("\n")}\n\nSee them any time: ${appUrl()}/staff/${venue.slug}/shifts\n`).then(() => emailed++).catch((e) => console.error("rota email", e));
          }
        return json({ message: `Rota published to ${told.length} ${told.length === 1 ? "person" : "people"}${emailed ? ` (${emailed} emailed)` : ""}` });
      }
      case "person":
        if (b.rate) await setHourlyRate(venue, b.staffId, parseEuro(b.rate));
        await setPayrollRef(venue, b.staffId, b.payrollRef ?? "");
        return json({ message: "Saved" });
      case "sunday":
        await setSundayPremium(venue, Number(b.pct || 0));
        return json({ message: "Sunday premium saved" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
