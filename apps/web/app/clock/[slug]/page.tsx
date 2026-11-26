import { venueBySlug } from "@round/db/services";
import { notFound } from "next/navigation";
import { ClockKiosk } from "@/components/ClockKiosk";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/** Clock in/out on a shared device: each person proves who they are with their own passkey. */
export default async function Clock({ params }: { params: Promise<{ slug: string }> }) {
  const venue = await venueBySlug((await params).slug).catch(() => null);
  if (!venue) notFound();
  return (
    <div className="page stack" style={{ maxWidth: 460, textAlign: "center", paddingTop: 60 }}>
      <div className="label">{venue.name}</div>
      <h1 style={{ fontSize: 30 }}>Clock in or out</h1>
      <ClockKiosk slug={venue.slug} />
      <p className="muted small">Use your own passkey: Face ID, your fingerprint or Windows Hello. No passkey yet? Add one in Security after signing in on your phone.</p>
    </div>
  );
}
