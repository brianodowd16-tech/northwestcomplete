import { myGroups } from "@round/db/groups";
import { liveVenues } from "@round/db/services";
import Link from "next/link";
import { GroupStart } from "@/components/GroupStart";
import { currentGuest } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Groups() {
  const guest = await currentGuest();
  const venues = await liveVenues();
  if (!guest) {
    return (
      <div className="page stack" style={{ maxWidth: 560 }}>
        <Link href="/me" className="label" style={{ textDecoration: "none" }}>Complete</Link>
        <h1 style={{ fontSize: 28 }}>Groups</h1>
        <div className="notice">Sign in to chat with friends, plan nights out and split costs.</div>
        {venues[0] && <Link className="btn" href={`/v/${venues[0].slug}/login?next=/me/groups`}>Sign in</Link>}
      </div>
    );
  }
  const groups = await myGroups(guest.id);
  return (
    <div className="page stack" style={{ maxWidth: 560 }}>
      <Link href="/me" className="label" style={{ textDecoration: "none" }}>Complete</Link>
      <h1 style={{ fontSize: 28 }}>Your groups</h1>
      {groups.length === 0 && <div className="empty">No groups yet. Start one for your friends, team or a party.</div>}
      {groups.map((g) => (
        <Link key={g.id} href={`/me/groups/${g.id}`} className="card row" style={{ textDecoration: "none", color: "inherit" }}>
          <span><b>{g.name}</b><div className="muted small">{g.last ? g.last.body : "No messages yet"}</div></span>
          <span className="muted">›</span>
        </Link>
      ))}
      <GroupStart />
    </div>
  );
}
