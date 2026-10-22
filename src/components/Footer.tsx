import Image from "next/image";
import Link from "next/link";
import { services } from "@/data/services";
import { site } from "@/lib/site";
import { Icon } from "./Icon";

const explore = [
  { href: "/shop", label: "Shop" },
  { href: "/boats", label: "Boats for Sale" },
  { href: "/boats/sell", label: "Sell Your Boat" },
  { href: "/engine-sourcing", label: "Engine Sourcing" },
  { href: "/contact?type=quote", label: "Get a Quote" },
  { href: "/about", label: "About Us" },
];

/** Email with a line-break opportunity before the @ so it never splits mid-word. */
function EmailText() {
  const [user, domain] = site.email.split("@");
  return (
    <>
      {user}
      <wbr />@{domain}
    </>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-16 overflow-hidden bg-navy-950 text-white/80">
      {/* Wave edge rising out of the page background */}
      <svg className="block h-12 w-full text-[#f7f6f1]" viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden="true">
        <path fill="currentColor" d="M0 0h1440v18c-120 16-240 24-360 16S840 6 720 6 480 26 360 32 120 30 0 22Z" />
      </svg>
      <div className="pointer-events-none absolute -right-40 top-24 h-96 w-96 rounded-full bg-sea-500/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-navy-500/20 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        {/* Call to action */}
        <section className="grid grid-cols-1 gap-8 rounded-3xl border border-white/10 bg-gradient-to-br from-navy-800/80 to-sea-800/60 p-6 shadow-2xl sm:p-12 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-widest text-sea-300">Talk to {site.contactName}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
              Got a job for us? <span className="text-sea-300">Send a photo on WhatsApp.</span>
            </h2>
            <p className="mt-4 max-w-xl text-lg text-white/75">
              Snap the engine, the gelcoat or the hull and send it over. {site.contactName} will come back to you with advice
              and a price, usually the same day.
            </p>
          </div>
          <div className="grid min-w-0 gap-3">
            <a
              href={site.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl bg-[#25D366] px-5 py-5 sm:px-6 text-[#062b16] shadow-lg transition hover:brightness-105"
            >
              <Icon name="whatsapp" className="h-9 w-9 shrink-0" />
              <span>
                <span className="block text-sm font-semibold uppercase tracking-wide">WhatsApp {site.contactName}</span>
                <span className="block font-display text-2xl font-extrabold">{site.phone}</span>
              </span>
            </a>
            <a
              href={`mailto:${site.email}`}
              className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/5 px-5 py-5 sm:px-6 text-white transition hover:bg-white/10"
            >
              <Icon name="mail" className="h-8 w-8 shrink-0 text-sea-300" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold uppercase tracking-wide text-white/60">Email</span>
                <span className="block font-display text-base font-bold [overflow-wrap:anywhere] sm:text-lg">
                  <EmailText />
                </span>
              </span>
            </a>
          </div>
        </section>

        {/* Directory */}
        <div className="grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_0.8fr_1fr]">
          <div>
            <div className="inline-block rounded-2xl bg-white p-4 shadow-lg">
              <Image
                src="/images/northwest-boat-maintenance-logo.png"
                alt="Northwest Boat Maintenance"
                width={489}
                height={246}
                className="h-24 w-auto"
              />
            </div>
            <p className="mt-6 max-w-sm leading-relaxed">
              Marine engineering, restoration and brokerage for boat owners on the coast, the loughs and the Shannon–Erne
              waterway.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Areas we cover">
              {site.areas.map((a) => (
                <li key={a} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
                  {a}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-white">Services</h3>
            <ul className="mt-4 space-y-2.5">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link href={`/services/${s.slug}`} className="transition hover:text-sea-300">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-white">Explore</h3>
            <ul className="mt-4 space-y-2.5">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition hover:text-sea-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-white">Contact</h3>
            <ul className="mt-4 space-y-4">
              <li className="flex gap-3">
                <Icon name="whatsapp" className="h-5 w-5 shrink-0 text-[#25D366]" />
                <a href={site.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:text-sea-300">
                  {site.contactName} · {site.phone}
                </a>
              </li>
              <li className="flex gap-3">
                <Icon name="mail" className="h-5 w-5 shrink-0 text-sea-300" />
                <a href={`mailto:${site.email}`} className="hover:text-sea-300">
                  <EmailText />
                </a>
              </li>
              <li className="flex gap-3">
                <Icon name="pin" className="h-5 w-5 shrink-0 text-sea-300" />
                {site.region}
              </li>
              <li className="flex gap-3">
                <Icon name="clock" className="h-5 w-5 shrink-0 text-sea-300" />
                <span>
                  Mon–Fri 8:00–18:00
                  <br />
                  Sat 9:00–13:00
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 py-6 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {site.name}. All prices in euro and include VAT.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <span>Secure payments by Stripe</span>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
