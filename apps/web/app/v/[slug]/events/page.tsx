import { EVENT_KINDS, type EventKind } from "@round/core";
import { whatsOn } from "@round/db/events";
import Link from "next/link";
import { eur } from "@/components/format";
import { loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function WhatsOn({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const venue = await loadVenue((await params).slug);
  const k = (await searchParams).k;
  const kind = k && k in EVENT_KINDS ? (k as EventKind) : null;
  const tz = venue.timezone;
  const all = await whatsOn(venue, new Date(), new Date(Date.now() + 42 * 86_400_000));
  const list = kind ? all.filter((o) => o.kind === kind) : all;
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const today = dayKey(new Date()), tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  const days = [...new Set(list.map((o) => dayKey(o.start)))];
  const time = (d: Date) => d.toLocaleTimeString("en-IE", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const kinds = [...new Set(all.map((o) => o.kind))];
  return (
    <div className="stack">
      <div className="row wrap">
        <h1 style={{ fontSize: 26 }}>What&apos;s on</h1>
        <a className="btn sm ghost" href={`/v/${venue.slug}/events.ics`}>📅 Add all to my calendar</a>
      </div>
      {kinds.length > 1 && (
        <nav className="subtabs" aria-label="Filter">
          <Link href={`/v/${venue.slug}/events`} aria-current={!kind ? "page" : undefined}>All</Link>
          {kinds.map((x) => (
            <Link key={x} href={`?k=${x}`} aria-current={kind === x ? "page" : undefined}>
              {EVENT_KINDS[x].icon} {EVENT_KINDS[x].label}
            </Link>
          ))}
        </nav>
      )}
      {days.length === 0 && <div className="empty">Nothing listed yet. Check back soon.</div>}
      {days.map((d) => (
        <section key={d} className="stack" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 16 }}>
            {d === today ? "Today" : d === tomorrow ? "Tomorrow" : new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {list
            .filter((o) => dayKey(o.start) === d)
            .map((o) => {
              const live = o.start <= new Date() && o.end > new Date();
              return (
                <article key={o.key} className={`card event ${o.kind}`}>
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="label">{EVENT_KINDS[o.kind].icon} {EVENT_KINDS[o.kind].label}{o.repeatWeekly ? " · every week" : ""}</span>
                      <b style={{ display: "block", fontSize: 17 }}>{o.title}</b>
                      {o.details && <span className="muted small">{o.details}</span>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {live ? <span className="chip crit">● On now</span> : <b className="num">{time(o.start)}</b>}
                      <div className="muted small num">until {time(o.end)}</div>
                    </div>
                  </div>
                  <div className="row small">
                    <span className="muted">{[o.where, o.coverCents ? `Entry ${eur(o.coverCents)}` : "Free in"].filter(Boolean).join(" · ")}</span>
                    <a href={`/v/${venue.slug}/events.ics?e=${encodeURIComponent(o.key)}`}>Add to calendar</a>
                  </div>
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}
