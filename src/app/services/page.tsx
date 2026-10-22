import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { services } from "@/data/services";
import { formatPrice } from "@/lib/site";

export const metadata: Metadata = {
  title: "Marine Services",
  description: "Book marine mechanical, polishing, fiberglass, welding, electrical, solar, cleaning, brokerage and engine sourcing services in the North West of Ireland.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="Book online or get a fixed quote"
        intro="Standard jobs can be booked and paid for online. Bigger projects start with an inspection or deposit and a fixed written quote."
      />
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-14 sm:px-6">
        {services.map((s) => (
          <article key={s.slug} className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[auto_1fr_auto] md:items-center">
            {s.image ? (
              <Image
                src={s.image.src}
                alt={s.image.alt}
                width={s.image.width}
                height={s.image.height}
                sizes="112px"
                className="h-[104px] w-28 rounded-xl object-cover"
              />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-navy-50 text-navy-700">
                <Icon name={s.icon} className="h-7 w-7" />
              </span>
            )}
            <div>
              <h2 className="font-display text-xl font-semibold text-navy-900">{s.name}</h2>
              <p className="mt-1 text-slate-600">{s.short}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {s.options.map((o) => (
                  <li key={o.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                    {o.name} · {formatPrice(o.price)}{o.unit === "per-foot" ? "/ft" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <Link href={`/services/${s.slug}`} className="rounded-md bg-sea-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-sea-700">
              View & book
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}
