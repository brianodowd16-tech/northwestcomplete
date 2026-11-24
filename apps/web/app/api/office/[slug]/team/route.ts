import { addTeamMember, removeTeamMember } from "@round/db/admin";
import { managerFor } from "@/lib/office";
import { errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as { name?: string; email?: string; role?: string };
    const { tempPassword } = await addTeamMember(m.venue, m.staff, { name: b.name ?? "", email: b.email ?? "", role: b.role ?? "" });
    return json({ tempPassword });
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
