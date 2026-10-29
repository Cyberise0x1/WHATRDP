import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cloud servers — instant delivery",
  description:
    "Windows RDP and Linux VPS provisioned in seconds. Full admin access, NVMe storage, EU and US locations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a className="brand" href="/">
            <span className="brand-mark">◆</span>
            <span>NodeForge</span>
          </a>
          <nav>
            <a href="#plans">Plans</a>
            <a href="#faq">FAQ</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <span>© {new Date().getFullYear()} NodeForge</span>
          <span>Instant provisioning · Full admin access · EU &amp; US</span>
        </footer>
      </body>
    </html>
  );
}
