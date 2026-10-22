"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-950/95 text-white backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Image
            src="/images/northwest-boat-maintenance-logo.png"
            alt="Northwest Boat Maintenance logo"
            width={489}
            height={246}
            priority
            className="h-11 w-auto"
          />
          <span className="hidden font-display text-sm font-bold leading-tight sm:block sm:text-base">
            Northwest
            <span className="block text-xs font-medium text-sea-300 sm:text-sm">Boat Maintenance</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium transition hover:bg-white/10 ${
                pathname.startsWith(item.href) ? "text-sea-300" : "text-white/85"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/contact?type=quote"
            className="hidden rounded-md bg-brass-500 px-4 py-2 text-sm font-semibold text-navy-950 transition hover:bg-brass-400 sm:inline-block"
          >
            Get a Quote
          </Link>
          <Link href="/cart" className="relative rounded-md p-2 hover:bg-white/10" aria-label={`Basket, ${count} items`}>
            <Icon name="cart" />
            {ready && count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-sea-400 px-1 text-xs font-bold text-navy-950">
                {count}
              </span>
            )}
          </Link>
          <button
            className="rounded-md p-2 hover:bg-white/10 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/10 px-4 pb-4 lg:hidden" aria-label="Mobile">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-3 text-base font-medium text-white/90 hover:bg-white/10"
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
