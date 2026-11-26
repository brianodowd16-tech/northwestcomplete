import { managerBriefing } from "@round/db/briefing";
import Link from "next/link";
import { LiveOffice } from "@/components/LiveOffice";
import { ManagerAssistant } from "@/components/ManagerAssistant";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { assistantConfigured } from "@/lib/assistant";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The manager's home: the day and the week in plain words, what needs them, and an assistant to ask. */
export default async function Home({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const { briefing: b } = await managerBriefing(venue, staff);
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <VenueTheme color={venue.brandColor} />
      <LiveOffice slug={slug} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="office" admin />
        <h1 style={{ fontSize: 30 }}>{b.greeting}</h1>
      </div>

      <section className="panel stack" style={{ gap: 8 }}>
        <div className="label">Today</div>
        {b.today.map((s, i) => <p key={i} style={{ margin: 0, fontSize: i === 0 ? 20 : 16, fontWeight: i === 0 ? 600 : 400 }}>{s}</p>)}
      </section>

      <section className="panel stack" style={{ gap: 8 }}>
        <div className="label">This week</div>
        {b.week.map((s, i) => <p key={i} style={{ margin: 0, fontSize: i === 0 ? 18 : 16, fontWeight: i === 0 ? 600 : 400 }}>{s}</p>)}
      </section>

      {b.attention.length > 0 && (
        <section className="panel stack" style={{ gap: 6 }}>
          <div className="label">Needs you</div>
          {b.attention.map((a, i) => (
            <Link key={i} href={a.href} className="card row" style={{ textDecoration: "none", color: "inherit", borderLeft: `4px solid ${a.tone === "error" ? "var(--crit)" : a.tone === "warn" ? "#c77d0a" : "var(--line)"}` }}>
              <span>{a.text}</span><span className="muted">›</span>
            </Link>
          ))}
        </section>
      )}

      <section className="panel stack">
        <div className="label">Ask your assistant</div>
        <ManagerAssistant slug={slug} configured={assistantConfigured()} />
      </section>

      <p className="muted small" style={{ margin: 0, textAlign: "center" }}><Link href={`/office/${slug}/reports`}>Full reports</Link> · charts, best sellers, latest orders and your Complete bill</p>
    </div>
  );
}
