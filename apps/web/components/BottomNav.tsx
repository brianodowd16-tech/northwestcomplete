"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconMenu, IconReceipt, IconStar, IconTable } from "./Icons";
import { useLive } from "./useLive";

/** Guest tab bar. "Menu" returns to the table or collect menu the guest last used. */
export function BottomNav({ slug, activeOrders }: { slug: string; activeOrders: number }) {
  const path = usePathname();
  const router = useRouter();
  const [menuHref, setMenuHref] = useState(`/v/${slug}/collect`);
  useEffect(() => {
    try {
      const last = sessionStorage.getItem(`round-last-menu:${slug}`);
      if (last) setMenuHref(last);
    } catch {}
  }, [slug, path]);
  // Keep the orders badge fresh while the guest browses.
  useLive(slug, () => router.refresh());

  const tabs = [
    { href: `/v/${slug}`, label: "Home", icon: <IconTable />, on: path === `/v/${slug}` },
    { href: menuHref, label: "Menu", icon: <IconMenu />, on: path.includes("/t/") || path.endsWith("/collect") },
    { href: `/v/${slug}/orders`, label: "Orders", icon: <IconReceipt />, on: path.includes("/order"), badge: activeOrders },
    { href: `/v/${slug}/rewards`, label: "Rewards", icon: <IconStar />, on: path.endsWith("/rewards") },
  ];
  return (
    <nav className="bnav" aria-label="Main">
      <div>
        {tabs.map((t) => (
          <Link key={t.label} href={t.href} aria-current={t.on ? "page" : undefined}>
            {t.icon}
            {t.label}
            {!!t.badge && <span className="badge num">{t.badge}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
