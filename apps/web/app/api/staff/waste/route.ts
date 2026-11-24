import { recordWaste } from "@round/db/inventory";
import { venueById } from "@round/db/services";
import { currentStaff, errorJson, json } from "@/lib/server";

/** Any staff member logs waste by menu item (a dropped pint, a returned meal). */
export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const b = (await req.json()) as Record<string, string>;
    await recordWaste(await venueById(staff.venueId), staff, { menuItemId: b.menuItemId, servings: Number(b.servings), reason: b.reason });
    return json({ message: "Waste logged" });
  } catch (e) {
    return errorJson(e);
  }
}
