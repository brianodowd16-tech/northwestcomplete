import type { DocketStatus } from "@round/core";
import { advanceDocket, recordIdCheck, refuseId, type AgeDocument } from "@round/db/services";
import { currentStaff, errorJson, json, paymentProvider } from "@/lib/server";

const DOCS: AgeDocument[] = ["age_card", "passport", "driving_licence"];
const STATUSES: DocketStatus[] = ["in_progress", "ready", "done"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const { id } = await ctx.params;
    const b = (await req.json()) as { action: string; to?: DocketStatus; documentType?: AgeDocument };
    if (b.action === "advance" && b.to && STATUSES.includes(b.to)) await advanceDocket(staff, id, b.to);
    else if (b.action === "id_check" && b.documentType && DOCS.includes(b.documentType)) await recordIdCheck(staff, id, b.documentType);
    else if (b.action === "refuse") await refuseId(staff, id, paymentProvider());
    else return json({ error: "Bad request" }, 400);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
