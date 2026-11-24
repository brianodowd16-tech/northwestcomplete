import { setupStatus } from "@round/db/onboarding";
import { venueTables } from "@round/db/services";
import Link from "next/link";
import { GoLive } from "@/components/GoLive";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Setup({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const [s, tables] = await Promise.all([setupStatus(venue), venueTables(venue)]);
  const done = s.steps.filter((x) => x.done).length;
  const welcome = (await searchParams).welcome;
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="setup" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>{venue.status === "live" ? "You're live" : welcome ? `Welcome, ${staff.name.split(" ")[0]}` : "Get started"}</h1>
      </div>
      {venue.status === "live" ? (
        <div className="notice">Guests can order and pay. You can still finish the optional steps below.</div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {venue.name} is in test mode: you and your team can order with test payments. Finish the required steps, then go live.
          {s.trialEndsAt && ` Your free trial runs until ${s.trialEndsAt.toLocaleDateString("en-IE", { day: "numeric", month: "long" })}.`}
        </p>
      )}
      <section className="panel stack">
        <div className="row">
          <h3>Checklist</h3>
          <span className="chip plain num">
            {done} of {s.steps.length} done
          </span>
        </div>
        <div className="steps" aria-hidden>
          {s.steps.map((x) => (
            <span key={x.id} className={x.done ? "on" : ""} />
          ))}
        </div>
        <ol className="checklist">
          {s.steps.map((x) => (
            <li key={x.id} className={x.done ? "done" : ""}>
              <span className="tick" aria-hidden>
                {x.done ? "✓" : ""}
              </span>
              <Link href={x.href}>{x.title}</Link>
              <span className={`chip ${x.done ? "ok" : x.required ? "warn" : "plain"}`}>{x.done ? "Done" : x.required ? "Required" : "Optional"}</span>
            </li>
          ))}
        </ol>
        {venue.status !== "live" && <GoLive slug={slug} ready={s.canGoLive} />}
      </section>
      <section className="panel stack">
        <h3>Try it as a guest</h3>
        <p className="muted small" style={{ margin: 0 }}>Open your menu on your phone and place a test order. It appears on the bar and kitchen screens.</p>
        <div className="row wrap" style={{ justifyContent: "flex-start" }}>
          {tables[0] && (
            <a className="btn sm" href={`/v/${slug}/t/${tables[0].qrToken}`} target="_blank" rel="noopener">
              Order at table 1
            </a>
          )}
          <a className="btn sm ghost" href={`/v/${slug}/collect`} target="_blank" rel="noopener">
            Order to collect at the bar
          </a>
          <Link className="btn sm ghost" href={`/staff/${slug}/bar`}>
            Bar screen
          </Link>
        </div>
      </section>
    </div>
  );
}
