import Link from "next/link";

export function StaffNav({ slug, current, admin }: { slug: string; current: string; admin: boolean }) {
  const tabs: [string, string][] = [
    ["bar", "Bar"],
    ["kitchen", "Kitchen"],
    ["menu", "Sold out"],
  ];
  return (
    <nav className="tabs" aria-label="Staff">
      {tabs.map(([k, l]) => (
        <Link key={k} href={`/staff/${slug}/${k}`} aria-current={current === k ? "page" : undefined}>
          {l}
        </Link>
      ))}
      {admin && (
        <Link href={`/office/${slug}`} aria-current={current === "office" ? "page" : undefined}>
          Back office
        </Link>
      )}
    </nav>
  );
}
