import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, LEGAL_LINKS } from "@/lib/legal";
import { LegalContact } from "@/components/LegalContact";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <article className="legal">
      {children}

      <footer className="legal-meta">
        <p>
          Last updated {LEGAL_LAST_UPDATED}. These policies apply to {LEGAL_ENTITY.website} and are
          operated by {LEGAL_ENTITY.legalName}, {LEGAL_ENTITY.address}, {LEGAL_ENTITY.jurisdiction}.
          Contact: <LegalContact />.
        </p>
        <nav className="legal-links" aria-label="Legal policies">
          {LEGAL_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </footer>
    </article>
  );
}
