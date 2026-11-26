import { groupDetail } from "@round/db/groups";
import { liveVenues } from "@round/db/services";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GroupRoom } from "@/components/GroupRoom";
import { appUrl, currentGuest } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guest = await currentGuest();
  if (!guest) redirect("/me/groups");
  await groupDetail(id, guest.id).catch(() => notFound());
  const venues = (await liveVenues()).map((v) => ({ slug: v.slug, name: v.name }));
  return (
    <div className="page stack" style={{ maxWidth: 720 }}>
      <Link href="/me/groups" className="label" style={{ textDecoration: "none" }}>‹ Groups</Link>
      <GroupRoom id={id} venues={venues} appUrl={appUrl()} myRevolut={guest.revolutHandle ?? ""} />
    </div>
  );
}
