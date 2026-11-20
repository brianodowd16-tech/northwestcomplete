import type { NextConfig } from "next";

// Where WordPress/WooCommerce lives. After the DNS cutover this becomes a
// subdomain (e.g. https://admin.odowdscarrick.com) and the storefront owns
// odowdscarrick.com, so old /wp-content image links are passed through.
const wc = new URL(process.env.WC_URL || "https://odowdscarrick.com");
const wcMovedOff = !["odowdscarrick.com", "www.odowdscarrick.com"].includes(wc.hostname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "odowdscarrick.com", pathname: "/wp-content/uploads/**" },
      { protocol: "https", hostname: "www.odowdscarrick.com", pathname: "/wp-content/uploads/**" },
      ...(wcMovedOff && wc.protocol === "https:" ? [{ protocol: "https" as const, hostname: wc.hostname, pathname: "/wp-content/uploads/**" }] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async rewrites() {
    return wcMovedOff && wc.protocol === "https:" ? [{ source: "/wp-content/:path*", destination: `${wc.origin}/wp-content/:path*` }] : [];
  },
  async redirects() {
    // Old WordPress URLs keep working after the DNS cutover.
    return [
      { source: "/about-us", destination: "/about", permanent: true },
      { source: "/contact-us", destination: "/contact", permanent: true },
      { source: "/maintenance-and-servicing", destination: "/servicing", permanent: true },
      { source: "/clearance", destination: "/shop", permanent: true },
      { source: "/product/:slug", destination: "/shop/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
