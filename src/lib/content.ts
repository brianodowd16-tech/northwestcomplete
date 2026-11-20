import "server-only";
import { WC_URL } from "./config";
import { decodeEntities } from "./woo";

/**
 * Showroom range content. The range lives in WordPress pages (built with
 * Elementor), so the existing admin stays the place to edit it; this module
 * turns that markup into plain data.
 */

export const CONTENT_TAG = "content";

export const RANGE_CATEGORIES = [
  { slug: "stoves", name: "Stoves", blurb: "Wood-burning and multi-fuel stoves from Stovax, Gazco, Jøtul and more." },
  { slug: "fireplaces", name: "Fireplaces", blurb: "Marble, cast iron, timber and limestone surrounds for every room." },
  { slug: "pellet-stoves", name: "Pellet Stoves", blurb: "Clean, automatic heat with programmable pellet stoves and boilers." },
  { slug: "electric-fires", name: "Electric Fires", blurb: "Realistic flame effects with zero flue, zero fuss." },
  { slug: "gas-fires", name: "Gas Fires", blurb: "Instant, controllable warmth in inset and freestanding designs." },
  { slug: "oil-fires", name: "Oil Stoves", blurb: "Efficient oil-fired stoves for homes off the gas network." },
  { slug: "beams", name: "Beams", blurb: "Solid oak and reclaimed-look beams to finish your fireplace." },
  { slug: "fireplace-accessories", name: "Accessories", blurb: "Companion sets, baskets, ash vacuums, chimney brushes and more." },
  { slug: "firewood", name: "Firewood & Charcoal", blurb: "Kiln-dried logs, kindling and premium charcoal." },
  { slug: "bbq-outdoor", name: "BBQ & Outdoor", blurb: "Kamados, fire pits, garden stoves and outdoor living." },
] as const;

export type RangeCategory = (typeof RANGE_CATEGORIES)[number];
export const getCategory = (slug: string) => RANGE_CATEGORIES.find((c) => c.slug === slug);

export type RangeItem = { slug: string; title: string; image: string | null };
export type RangeGroup = { logo: string | null; text: string[]; items: RangeItem[] };
export type RangePage = { title: string; groups: RangeGroup[]; images: string[]; text: string[] };

type WpPage = { id: number; slug: string; title: { rendered: string }; content: { rendered: string }; modified: string };

async function wpPage(slug: string): Promise<WpPage | null> {
  const res = await fetch(
    `${WC_URL}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=id,slug,title,content,modified`,
    { next: { revalidate: 3600, tags: [CONTENT_TAG] } },
  );
  if (!res.ok) throw new Error(`WordPress page ${slug} → ${res.status}`);
  const list = (await res.json()) as WpPage[];
  return list[0] ?? null;
}

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Turns a link to an old WordPress page into its slug, or null for anything else. */
export function slugFromHref(href: string): string | null {
  const m = /^(?:https?:)?\/\/(?:www\.)?odowdscarrick\.com\/([a-z0-9-]+)\/?(?:[?#].*)?$/i.exec(href.trim());
  return m ? m[1].toLowerCase() : null;
}

// Contact boilerplate repeated on every range page; the new layout has its own.
const BOILERPLATE = /(contact us|tel:|email:|station road|carrick on shannon)/i;

/** Splits Elementor markup into its widgets, in page order. */
function widgets(html: string): { type: string; html: string }[] {
  const re = /data-widget_type="([a-z0-9_.-]+)"/gi;
  const marks: { type: string; index: number }[] = [];
  for (let m; (m = re.exec(html)); ) marks.push({ type: m[1].split(".")[0], index: m.index });
  return marks.map((mk, i) => ({ type: mk.type, html: html.slice(mk.index, marks[i + 1]?.index ?? html.length) }));
}

const imgSrcs = (html: string) => [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);

const paragraphs = (html: string) =>
  [...html.matchAll(/<(p|li|h[2-6])[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => stripTags(m[2]))
    .filter((t) => t.length > 1 && !BOILERPLATE.test(t));

export function parseRangeHtml(title: string, html: string): RangePage {
  const groups: RangeGroup[] = [];
  const images: string[] = [];
  const text: string[] = [];
  let current: RangeGroup | null = null;
  const group = () => (current ??= (groups.push({ logo: null, text: [], items: [] }), groups[groups.length - 1]));

  for (const w of widgets(html)) {
    if (w.type === "image") {
      const src = imgSrcs(w.html)[0];
      if (!src) continue;
      images.push(src);
      // A standalone image before a run of item boxes is the brand logo for that run.
      current = { logo: src, text: [], items: [] };
      groups.push(current);
    } else if (w.type === "text-editor" || w.type === "heading") {
      const t = paragraphs(w.html);
      if (!t.length) {
        const plain = stripTags(w.html);
        if (plain && !BOILERPLATE.test(plain)) t.push(plain);
      }
      text.push(...t);
      group().text.push(...t);
    } else if (w.type === "image-box") {
      const href = /<a[^>]+href="([^"]+)"/i.exec(w.html)?.[1];
      const slug = href ? slugFromHref(href) : null;
      const titleHtml = /class="elementor-image-box-title"[^>]*>([\s\S]*?)<\/h\d>/i.exec(w.html)?.[1] ?? "";
      const itemTitle = stripTags(titleHtml);
      const image = imgSrcs(w.html)[0] ?? null;
      if (slug && itemTitle) group().items.push({ slug, title: itemTitle, image });
    } else if (w.type === "image-carousel" || w.type === "image-gallery") {
      images.push(...imgSrcs(w.html));
    }
  }

  // Drop logo-only groups that never got any items or text.
  const kept = groups.filter((g) => g.items.length || g.text.length);
  return { title, groups: kept, images: [...new Set(images)], text };
}

export async function getRangePage(slug: string): Promise<RangePage | null> {
  const page = await wpPage(slug);
  if (!page) return null;
  return parseRangeHtml(decodeEntities(page.title.rendered), page.content.rendered);
}

export type ContentPage = { title: string; text: string[]; images: string[] };

/** Plain text + images for simple pages (about, servicing, range items). */
export async function getContentPage(slug: string): Promise<ContentPage | null> {
  const page = await wpPage(slug);
  if (!page) return null;
  const html = page.content.rendered;
  const text = paragraphs(html);
  const images = [...new Set(imgSrcs(html))].filter((src) => !/logo|favicon|trustindex/i.test(src));
  return { title: decodeEntities(page.title.rendered), text, images };
}
