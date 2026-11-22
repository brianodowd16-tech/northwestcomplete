import Link from "next/link";

export function StaffNav({ slug, current, admin, other }: { slug: string; current: string; admin: boolean; other?: string }) {
  const tabs: [string, string, string][] = [
    ["bar", "Bar", `/staff/${slug}/bar`],
    ["kitchen", "Kitchen", `/staff/${slug}/kitchen`],
    ["menu", "Sold out", `/staff/${slug}/menu`],
  ];
  if (admin) tabs.push(["office", "Back office", `/office/${slug}`], ["settings", "Settings", `/office/${slug}/settings`]);
  return (
    <>
      {other && <div className="notice" style={{ marginBottom: 10 }}>You&apos;re signed in for this venue, not {other}. Sign out to switch venue.</div>}
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
