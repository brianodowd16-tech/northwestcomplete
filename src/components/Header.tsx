"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { Icon } from "./Icon";

const nav = [
  { href: "/services", label: "Services" },
  { href: "/shop", label: "Shop" },
  { href: "/boats", label: "Boats for Sale" },
  { href: "/engine-sourcing", label: "Engine Sourcing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const pathname = usePathname();
  const { count, ready } = useCart();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 border-b border-slate-200 bg-white text-navy-900 transition-shadow ${scrolled ? "shadow-md" : ""}`}>
      <div className={`mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 ${scrolled ? "pt-2" : "pt-4"}`}>
        <div>
          <button
            className="rounded-md p-2 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>

        <Link href="/" onClick={() => setOpen(false)} aria-label="Northwest Boat Maintenance — home">
          <Image
            src="/images/northwest-boat-maintenance-logo.png"
            alt="Northwest Boat Maintenance"
            width={489}
            height={246}
            priority
            className={`w-auto transition-all duration-200 ${scrolled ? "h-14 sm:h-16" : "h-20 sm:h-28 lg:h-32"}`}
          />
        </Link>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/contact?type=quote"
            className="hidden rounded-md bg-brass-500 px-4 py-2 text-sm font-semibold text-navy-950 transition hover:bg-brass-400 sm:inline-block"
          >
            Get a Quote
          </Link>
          <Link href="/cart" className="relative rounded-md p-2 hover:bg-slate-100" aria-label={`Basket, ${count} items`}>
            <Icon name="cart" />
            {ready && count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-sea-600 px-1 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>

      <nav className="mx-auto mt-3 hidden max-w-7xl justify-center gap-1 border-t border-slate-200 px-4 py-2 lg:flex" aria-label="Main">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-4 py-2 text-base font-medium transition hover:bg-slate-100 xl:text-lg ${
              pathname.startsWith(item.href) ? "font-semibold text-sea-700" : "text-navy-800"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="h-3 lg:hidden" />

      {open && (
        <nav className="border-t border-slate-200 px-4 pb-4 lg:hidden" aria-label="Mobile">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-3 text-base font-medium text-navy-800 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/contact?type=quote"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-md bg-brass-500 px-3 py-3 text-center font-semibold text-navy-950"
          >
            Get a Quote
          </Link>
        </nav>
      )}
    </header>
  );
}
