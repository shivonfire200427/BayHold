import type { Metadata, Viewport } from "next";
import { Bebas_Neue, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Header } from "@/components/Header";
import { themeBootScript } from "@/lib/theme";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// Same type system as ecurious.com: Space Grotesk for text, JetBrains Mono for data, Bebas Neue for display.
const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const display = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: {
    default: "Watt · A charging bay that is free when you arrive",
    template: "%s · Watt",
  },
  description:
    "Find public EV chargers from GoingElectric, reserve a bay held by ËCURIOUS hardware, and check in by licence plate.",
  applicationName: "Watt",
  appleWebApp: { capable: true, title: "Watt", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Watt · Reserve a charging bay",
    description: "A charging bay that is free when you arrive. Built for the ËCURIOUS challenge.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F4F1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
