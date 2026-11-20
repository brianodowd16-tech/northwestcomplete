"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "./cart";

const NAV = [
  { href: "/shop", label: "Special Offers" },
  { href: "/range", label: "Our Range" },
  { href: "/servicing", label: "Servicing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header({ logo, phone, phoneIntl }: { logo: string; phone: string; phoneIntl: string }) {
  const pathname = usePathname();
  const { count, ready } = useCart();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <div className="topbar">
        <div className="wrap">
          <span className="hide-sm">Family-run in Carrick-on-Shannon since 1967 · 80+ live displays</span>
          <a href={`tel:${phoneIntl}`}>Call {phone}</a>
        </div>
      </div>
      <header className="header">
        <div className="wrap">
          <Link href="/" className="logo" aria-label="O'Dowd's Fireplaces & Stoves – home">
            <Image src={logo} alt="O'Dowd's Fireplaces & Stoves" width={600} height={306} priority sizes="150px" />
          </Link>
          <button className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((o) => !o)}>
            <span className="sr-only">Menu</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <nav id="site-nav" className="nav" data-open={open} aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/cart" className="cart-btn" aria-label={`Basket, ${count} item${count === 1 ? "" : "s"}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 016 0" />
            </svg>
            <span className="cart-count" suppressHydrationWarning>{ready ? count : 0}</span>
          </Link>
        </div>
      </header>
    </>
  );
}
