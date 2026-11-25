import { addTeamMember, removeTeamMember } from "@round/db/admin";
import { createStaffToken } from "@round/db/platform";
import { sendEmail } from "@/lib/mail";
import { managerFor } from "@/lib/office";
import { appUrl, errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as { name?: string; email?: string; role?: string };
    const added = await addTeamMember(m.venue, m.staff, { name: b.name ?? "", email: b.email ?? "", role: b.role ?? "" });
    // The new person gets a link to set their own password (valid 7 days); the temporary password stays as a fallback.
    const token = await createStaffToken(added.staffId, "invite");
    await sendEmail(
      added.email,
      `${m.staff.name} added you to ${m.venue.name} on Complete`,
      `Hi ${added.name.split(" ")[0]},\n\n${m.staff.name} has added you to the team at ${m.venue.name} on Complete (orders, till and rota).\n\nSet your password here (the link works for 7 days):\n${appUrl()}/staff/reset?token=${token}\n\nThen sign in at ${appUrl()}/staff/login with ${added.email}.\n\nComplete · complete.pub`,
      m.staff.email,
    ).catch(() => false);
    return json({ tempPassword: added.tempPassword, invited: true });
  } catch (e) {
    return errorJson(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    await removeTeamMember(m.venue, m.staff, new URL(req.url).searchParams.get("id") ?? "");
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
