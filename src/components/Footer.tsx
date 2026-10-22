import Image from "next/image";
import Link from "next/link";
import { services } from "@/data/services";
import { site } from "@/lib/site";
import { Icon } from "./Icon";

export function Footer() {
  return (
    <footer className="bg-navy-950 text-white/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Image
            src="/images/northwest-boat-maintenance-logo.png"
            alt="Northwest Boat Maintenance logo"
            width={489}
            height={246}
            className="mb-4 h-20 w-auto"
          />
          <p className="font-display text-lg font-bold text-white">{site.name}</p>
          <p className="mt-3 text-sm leading-relaxed">{site.tagline}.</p>
          <p className="mt-3 text-sm">Serving {site.areas.slice(0, 4).join(", ")} and beyond.</p>
        </div>
        <div>
          <p className="font-semibold text-white">Services</p>
          <ul className="mt-3 space-y-2 text-sm">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={`/services/${s.slug}`} className="hover:text-sea-300">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-white">Shop & Info</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/shop" className="hover:text-sea-300">Shop</Link></li>
            <li><Link href="/boats" className="hover:text-sea-300">Boats for Sale</Link></li>
            <li><Link href="/boats/sell" className="hover:text-sea-300">Sell Your Boat</Link></li>
            <li><Link href="/engine-sourcing" className="hover:text-sea-300">Engine Sourcing</Link></li>
            <li><Link href="/about" className="hover:text-sea-300">About Us</Link></li>
            <li><Link href="/terms" className="hover:text-sea-300">Terms & Conditions</Link></li>
            <li><Link href="/privacy" className="hover:text-sea-300">Privacy Policy</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-white">Contact</p>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex gap-2"><Icon name="pin" className="h-5 w-5 shrink-0 text-sea-300" />{site.region}</li>
            <li className="flex gap-2"><Icon name="phone" className="h-5 w-5 shrink-0 text-sea-300" /><a href={`tel:${site.phone.replace(/[^+\d]/g, "")}`} className="hover:text-sea-300">{site.phone}</a></li>
            <li className="flex gap-2"><Icon name="mail" className="h-5 w-5 shrink-0 text-sea-300" /><a href={`mailto:${site.email}`} className="hover:text-sea-300">{site.email}</a></li>
          </ul>
          <p className="mt-5 text-xs text-white/50">Secure payments by Stripe. Visa, Mastercard, Apple Pay & Google Pay accepted.</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">
        © {new Date().getFullYear()} {site.name}. All prices in euro and include VAT.
      </div>
    </footer>
  );
}
