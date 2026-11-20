import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Enquire } from "@/components/Enquire";
import { SafeImage } from "@/components/SafeImage";
import { RANGE_CATEGORIES, getCategory, getRangePage } from "@/lib/content";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return RANGE_CATEGORIES.map((c) => ({ category: c.slug }));
}

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = getCategory((await params).category);
  return cat ? { title: cat.name, description: cat.blurb } : {};
}

export default async function CategoryPage({ params }: Props) {
  const cat = getCategory((await params).category);
  if (!cat) notFound();
  const page = await getRangePage(cat.slug);
  const groups = page?.groups ?? [];
  const hasItems = groups.some((g) => g.items.length);

  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <ol className="crumbs">
        <li><Link href="/">Home</Link></li>
        <li><Link href="/range">Our range</Link></li>
        <li aria-current="page">{cat.name}</li>
      </ol>
      <header style={{ paddingBottom: 16 }}>
        <h1>{cat.name}</h1>
        <p className="lead">{cat.blurb}</p>
      </header>

      {groups.map((g, gi) => (
        <section key={gi} className="brand-group">
          {g.logo && (
            <div className="brand-logo">
              <Image src={g.logo} alt="" fill sizes="260px" />
            </div>
          )}
          {g.text.slice(0, 3).map((t, i) => (
            <p key={i} className="muted" style={{ maxWidth: "75ch" }}>{t}</p>
          ))}
          {g.items.length > 0 && (
            <div className="grid" style={{ marginTop: 16 }}>
              {g.items.map((item, i) => (
                <Link key={`${item.slug}-${i}`} href={`/range/${cat.slug}/${item.slug}`} className="card range-card">
                  <div className="card__media">
                    {item.image && <SafeImage src={item.image} alt={item.title} fill sizes="(max-width: 600px) 100vw, 300px" priority={gi === 0 && i < 4} />}
                  </div>
                  <div className="card__body">
                    <h3 className="card__title">{item.title}</h3>
                    <span className="muted" style={{ fontSize: ".9rem" }}>View details →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}

      {!hasItems && page && page.images.length > 0 && (
        <div className="photo-grid">
          {page.images.map((src) => (
            <div key={src} className="photo"><SafeImage src={src} alt={cat.name} fill sizes="(max-width: 600px) 100vw, 400px" /></div>
          ))}
        </div>
      )}

      <Enquire subject={cat.name.toLowerCase()} />
    </div>
  );
}
