import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "odowdscarrick.com", pathname: "/wp-content/uploads/**" },
      { protocol: "https", hostname: "www.odowdscarrick.com", pathname: "/wp-content/uploads/**" },
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
