import { venueBySlug } from "@round/db/services";

/** Each venue installs as its own app: its name, colour and icon (white-label). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const v = await venueBySlug((await ctx.params).slug).catch(() => null);
  if (!v) return new Response("Not found", { status: 404 });
  const color = /^#[0-9a-fA-F]{6}$/.test(v.brandColor) ? v.brandColor : "#2b5a4a";
  return Response.json(
    {
      id: `/v/${v.slug}`,
      name: v.name,
      short_name: v.name.length > 12 ? v.name.split(/[\s']/)[0] : v.name,
      description: v.tagline || `Order, pay and earn rewards at ${v.name}`,
      start_url: `/v/${v.slug}?source=app`,
      scope: `/v/${v.slug}`,
      display: "standalone",
      orientation: "portrait",
      background_color: "#EEF0EC",
      theme_color: color,
      icons: [192, 512].flatMap((s) => [
        { src: `/api/icon/${v.slug}/${s}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" },
        { src: `/api/icon/${v.slug}/${s}?maskable=1`, sizes: `${s}x${s}`, type: "image/png", purpose: "maskable" },
      ]),
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
