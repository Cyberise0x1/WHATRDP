"use client";

import { useMemo, useState } from "react";
import { CYCLES, CYCLE_MONTHS, formatUsd, type Cycle } from "@/lib/pricing";
import type { ShopPlan } from "@/lib/catalog";
import type { CatalogOs } from "@/lib/rdpmonster";
import { CHECKOUT_AVAILABLE, CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/checkout-config";

interface Props {
  plans: ShopPlan[];
  osTemplates: CatalogOs[];
  discountPercent: number;
}

export function PlansGrid({ plans, osTemplates }: Props) {
  const [cycle, setCycle] = useState<Cycle>("MONTHLY");
  const [os, setOs] = useState<string>(osTemplates[0]?.slug ?? "ubuntu-24-04");
  const [status, setStatus] = useState<string | null>(
    CHECKOUT_AVAILABLE ? null : CHECKOUT_UNAVAILABLE_MESSAGE,
  );
  const [busySku, setBusySku] = useState<string | null>(null);

  async function startCheckout(sku: string) {
    setBusySku(sku);
    setStatus("Starting secure checkout…");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, os, cycle }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { checkoutUrl?: string };
        message?: string;
      } | null;
      const checkoutUrl = body?.data?.checkoutUrl;
      if (!response.ok || !checkoutUrl) {
        throw new Error(body?.message ?? "Checkout could not be started.");
      }
      window.location.assign(checkoutUrl);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Checkout could not be started.");
      setBusySku(null);
    }
  }

  const grouped = useMemo(() => {
    const regions = new Map<string, ShopPlan[]>();
    for (const plan of plans) {
      const list = regions.get(plan.region) ?? [];
      list.push(plan);
      regions.set(plan.region, list);
    }
    return [...regions.entries()];
  }, [plans]);

  return (
    <section id="plans" className="plans">
      <div className="plan-controls">
        <div className="control-group" role="group" aria-label="Billing term">
          <span className="control-label">Term</span>
          <div className="segmented">
            {CYCLES.map((option) => (
              <button
                key={option}
                type="button"
                className={option === cycle ? "segment active" : "segment"}
                onClick={() => setCycle(option)}
              >
                {option === "MONTHLY"
                  ? "1 mo"
                  : option === "QUARTERLY"
                    ? "3 mo"
                    : option === "SEMIANNUALLY"
                      ? "6 mo"
                      : "12 mo"}
              </button>
            ))}
          </div>
        </div>

        <label className="control-group">
          <span className="control-label">Operating system</span>
          <select value={os} onChange={(event) => setOs(event.target.value)}>
            {osTemplates.map((template) => (
              <option key={template.slug} value={template.slug}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div id="checkout-status" className="notice compact" role="status">
        {status}
      </div>

      {grouped.map(([region, regionPlans]) => (
        <div key={region} className="region-block">
          <h2 className="region-title">
            {region === "europe" ? "Europe" : region === "usa" ? "United States" : region}
          </h2>

          {["CLASSIC", "HIGH_PERFORMANCE"].map((tier) => {
            const tierPlans = regionPlans.filter((plan) => plan.tier === tier);
            if (tierPlans.length === 0) return null;

            return (
              <div key={tier} className="tier-block">
                <h3 className="tier-title">
                  {tier === "CLASSIC" ? "Standard" : "High performance"}
                  <span className="tier-note">
                    {tier === "CLASSIC" ? "Intel Xeon · 1 Gbps" : "Ryzen 9 7950X · DDR5 · 10 Gbps"}
                  </span>
                </h3>

                <div className="card-grid">
                  {tierPlans.map((plan) => {
                    const total = plan.retail[cycle] ?? plan.retailMonthly;
                    const monthly = Math.round(total / CYCLE_MONTHS[cycle]);
                    return (
                      <article key={plan.sku} className="card">
                        <header>
                          <h4>{plan.name}</h4>
                          <p className="spec">
                            {plan.cpuCores} vCPU · {Math.round(plan.ramMb / 1024)} GB RAM ·{" "}
                            {plan.diskGb} GB NVMe
                          </p>
                        </header>

                        <p className="price">
                          {formatUsd(monthly)}
                          <span className="per">/mo</span>
                        </p>
                        <p className="price-sub">
                          {cycle === "MONTHLY"
                            ? "billed monthly"
                            : `${formatUsd(total)} billed every ${CYCLE_MONTHS[cycle]} months`}
                        </p>

                        <button
                          type="button"
                          className="button primary full"
                          disabled={!CHECKOUT_AVAILABLE || busySku !== null}
                          aria-describedby="checkout-status"
                          onClick={() => startCheckout(plan.sku)}
                        >
                          {busySku === plan.sku
                            ? "Starting checkout…"
                            : CHECKOUT_AVAILABLE
                              ? "Checkout"
                              : "Payments unavailable"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
