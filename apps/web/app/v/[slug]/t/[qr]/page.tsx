import { NotFound, tableByToken } from "@round/db/services";
import { notFound } from "next/navigation";
import { Ordering } from "@/components/Ordering";
import { orderingProps } from "@/lib/guest";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function TablePage({ params }: { params: Promise<{ slug: string; qr: string }> }) {
  const { slug, qr } = await params;
  const venue = await loadVenue(slug);
  const table = await tableByToken(venue, qr).catch((e) => {
    if (e instanceof NotFound) notFound();
    throw e;
  });
  const props = await orderingProps(venue, await currentGuest(), "table");
  return <Ordering slug={slug} mode="table" qrToken={qr} tableNumber={table.number} {...props} />;
}
