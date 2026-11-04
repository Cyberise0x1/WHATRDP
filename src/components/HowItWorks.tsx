import { Emblem } from "./Emblem";

const STEPS = [
  {
    num: "01",
    title: "Pick the machine",
    copy: "Choose a location, Windows or Linux, and a billing term. The price shown is the price charged.",
    code: "CATALOGUE",
  },
  {
    num: "02",
    title: "Pay in USD",
    copy: "Zeno hosts the crypto checkout. The order is written before the gateway call; a failed checkout does not take payment.",
    code: "CHECKOUT",
  },
  {
    num: "03",
    title: "We provision",
    copy: "Our provisioning workflow creates the server, waits until it is active, and stores the credentials encrypted.",
    code: "WORKFLOW",
  },
  {
    num: "04",
    title: "Connect",
    copy: "The IP, username and password appear on the order page and are emailed once. Treat the order link as a password.",
    code: "SESSION",
  },
] as const;

export function HowItWorks({ index = "02" }: { index?: string }) {
  return (
    <section className="section" id="how-it-works">
      <div className="section-label">
        <Emblem className="section-emblem" />[{index} // PROVISIONING]
      </div>
      <div className="section-head">
        <h2>From payment to desktop.</h2>
        <p>
          Automated where it should be, bounded where it matters. An uncertain create is recorded
          for review, never automatically repeated.
        </p>
      </div>

      <div className="steps-grid">
        {STEPS.map((step) => (
          <div className="step" key={step.num}>
            <div className="step-num">{step.num}</div>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
            <span className="step-code">[{step.code}]</span>
          </div>
        ))}
      </div>
    </section>
  );
}
