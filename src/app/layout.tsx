import type { Metadata, Viewport } from "next";
import { Handjet, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { checkoutEnabled } from "@/lib/checkout-policy";

const display = Handjet({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WHATRDP — Anonymous remote desktops, provisioned.",
  description:
    "Anonymous Windows RDP and Linux VPS with full administrator access. No KYC, no account, email-only delivery, crypto checkout in USD, EU + US.",
};

export const viewport: Viewport = {
  themeColor: "#14110e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <SiteHeader checkoutOpen={checkoutEnabled()} />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
