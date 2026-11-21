"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "./cart";
import { Icon } from "./Icon";

type Category = { slug: string; name: string; blurb: string };

const NAV = [
  { href: "/shop", label: "Special Offers" },
  { href: "/servicing", label: "Servicing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Visit Us" },
];

export function Header({ logo, categories }: { logo: string; categories: Category[] }) {
  const pathname = usePathname();
  const { count, ready } = useCart();
  const [open, setOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setRangeOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="utility">
        <div className="wrap">
          <span>Family-run since 1967 <span className="hide-md">· Showroom on Station Road, Carrick-on-Shannon</span></span>
          <span className="hide-md"><strong>Secure checkout</strong> · Click &amp; Collect</span>
        </div>
      </div>
      <header className="header">
        <div className="wrap">
          <Link href="/" className="logo" aria-label="O'Dowd's Fireplaces & Stoves, home">
            <Image src={logo} alt="O'Dowd's Fireplaces & Stoves" width={600} height={306} priority sizes="140px" />
          </Link>
          <nav id="site-nav" className="nav" data-open={open} aria-label="Main">
            <div className="nav__item">
              <button
                type="button"
                className="nav__trigger"
                aria-expanded={rangeOpen}
                aria-controls="range-menu"
                onClick={() => setRangeOpen((o) => !o)}
              >
                The Range <Icon name="chevron" size={14} />
              </button>
              <div id="range-menu" className="mega" data-open={rangeOpen}>
                {categories.map((c) => (
                  <Link key={c.slug} href={`/range/${c.slug}`}>
                    <strong>{c.name}</strong>
                    <span>{c.blurb}</span>
                  </Link>
                ))}
                <Link href="/range" className="mega__all">
                  <strong>View the full range →</strong>
                </Link>
              </div>
            </div>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="header__actions">
            <Link href="/#consultation" className="btn btn--dark btn--sm btn--consult">Book a consultation</Link>
            <Link href="/cart" className="cart-btn" aria-label={`Basket, ${count} item${count === 1 ? "" : "s"}`}>
              <Icon name="bag" size={20} />
              {ready && count > 0 && <span className="cart-count">{count}</span>}
            </Link>
            <button className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((o) => !o)}>
              <span className="sr-only">Menu</span>
              <Icon name={open ? "close" : "menu"} size={20} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
