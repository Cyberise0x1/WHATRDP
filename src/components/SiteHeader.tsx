import { Emblem } from "@/components/Emblem";

const NAV = [
  { href: "/#catalogue", label: "SERVERS" },
  { href: "/anonymous-vps", label: "ANONYMOUS" },
  { href: "/#how-it-works", label: "HOW IT WORKS" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader({ checkoutOpen }: { checkoutOpen: boolean }) {
  return (
    <header className="site-header">
      <div className="topbar">
        <span className="topbar-brand">WHATRDP // REMOTE ACCESS</span>
        <span className="topbar-status">
          <span className={checkoutOpen ? "status-dot live" : "status-dot"} aria-hidden="true" />
          {checkoutOpen ? "CHECKOUT OPEN" : "CHECKOUT CLOSED"}
          <span className="topbar-sep">·</span>
          NO KYC
          <span className="topbar-sep">·</span>
          USD / CRYPTO
        </span>
      </div>

      <div className="header-main">
        <a className="brand" href="/" aria-label="WHATRDP home">
          <Emblem className="brand-emblem" />
          <span className="brand-text">
            <span className="brand-name">WHATRDP</span>
            <span className="brand-sub">KNOWING WHAT REMOTE MEANS</span>
          </span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <a className="button primary small" href="/#catalogue">
            DEPLOY
          </a>
          <details className="mobile-menu">
            <summary>MENU</summary>
            <nav className="mobile-menu-panel" aria-label="Primary mobile">
              {NAV.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
              <a href="/#catalogue">DEPLOY</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
