import "server-only";
import { memberSummary, menu, type Customer, type Venue } from "@round/db/services";
import type { MenuItemView } from "@/components/Ordering";

export async function orderingProps(venue: Venue, guest: Customer | null, mode: "table" | "collect") {
  const cats = await menu(venue);
  const categories = cats
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items
        .filter((i) => mode === "table" || (i.station === "bar" && i.availableForCollect))
        .map(
          (i): MenuItemView => ({
            id: i.id,
            name: i.name,
            description: i.description,
            priceCents: i.priceCents,
            vatRate: i.vatRate,
            station: i.station,
            containsAlcohol: i.containsAlcohol,
            availableForCollect: i.availableForCollect,
            soldOut: i.soldOut,
          }),
        ),
    }))
    .filter((c) => c.items.length);
  let member = null;
  if (guest) {
    const s = await memberSummary(venue, guest.id);
    member = { creditCents: s.balances.creditCents, doubles: s.balances.doubles, pointsPerEuro: s.programme.pointsPerEuro, idChecked: !!guest.ageVerifiedAt };
  }
  return { categories, member };
}
