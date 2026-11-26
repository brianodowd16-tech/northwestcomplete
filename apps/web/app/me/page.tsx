import { EVENT_KINDS } from "@round/core";
import { whatsOn } from "@round/db/events";
import { guestHub } from "@round/db/growth";
import { liveVenues } from "@round/db/services";
import Link from "next/link";
import { eur } from "@/components/format";
import { currentGuest } from "@/lib/server";

export const dynamic = "force-dynamic";

/** One account, every venue: your points and credit everywhere, what's on tonight, places to try. */
export default async function Me() {
  const guest = await currentGuest();
  const all = await liveVenues();
  const hub = guest ? await guestHub(guest.id) : [];
  const mine = new Set(hub.map((h) => h.venue.id));
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  const tonight = (await Promise.all((hub.length ? hub.map((h) => h.venue) : all).slice(0, 12).map(async (v) => (await whatsOn(v, new Date(), end)).slice(0, 2).map((o) => ({ v, o }))))).flat().sort((a, b) => a.o.start.getTime() - b.o.start.getTime());
  return (
    <div className="page stack" style={{ maxWidth: 560 }}>
      <Link href="/" className="label" style={{ textDecoration: "none" }}>Complete</Link>
      <h1 style={{ fontSize: 28 }}>{guest ? `Hi ${guest.name.split(" ")[0]}` : "Your venues"}</h1>
      {!guest && <div className="notice">Open a venue below and sign in once: your account works at every venue on Complete.</div>}
      <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
        <Link className="btn sm" href="/me/groups">👥 Groups, nights out and splitting</Link>
        <Link className="btn sm ghost" href="/leaderboards">🏆 Leaderboards</Link>
      </div>
      {hub.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3>Your rewards</h3>
          {hub.map((h) => (
            <Link key={h.venue.id} href={`/v/${h.venue.slug}/rewards`} className="card row" style={{ textDecoration: "none", color: "inherit", borderLeft: `4px solid ${h.venue.brandColor}` }}>
              <span><b>{h.venue.name}</b><div className="muted small">{h.venue.town}</div></span>
              <span style={{ textAlign: "right" }}><b className="num">{h.points.toLocaleString("en-IE")} pts</b><div className="muted small num">{eur(h.creditCents)} credit</div></span>
            </Link>
          ))}
        </section>
      )}
      {tonight.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3>On tonight</h3>
          {tonight.slice(0, 6).map(({ v, o }) => (
            <Link key={v.id + o.key} href={`/v/${v.slug}/events`} className="card row small" style={{ textDecoration: "none", color: "inherit" }}>
              <span>{EVENT_KINDS[o.kind].icon} <b>{o.title}</b><div className="muted">{v.name}</div></span>
              <span className="num">{o.start.toLocaleTimeString("en-IE", { timeZone: v.timezone, hour: "2-digit", minute: "2-digit" })}</span>
            </Link>
          ))}
        </section>
      )}
      <section className="stack" style={{ gap: 8 }}>
        <h3>{hub.length ? "Try somewhere new" : "Venues"}</h3>
        <div className="tiles">
          {all.filter((v) => !mine.has(v.id)).map((v) => (
            <Link key={v.id} className="tile" href={`/v/${v.slug}`} style={{ borderLeft: `4px solid ${v.brandColor}` }}>
              <span><b>{v.name}</b><span className="muted small" style={{ display: "block" }}>{v.town}</span></span>
              <span className="muted">›</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
