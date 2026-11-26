import { groupInvite } from "@round/db/groups";
import { liveVenues } from "@round/db/services";
import Link from "next/link";
import { JoinGroup } from "@/components/JoinGroup";
import { currentGuest } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/** Invite link: shows the group's name, then joins (after signing in). */
export default async function Invite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const g = await groupInvite(code);
  const guest = await currentGuest();
  const venues = await liveVenues();
  return (
    <div className="page stack" style={{ maxWidth: 480 }}>
      <Link href="/me" className="label" style={{ textDecoration: "none" }}>Complete</Link>
      {!g ? (
        <div className="panel stack"><h1 style={{ fontSize: 24 }}>This invite link doesn&apos;t work</h1><p className="muted" style={{ margin: 0 }}>Ask for a new one: links change when someone is removed from a group.</p></div>
      ) : (
        <div className="panel stack">
          <div className="label">You&apos;re invited</div>
          <h1 style={{ fontSize: 26 }}>{g.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{g.members} {g.members === 1 ? "person" : "people"} · chat, nights out and splitting costs on Complete</p>
          {guest ? <JoinGroup code={code} /> : venues[0] ? <Link className="btn block" href={`/v/${venues[0].slug}/login?next=/g/${code}`}>Sign in to join</Link> : null}
        </div>
      )}
    </div>
  );
}
