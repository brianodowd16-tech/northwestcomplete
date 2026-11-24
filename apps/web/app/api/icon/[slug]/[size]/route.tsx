import { venueBySlug } from "@round/db/services";
import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** App icon: the venue's initials on its brand colour. "platform" is Complete's own icon. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size: s } = await ctx.params;
  const size = Number(s);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  let name = "Complete";
  let color = "#2b5a4a";
  if (slug !== "platform") {
    const v = await venueBySlug(slug).catch(() => null);
    if (!v) return new Response("Not found", { status: 404 });
    name = v.name;
    if (/^#[0-9a-fA-F]{6}$/.test(v.brandColor)) color = v.brandColor;
  }
  const words = name.replace(/^the\s+/i, "").split(/[\s-]+/).filter((w) => /[A-Za-z]/.test(w));
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "S").slice(0, 2)).toUpperCase();
  const maskable = new URL(req.url).searchParams.has("maskable");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: color, borderRadius: maskable ? 0 : size * 0.22 }}>
        <span style={{ color: "#fff", fontSize: size * (maskable ? 0.32 : 0.42), fontWeight: 800, letterSpacing: -size * 0.01 }}>{initials}</span>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
