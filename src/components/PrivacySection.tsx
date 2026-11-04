import { Emblem } from "./Emblem";

const PILLARS = [
  {
    label: "Identity",
    value: "NO KYC",
    detail: "No government ID, phone, selfie or billing address.",
  },
  {
    label: "Contact",
    value: "EMAIL ONLY",
    detail: "One address, used for credentials and support.",
  },
  {
    label: "Payment",
    value: "CRYPTO ONLY",
    detail: "Zeno checkout in USD. No card details touch this site.",
  },
  {
    label: "Accounts",
    value: "NONE",
    detail: "The order link is the credential; keep it private.",
  },
] as const;

export function PrivacySection({ index = "04" }: { index?: string }) {
  return (
    <section className="section" id="privacy">
      <div className="section-label">
        <Emblem className="section-emblem" />[{index} // PRIVACY]
      </div>
      <div className="section-head">
        <h2>Anonymous by design.</h2>
        <p>
          No identity check, no customer account, no card trail. Email is the only identifier we ask
          for, and crypto is the only payment rail.
        </p>
      </div>

      <div className="system-grid">
        {PILLARS.map((item) => (
          <div className="system-item" key={item.label}>
            <span className="system-label">{item.label}</span>
            <span className="system-value">{item.value}</span>
            <span className="system-detail">{item.detail}</span>
          </div>
        ))}
      </div>

      <p className="legal-note">
        Anonymity is about what we collect, not immunity from lawful process. Use a VPN or Tor on
        first login if your threat model needs it, and keep the server lawful. Read the{" "}
        <a href="/privacy">Privacy Policy</a> and{" "}
        <a href="/acceptable-use">Acceptable Use Policy</a>.
      </p>
    </section>
  );
}
