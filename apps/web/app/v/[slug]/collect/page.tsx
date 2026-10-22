import { Ordering } from "@/components/Ordering";
import { orderingProps } from "@/lib/guest";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function CollectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await loadVenue(slug);
  const props = await orderingProps(venue, await currentGuest(), "collect");
  return <Ordering slug={slug} mode="collect" {...props} />;
}
