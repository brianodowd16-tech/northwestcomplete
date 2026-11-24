import { setUnavailable } from "@round/db/rota";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const b = (await req.json()) as Record<string, string>;
    await setUnavailable(staff, b.date, b.action !== "available", b.note ?? "");
    return json({ message: b.action === "available" ? "Marked as available" : "Your manager will see you can't work that day" });
  } catch (e) {
    return errorJson(e);
  }
}
