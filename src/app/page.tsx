import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import { boats } from "@/data/boats";
import { products } from "@/data/products";
import { services } from "@/data/services";
import { formatPrice, site } from "@/lib/site";

export default function HomePage() {
  const featured = products.filter((p) => p.inStock).slice(0, 4);
  const listings = boats.filter((b) => b.status !== "Sold").slice(0, 3);

  return (
    <>
      <section className="hero-bg relative text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-28 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-sea-200">
              <Icon name="pin" className="h-4 w-4" /> {site.region}
            </p>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight sm:text-6xl">
              Everything your boat needs, <span className="text-sea-300">from one crew.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              Mechanical servicing, machine polishing, fiberglass restoration, welding, electrical and solar fit-outs,
              deep cleaning — plus boat sales and engine sourcing. Book and pay online, or get a fixed quote.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/services" className="rounded-md bg-sea-500 px-6 py-3 font-semibold text-navy-950 transition hover:bg-sea-400">
                Book a service
              </Link>
              <Link href="/contact?type=quote" className="rounded-md border border-white/30 px-6 py-3 font-semibold transition hover:bg-white/10">
                Request a quote
              </Link>
              <Link href="/boats" className="rounded-md px-6 py-3 font-semibold text-sea-200 transition hover:text-white">
                Boats for sale →
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["wrench", "Mobile engineers", "We come to your marina, mooring or yard"],
              ["shield", "Fixed written quotes", "No surprises on the invoice"],
              ["sun", "Off-grid specialists", "Solar & lithium designed to your use"],
              ["anchor", "Engineers who sell boats", "Every listing inspected by us"],
            ].map(([icon, title, text]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <Icon name={icon} className="h-6 w-6 text-sea-300" />
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-white/70">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="waves absolute inset-x-0 bottom-0 h-16" aria-hidden="true" />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-sea-700">What we do</p>
            <h2 className="mt-1 font-display text-3xl font-bold text-navy-900">Marine services</h2>
          </div>
          <Link href="/services" className="font-semibold text-sea-700 hover:text-sea-800">All services →</Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const from = Math.min(...s.options.map((o) => o.price));
            const perFoot = s.options.every((o) => o.unit === "per-foot");
            return (
              <Link
                key={s.slug}
                href={`/services/${s.slug}`}
                className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sea-300 hover:shadow-md"
              >
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-navy-50 text-navy-700 group-hover:bg-sea-500 group-hover:text-white">
                  <Icon name={s.icon} />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-navy-900">{s.name}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.short}</p>
                <p className="mt-4 text-sm font-semibold text-sea-700">
                  From {formatPrice(from)}{perFoot ? " / ft" : ""}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-sea-700">Brokerage</p>
              <h2 className="mt-1 font-display text-3xl font-bold text-navy-900">Boats for sale</h2>
            </div>
            <div className="flex gap-4">
              <Link href="/boats/sell" className="font-semibold text-navy-700 hover:text-navy-900">Sell your boat</Link>
              <Link href="/boats" className="font-semibold text-sea-700 hover:text-sea-800">All listings →</Link>
            </div>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {listings.map((b) => (
              <Link key={b.slug} href={`/boats/${b.slug}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:shadow-md">
                <div className="product-tile relative grid aspect-[16/9] place-items-center text-white">
                  <Icon name="boat" className="h-16 w-16 opacity-80" />
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-navy-900">{b.status}</span>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-semibold text-navy-900">{b.year} {b.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{b.location}</p>
                  <p className="mt-3 text-lg font-bold text-navy-900">{formatPrice(b.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-sea-700">Shop</p>
            <h2 className="mt-1 font-display text-3xl font-bold text-navy-900">Parts, care products & vouchers</h2>
          </div>
          <Link href="/shop" className="font-semibold text-sea-700 hover:text-sea-800">Visit the shop →</Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="hero-bg text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold">Need a replacement engine?</h2>
            <p className="mt-3 max-w-lg text-white/80">
              Tell us what you&apos;ve got and what you need. We source new, reconditioned and inspected used engines and
              gearboxes through our trade network — then supply, fit and commission them.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link href="/engine-sourcing" className="rounded-md bg-brass-500 px-6 py-3 font-semibold text-navy-950 hover:bg-brass-400">
              Start an engine search
            </Link>
            <Link href="/contact" className="rounded-md border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
