import Link from "next/link";

export function StaffNav({ slug, current, admin, other, setup }: { slug: string; current: string; admin: boolean; other?: string; setup?: boolean }) {
  const tabs: [string, string, string][] = [
    ["bar", "Bar", `/staff/${slug}/bar`],
    ["kitchen", "Kitchen", `/staff/${slug}/kitchen`],
    ["menu", "Sold out", `/staff/${slug}/menu`],
    ["waste", "Waste", `/staff/${slug}/waste`],
  ];
  if (admin)
    tabs.push(
      ["office", "Back office", `/office/${slug}`],
      ["menuedit", "Menu", `/office/${slug}/menu`],
      ["stock", "Stock", `/office/${slug}/stock`],
      ["events", "What's on", `/office/${slug}/events`],
      ["tables", "Tables", `/office/${slug}/tables`],
      ["team", "Team", `/office/${slug}/team`],
      ["settings", "Settings", `/office/${slug}/settings`],
      ...(setup ? ([["setup", "Get started", `/office/${slug}/setup`]] as [string, string, string][]) : []),
    );
  return (
    <>
      {other && <div className="notice" style={{ marginBottom: 10 }}>You&apos;re signed in for this venue, not {other}. Sign out to switch venue.</div>}
      {setup && admin && current !== "setup" && (
        <div className="notice" style={{ marginBottom: 10 }}>
          Test mode: guests can try ordering, but no real payments are taken. <Link href={`/office/${slug}/setup`}>Finish setting up</Link>
        </div>
      )}
      <div className="row" style={{ borderBottom: "1px solid var(--line)", marginBottom: 18, alignItems: "flex-end" }}>
        <nav className="tabs" aria-label="Staff" style={{ border: 0, margin: 0 }}>
          {tabs.map(([k, l, href]) => (
            <Link key={k} href={href} aria-current={current === k ? "page" : undefined}>
              {l}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout?to=/staff/login" method="post" style={{ paddingBottom: 8 }}>
          <button className="btn ghost sm">Sign out</button>
        </form>
      </div>
    </>
  );
}
