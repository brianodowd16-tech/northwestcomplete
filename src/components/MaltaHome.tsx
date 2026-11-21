import Image from "next/image";
import Link from "next/link";
import { partners, serviceCopy } from "@/data/content";
import { boats } from "@/data/boats";
import { services } from "@/data/services";
import { formatPrice, site, type Market } from "@/lib/site";
import { Icon } from "./Icon";

const pillars = [
  {
    title: "Discretion",
    text: "Your yacht, your schedule, your privacy. We work quietly around you and your guests.",
  },
  {
    title: "Engineering first",
    text: "Every finish, refit and sale is backed by engineers who understand what's under the deck.",
  },
  {
    title: "One point of contact",
    text: `${site.contactName} leads every client personally, from first call to handover.`,
  },
];

export function fromPrice(s: (typeof services)[number]) {
  const o = s.options.reduce((a, b) => (b.price < a.price ? b : a));
  return `From ${formatPrice(o.price)}${o.unit === "per-foot" ? " per ft" : ""}`;
}

export function MaltaHome({ market }: { market: Market }) {
  const listings = boats.filter((b) => b.market === market.id);
  const featured = services.find((s) => s.slug === "marina-design-consultancy");
  const grid = services.filter((s) => s !== featured);

  return (
    <>
      <section className="relative -mt-px flex min-h-[78vh] items-end overflow-hidden bg-navy-950 text-white">
        <Image src="/images/hero-yacht.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/55 to-navy-950/10" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-20 pt-40 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sea-300">Malta · Gozo · By appointment</p>
          <h1 className="mt-6 max-w-4xl font-display text-5xl font-medium leading-[1.05] sm:text-7xl">
            Yacht care, <em className="text-sea-300">without compromise.</em>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">
            Engineering, paint correction, refit and brokerage for motor yachts in Malta and Gozo. One discreet team,
            personally led by {site.contactName}.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/contact?type=quote"
              className="rounded-full bg-sea-400 px-8 py-4 text-sm font-semibold uppercase tracking-widest text-navy-950 transition hover:bg-sea-300"
            >
              Arrange a private consultation
            </Link>
            <Link
              href="/boats"
              className="rounded-full border border-white/40 px-8 py-4 text-sm font-semibold uppercase tracking-widest transition hover:bg-white/10"
            >
              Yachts for sale
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-navy-100 bg-white" aria-label="Partners">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 text-center sm:flex-row sm:justify-center sm:gap-12 sm:px-6">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-navy-400">In partnership with</span>
          {partners.map((p) => (
            <span key={p.name} className="font-display text-2xl text-navy-900 sm:text-3xl">
              {p.name}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="grid gap-16 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <p className="font-display text-3xl leading-snug text-navy-900 sm:text-4xl">
            The Mediterranean asks a lot of a yacht. We make sure yours is always ready: flawless to look at, faultless
            underway, and cared for by people who treat it as their own.
          </p>
          <dl className="grid gap-8">
            {pillars.map((p) => (
              <div key={p.title} className="border-t border-navy-200 pt-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.3em] text-sea-600">{p.title}</dt>
                <dd className="mt-2 text-navy-600">{p.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sea-600">Services</p>
              <h2 className="mt-3 font-display text-4xl text-navy-900 sm:text-5xl">Everything your yacht needs</h2>
            </div>
            <Link href="/services" className="text-sm font-semibold uppercase tracking-widest text-navy-900 underline decoration-sea-400 underline-offset-8">
              All services
            </Link>
          </div>
          <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {grid.map((s) => {
              const copy = serviceCopy(market.id, s);
              return (
                <Link key={s.slug} href={`/services/${s.slug}`} className="group">
                  <div className="relative aspect-[4/3] overflow-hidden bg-navy-900">
                    {s.image ? (
                      <Image
                        src={s.image.src}
                        alt={s.image.alt}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full place-items-center bg-gradient-to-br from-navy-800 to-navy-950 text-sea-300">
                        <Icon name={s.icon} className="h-12 w-12" />
                      </div>
                    )}
                  </div>
                  <h3 className="mt-5 font-display text-2xl text-navy-900 group-hover:text-sea-700">{copy.name}</h3>
                  <p className="mt-2 text-navy-600">{copy.short}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.25em] text-sea-600">{fromPrice(s)}</p>
                </Link>
              );
            })}
          </div>
          {featured && (
            <Link href={`/services/${featured.slug}`} className="group mt-16 grid gap-6 bg-navy-950 p-10 text-white sm:p-14 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sea-300">Consultancy</p>
                <h3 className="mt-3 font-display text-4xl group-hover:text-sea-300">{serviceCopy(market.id, featured).name}</h3>
                <p className="mt-4 max-w-2xl text-white/75">{serviceCopy(market.id, featured).intro}</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-sea-300">{fromPrice(featured)} · Discover</span>
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sea-600">Brokerage</p>
            <h2 className="mt-3 font-display text-4xl text-navy-900 sm:text-5xl">Yachts for sale</h2>
          </div>
          <Link href="/boats/sell" className="text-sm font-semibold uppercase tracking-widest text-navy-900 underline decoration-sea-400 underline-offset-8">
            Sell your yacht with us
          </Link>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {listings.map((b) => (
            <Link key={b.slug} href={`/boats/${b.slug}`} className="group border border-navy-100 bg-white">
              <div className="relative grid aspect-[4/3] place-items-center bg-gradient-to-br from-navy-800 to-navy-950 text-sea-300">
                <Icon name="boat" className="h-14 w-14" />
                <span className="absolute left-4 top-4 bg-white/90 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-widest text-navy-900">
                  {b.status}
                </span>
              </div>
              <div className="p-6">
                <h3 className="font-display text-2xl text-navy-900">{b.year} {b.title}</h3>
                <p className="mt-1 text-sm text-navy-500">{b.location}</p>
                <p className="mt-4 font-display text-2xl text-navy-900">{formatPrice(b.price)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-navy-950 py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sea-300">Partners</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl sm:text-5xl">Working alongside Malta&apos;s marine specialists</h2>
          <div className="mt-14 grid gap-px bg-white/10 md:grid-cols-2">
            {partners.map((p) => (
              <div key={p.name} className="bg-navy-950 p-10">
                <h3 className="font-display text-3xl text-sea-300">{p.name}</h3>
                <p className="mt-4 max-w-md text-white/75">{p.description}</p>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block text-sm font-semibold uppercase tracking-widest text-white underline decoration-sea-400 underline-offset-8">
                    Visit {p.name}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
