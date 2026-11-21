import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, Instrument_Serif } from "next/font/google";
import { CartProvider } from "@/components/cart";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SITE_URL, STORE } from "@/lib/config";
import { RANGE_CATEGORIES } from "@/lib/content";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", weight: ["500", "600", "700"] });
const instrument = Instrument_Serif({ subsets: ["latin"], variable: "--font-instrument", display: "swap", weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${STORE.name} | Carrick-on-Shannon`, template: `%s | ${STORE.shortName} Fireplaces & Stoves` },
  description:
    "Fireplace and stove specialists in Carrick-on-Shannon since 1967. Stoves, fireplaces, gas, electric and pellet fires from leading European makers, with 80+ live displays, expert consultation and workshop servicing.",
  openGraph: { type: "website", siteName: STORE.name, locale: "en_IE", images: [STORE.heroImage] },
  icons: { icon: "https://odowdscarrick.com/wp-content/uploads/2020/02/odowds-favicon-100x100.png" },
};

export const viewport: Viewport = { themeColor: "#121110" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const categories = RANGE_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, blurb: c.blurb }));
  return (
    <html lang="en-IE" className={`${inter.variable} ${interTight.variable} ${instrument.variable}`}>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <CartProvider>
          <Header logo={STORE.logo} categories={categories} />
          <main id="main">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
