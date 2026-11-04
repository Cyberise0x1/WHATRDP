import { Emblem } from "@/components/Emblem";
import { BACKER, LEGAL_ENTITY, LEGAL_LINKS, mailto } from "@/lib/legal";

export function SiteFooter() {
  const contactHref = mailto(LEGAL_ENTITY.contactEmail);

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <a className="brand footer-brand" href="/" aria-label="WHATRDP home">
          <Emblem className="footer-emblem" />
          <span className="brand-text">
            <span className="brand-name">WHATRDP</span>
            <span className="brand-sub">KNOWING WHAT REMOTE MEANS</span>
          </span>
        </a>
        <p className="footer-tag">Anonymous Windows RDP and Linux VPS.</p>
        <p className="footer-note">
          No KYC, no account. Email-only credential delivery. Crypto checkout in USD via Zeno. EU +
          US.
        </p>
        <p className="footer-note">
          <a href={BACKER.url} target="_blank" rel="noopener noreferrer">
            A {BACKER.name} project
          </a>
        </p>
      </div>

      <div className="footer-links">
        <div>
          <span className="footer-label">SITE</span>
          <a href="/anonymous-vps">Anonymous</a>
          <a href="/#catalogue">Servers</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/#faq">FAQ</a>
        </div>
        <div>
          <span className="footer-label">LEGAL</span>
          {LEGAL_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
        <div>
          <span className="footer-label">CONTACT</span>
          {contactHref ? (
            <a href={contactHref}>{LEGAL_ENTITY.contactEmail}</a>
          ) : (
            <span className="footer-placeholder">{LEGAL_ENTITY.contactEmail}</span>
          )}
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} WHATRDP · A CYBERISE PROJECT</span>
        <span>NO KYC · CRYPTO CHECKOUT · EU + US</span>
      </div>
    </footer>
  );
}
