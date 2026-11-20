import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { CartProvider } from "@/lib/cart";
import { site } from "@/lib/site";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | Marine Services, Restoration & Boat Sales — Ireland & Malta`,
    template: `%s | ${site.name}`,
  },
  description:
    "Marine mechanical services, machine polishing, fiberglass restoration, welding, electrical, solar & battery systems, deep cleaning, boat brokerage and engine sourcing across Ireland and Malta.",
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: "en_IE",
    url: site.url,
    images: [{ url: "/images/hero-yacht.webp", width: 1600, height: 901 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#081224",
};

const localBusiness = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: site.name,
  url: site.url,
  email: site.email,
  telephone: site.phone,
  areaServed: site.countries.map((name) => ({ "@type": "Country", name })),
  address: { "@type": "PostalAddress", addressCountry: "IE" },
  priceRange: "€€",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IE" className={`${sans.variable} ${display.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <WhatsAppButton />
        </CartProvider>
      </body>
    </html>
  );
}
