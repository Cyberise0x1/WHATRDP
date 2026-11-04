import type { ReactNode } from "react";
import type { ShopPlan } from "@/lib/catalog";
import { regionName } from "@/lib/catalog-labels";
import { formatUsd } from "@/lib/pricing";
import { TerminalCard, type TerminalPlan } from "./TerminalCard";

function terminalPlan(plan: ShopPlan | null): TerminalPlan | null {
  if (!plan) return null;
  return {
    name: plan.name,
    region: regionName(plan.region),
    cpuCores: plan.cpuCores,
    ramGb: Math.round(plan.ramMb / 1024),
    diskGb: plan.diskGb,
    monthlyPrice: formatUsd(plan.retailMonthly),
    cycleLabel: "MONTH",
  };
}

const DEFAULT_STATS = [
  { label: "AUTOMATED PROVISIONING", value: "01" },
  { label: "FULL ADMINISTRATOR", value: "02" },
  { label: "NO KYC · EMAIL ONLY", value: "03" },
  { label: "EU + US REGIONS", value: "04" },
] as const;

interface HeroProps {
  plan: ShopPlan | null;
  checkoutOpen: boolean;
  kicker?: string;
  title?: ReactNode;
  lede?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  stats?: ReadonlyArray<{ label: string; value: string }>;
}

export function Hero({
  plan,
  checkoutOpen,
  kicker = "WINDOWS RDP · LINUX VPS · NO KYC",
  title = (
    <>
      A remote desktop <span className="accent-line">without the wait.</span>
    </>
  ),
  lede = "Full administrator access on Windows and Linux servers. No ID, no account: pay in USD crypto and connect when provisioning finishes.",
  primaryHref = "#catalogue",
  primaryLabel = "DEPLOY A SERVER",
  secondaryHref = "/anonymous-vps",
  secondaryLabel = "WHY ANONYMOUS",
  stats = DEFAULT_STATS,
}: HeroProps) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="hero-lede">{lede}</p>
        <div className="hero-actions">
          <a className="button primary" href={primaryHref}>
            {primaryLabel}
          </a>
          <a className="button ghost" href={secondaryHref}>
            {secondaryLabel}
          </a>
        </div>
        <dl className="stats">
          {stats.map((stat) => (
            <div className="stat" key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
        {!checkoutOpen ? (
          <p className="legal-note">Checkout is closed right now. The catalogue stays readable.</p>
        ) : null}
      </div>

      <div className="hero-art">
        <TerminalCard plan={terminalPlan(plan)} />
      </div>
    </section>
  );
}
