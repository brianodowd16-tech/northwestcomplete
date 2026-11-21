import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { CartProvider } from "@/lib/cart";
import { getMarket, MARKET_IDS, MARKETS, site } from "@/lib/site";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const practical = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const luxury = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display", display: "swap" });

type Params = Promise<{ market: string }>;

export function generateStaticParams() {
  return MARKET_IDS.map((market) => ({ market }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const m = getMarket((await params).market);
  const description =
    m.id === "mt"
      ? "Northwest Yachting: discreet yacht management, engineering, paint and gelcoat correction, refit, energy systems, brokerage and marina consultancy for yacht owners in Malta and Gozo."
      : "Marine mechanical services, machine polishing, fiberglass restoration, welding, electrical, solar & battery systems, deep cleaning, boat brokerage and engine sourcing in the North West of Ireland.";
  return {
    metadataBase: new URL(m.url),
    title: { default: `${m.name} | ${m.tagline}`, template: `%s | ${m.name}` },
    description,
    alternates: { languages: { "en-MT": MARKETS.mt.url, "en-IE": MARKETS.ie.url } },
    openGraph: {
      type: "website",
      siteName: m.name,
      locale: m.id === "mt" ? "en_MT" : "en_IE",
      url: m.url,
      images: [{ url: "/images/hero-yacht.webp", width: 1600, height: 901 }],
    },
  };
}

export const viewport: Viewport = { themeColor: "#0b0b0a" };

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { market: id } = await params;
  if (!(MARKET_IDS as string[]).includes(id)) notFound();
  const m = getMarket(id);
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: m.name,
    url: m.url,
    email: site.email,
    telephone: site.phone,
    areaServed: m.countries.map((name) => ({ "@type": "Country", name })),
    address: { "@type": "PostalAddress", addressCountry: m.id === "mt" ? "MT" : "IE" },
    priceRange: m.luxury ? "€€€€" : "€€",
  };

  return (
    <html lang={m.id === "mt" ? "en-MT" : "en-IE"} data-market={m.id} className={`${sans.variable} ${(m.luxury ? luxury : practical).variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
        <CartProvider>
          <Header market={m} />
          <main className="flex-1">{children}</main>
          <Footer market={m} />
          <WhatsAppButton />
        </CartProvider>
      </body>
    </html>
  );
}
