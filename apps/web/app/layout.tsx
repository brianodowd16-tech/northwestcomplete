import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";
import { Toaster } from "@/components/Toasts";

export const metadata: Metadata = {
  title: "The Snug Club",
  description: "Order, pay and earn at your local",
  appleWebApp: { capable: true, title: "Snug Club" },
  icons: { icon: "/api/icon/platform/192", apple: "/api/icon/platform/180" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#2b5a4a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IE">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap"
        />
      </head>
      <body>
        {children}
        <Toaster />
        <RegisterSW />
      </body>
    </html>
  );
}
