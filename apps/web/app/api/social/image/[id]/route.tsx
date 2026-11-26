import { postById } from "@round/db/social";
import { venueById } from "@round/db/services";
import { ImageResponse } from "next/og";
import sharp from "sharp";

/**
 * The square picture for a post (Instagram needs one, as a JPEG). Shows only the post's
 * title and subtitle in the venue's colour: it's fetched by Meta, so it's public.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id.replace(/\.jpe?g$/, "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const p = await postById(id);
  if (!p) return new Response("Not found", { status: 404 });
  const v = p.venueId ? await venueById(p.venueId) : null;
  const color = v?.brandColor && /^#[0-9a-f]{6}$/i.test(v.brandColor) ? v.brandColor : "#1f6f50";
  const png = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: color, color: "white", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 34, opacity: 0.85, display: "flex" }}>{v?.name ?? "Complete"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: p.imageTitle.length > 28 ? 72 : 96, fontWeight: 800, lineHeight: 1.05, display: "flex" }}>{p.imageTitle || v?.name || "What's on"}</div>
          <div style={{ fontSize: 38, opacity: 0.9, display: "flex" }}>{p.imageSubtitle}</div>
        </div>
        <div style={{ fontSize: 28, opacity: 0.75, display: "flex" }}>complete.pub</div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 88 }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
}
