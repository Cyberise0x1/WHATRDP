export const LEGAL_LAST_UPDATED = "4 November 2026";

export const LEGAL_ENTITY = {
  tradingName: "WHATRDP",
  legalName: "[LEGAL ENTITY NAME]",
  address: "[REGISTERED ADDRESS]",
  jurisdiction: "[JURISDICTION]",
  companyNumber: "[COMPANY / RC NUMBER, IF APPLICABLE]",
  contactEmail: "[CONTACT EMAIL]",
  supportEmail: "[SUPPORT EMAIL]",
  website: "https://whatrdp.com",
} as const;

export const BACKER = {
  name: "Cyberise",
  url: "https://cyberise.org",
} as const;

export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of service" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/refund", label: "Refund policy" },
  { href: "/acceptable-use", label: "Acceptable use" },
] as const;

export function mailto(email: string): string | undefined {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? `mailto:${email}` : undefined;
}
