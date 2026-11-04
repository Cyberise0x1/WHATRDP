import { LEGAL_ENTITY, mailto } from "@/lib/legal";

export function LegalContact({ kind = "contact" }: { kind?: "contact" | "support" }) {
  const email = kind === "support" ? LEGAL_ENTITY.supportEmail : LEGAL_ENTITY.contactEmail;
  const href = mailto(email);

  if (!href) return <span>{email}</span>;
  return <a href={href}>{email}</a>;
}
