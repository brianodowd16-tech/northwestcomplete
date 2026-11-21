import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Enquire } from "@/components/Enquire";
import { SafeImage } from "@/components/SafeImage";
import { getCategory, getContentPage } from "@/lib/content";

export const revalidate = 3600;

// Rendered on first visit, then cached (300+ pages: no need to build them all up front).
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ category: string; item: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { item } = await params;
  const page = await getContentPage(item).catch(() => null);
  return page ? { title: page.title, description: page.text[0]?.slice(0, 160) ?? `${page.title}, on display at O'Dowds.` } : {};
}

export default async function RangeItemPage({ params }: Props) {
  const { category, item } = await params;
  const cat = getCategory(category);
  if (!cat || !/^[a-z0-9-]+$/.test(item)) notFound();
  const page = await getContentPage(item);
  if (!page) notFound();

  return (
    <div className="wrap" style={{ paddingBottom: 96 }}>
      <ol className="crumbs">
        <li><Link href="/">Home</Link></li>
        <li><Link href="/range">Our range</Link></li>
        <li><Link href={`/range/${cat.slug}`}>{cat.name}</Link></li>
        <li aria-current="page">{page.title}</li>
      </ol>
      <h1>{page.title}</h1>
      {page.text.map((t, i) => <p key={i} className="lead">{t}</p>)}
      {page.images.length > 0 && (
        <div className="photo-grid" style={{ marginTop: 24 }}>
          {page.images.map((src, i) => (
            <div key={src} className="photo">
              <SafeImage src={src} alt={`${page.title}, image ${i + 1}`} fill sizes="(max-width: 600px) 100vw, 400px" priority={i === 0} />
            </div>
          ))}
        </div>
      )}
      <Enquire subject={`the ${page.title}`} />
    </div>
  );
}
