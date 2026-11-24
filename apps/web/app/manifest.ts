import type { MetadataRoute } from "next";

/** Complete app itself: staff screens, back office and finding venues. Each venue also installs as its own app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Complete",
    short_name: "Complete",
    description: "Order, pay and earn rewards at bars, hotels and restaurants. Staff screens and back office for venues.",
    start_url: "/?source=app",
    display: "standalone",
    background_color: "#EEF0EC",
    theme_color: "#2b5a4a",
    icons: [192, 512].map((s) => ({ src: `/api/icon/platform/${s}`, sizes: `${s}x${s}`, type: "image/png" })),
  };
}
