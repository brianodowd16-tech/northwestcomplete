import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { CartProvider } from "@/components/cart";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SITE_URL, STORE } from "@/lib/config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${STORE.name} | Carrick-on-Shannon`, template: `%s | ${STORE.shortName} Fireplaces & Stoves` },
  description:
    "Family-run fireplace and stove specialists in Carrick-on-Shannon since 1967. Stoves, fireplaces, gas, electric and pellet fires with 80+ live displays, expert fitting advice and servicing.",
  openGraph: { type: "website", siteName: STORE.name, locale: "en_IE", images: [STORE.heroImage] },
  icons: { icon: "https://odowdscarrick.com/wp-content/uploads/2020/02/odowds-favicon-100x100.png" },
};

export const viewport: Viewport = { themeColor: "#1d1a17" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IE" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <CartProvider>
          <Header logo={STORE.logo} phone={STORE.phone} phoneIntl={STORE.phoneIntl} />
          <main id="main">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
