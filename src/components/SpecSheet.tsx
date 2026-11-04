import { Emblem } from "./Emblem";

const SPECS = [
  {
    label: "Admin access",
    value: "FULL",
    detail: "Windows Administrator or Linux root. No locked-down control panel.",
  },
  {
    label: "Operating systems",
    value: "WINDOWS / LINUX",
    detail: "Windows Server 2022 and current Linux images from live inventory.",
  },
  {
    label: "Storage",
    value: "NVMe",
    detail: "NVMe storage as listed on the selected plan; capacity is shown per plan.",
  },
  {
    label: "Network",
    value: "1 / 10 GBPS",
    detail: "The network tier is shown with the plan; IPv4 is included as listed.",
  },
  {
    label: "Locations",
    value: "EU + US",
    detail: "Live stock in European and United States regions.",
  },
  {
    label: "Delivery",
    value: "PAGE + EMAIL",
    detail: "Credentials appear when the server is active; one email is sent.",
  },
  {
    label: "Checkout",
    value: "USD / CRYPTO",
    detail: "Zeno hosts the checkout. Crypto only; card details never touch this site.",
  },
  {
    label: "Support",
    value: "EMAIL ONLY",
    detail: "No account or phone support. We handle orders by email.",
  },
] as const;

export function SpecSheet() {
  return (
    <section className="section" id="machine">
      <div className="section-label">
        <Emblem className="section-emblem" />
        [03 // THE MACHINE]
      </div>
      <div className="section-head">
        <h2>What you actually get.</h2>
        <p>
          No mystery boxes. These are the capabilities the order flow actually provides, backed by
          live inventory.
        </p>
      </div>

      <dl className="spec-grid">
        {SPECS.map((spec) => (
          <div className="spec-item" key={spec.label}>
            <dt>{spec.label}</dt>
            <dd>
              {spec.value}
              <span>{spec.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
