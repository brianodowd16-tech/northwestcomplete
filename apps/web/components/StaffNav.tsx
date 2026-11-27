import Link from "next/link";
import { ClockButton } from "./ClockButton";

export function StaffNav({ slug, current, admin, other, setup }: { slug: string; current: string; admin: boolean; other?: string; setup?: boolean }) {
  // Two short tab bars instead of one long one: the floor screens, and (for managers) the back office.
  const floor: [string, string, string][] = [
    ["till", "Till", `/staff/${slug}/till`],
    ["bar", "Bar", `/staff/${slug}/bar`],
    ["kitchen", "Kitchen", `/staff/${slug}/kitchen`],
    ["bookings", "Bookings", `/staff/${slug}/bookings`],
    ["menu", "Sold out", `/staff/${slug}/menu`],
    ["waste", "Waste", `/staff/${slug}/waste`],
    ["music", "Music", `/staff/${slug}/music`],
    ["controls", "Controls", `/staff/${slug}/controls`],
    ["shifts", "My shifts", `/staff/${slug}/shifts`],
    ["account", "Security", `/staff/security`],
  ];
  const office: [string, string, string][] = [
    ...(setup ? ([["setup", "Get started", `/office/${slug}/setup`]] as [string, string, string][]) : []),
    ["office", "Home", `/office/${slug}`],
    ["reports", "Reports", `/office/${slug}/reports`],
    ["menuedit", "Menu", `/office/${slug}/menu`],
    ["stock", "Stock", `/office/${slug}/stock`],
    ["events", "What's on", `/office/${slug}/events`],
    ["rota", "Rota", `/office/${slug}/rota`],
    ["payroll", "Payroll", `/office/${slug}/payroll`],
    ["planner", "Planner", `/office/${slug}/planner`],
    ["social", "Social", `/office/${slug}/social`],
    ["enquiries", "Enquiries", `/office/${slug}/enquiries`],
    ["team", "Team", `/office/${slug}/team`],
    ["tables", "Tables", `/office/${slug}/tables`],
    ["devices", "Venue systems", `/office/${slug}/controls`],
    ["integrations", "Integrations", `/office/${slug}/integrations`],
    ["settings", "Settings", `/office/${slug}/settings`],
  ];
  const inOffice = admin && office.some(([k]) => k === current);
  const tabs = inOffice ? office : floor;
  return (
    <>
      {other && <div className="notice" style={{ marginBottom: 10 }}>You&apos;re signed in for this venue, not {other}. Sign out to switch venue.</div>}
      {setup && admin && current !== "setup" && (
        <div className="notice" style={{ marginBottom: 10 }}>
          Test mode: guests can try ordering, but no real payments are taken. <Link href={`/office/${slug}/setup`}>Finish setting up</Link>
        </div>
      )}
      <div className="row" style={{ borderBottom: "1px solid var(--line)", marginBottom: 18, alignItems: "flex-end", flexWrap: "wrap-reverse", rowGap: 6 }}>
        <nav className="tabs" aria-label={inOffice ? "Back office" : "Staff"} style={{ border: 0, margin: 0, flex: "1 1 300px", minWidth: 0, flexWrap: "wrap" }}>
          {tabs.map(([k, l, href]) => (
            <Link key={k} href={href} aria-current={current === k ? "page" : undefined}>
              {l}
            </Link>
          ))}
        </nav>
        <div className="row" style={{ paddingBottom: 8, gap: 6, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {admin && <Link className="btn ghost sm" href={inOffice ? `/staff/${slug}/till` : `/office/${slug}`}>{inOffice ? "Floor screens" : "Back office"}</Link>}
          <ClockButton />
          <form action="/api/auth/logout?to=/staff/login" method="post">
            <button className="btn ghost sm">Sign out</button>
          </form>
        </div>
      </div>
    </>
  );
}
