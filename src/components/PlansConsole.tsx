"use client";

import { useEffect, useMemo, useState } from "react";
import { CYCLE_MONTHS, CYCLES, formatUsd, type Cycle } from "@/lib/pricing";
import type { ShopPlan } from "@/lib/catalog";
import type { CatalogOs } from "@/lib/rdpmonster";
import {
  regionCode,
  regionName,
  sortRegions,
  sortTiers,
  tierCode,
  tierName,
} from "@/lib/catalog-labels";
import { CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/checkout-config";
import { LEGAL_LINKS } from "@/lib/legal";

interface Props {
  plans: ShopPlan[];
  osTemplates: CatalogOs[];
  turnstileSiteKey?: string;
  checkoutAvailable: boolean;
}

interface TurnstileApi {
  getResponse(): string | undefined;
  reset(): void;
}

function turnstileApi(): TurnstileApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function cycleLabel(cycle: Cycle): string {
  if (cycle === "MONTHLY") return "1 MO";
  if (cycle === "QUARTERLY") return "3 MO";
  if (cycle === "SEMIANNUALLY") return "6 MO";
  return "12 MO";
}

export function PlansConsole({ plans, osTemplates, turnstileSiteKey, checkoutAvailable }: Props) {
  const [cycle, setCycle] = useState<Cycle>("MONTHLY");
  const [os, setOs] = useState<string>(osTemplates[0]?.slug ?? "ubuntu-24-04");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedPerformance, setSelectedPerformance] = useState<string | null>(null);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    const id = "cf-turnstile-script";
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [turnstileSiteKey]);

  async function startCheckout(sku: string) {
    if (!checkoutAvailable) return;
    if (!email.trim()) {
      setStatus("Enter an email address so we can deliver your server credentials.");
      return;
    }

    const turnstileToken = turnstileSiteKey ? turnstileApi()?.getResponse() : undefined;
    if (turnstileSiteKey && !turnstileToken) {
      setStatus("Complete the human verification challenge, then try again.");
      return;
    }

    setBusySku(sku);
    setStatus("STARTING SECURE CHECKOUT…");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          os,
          cycle,
          email: email.trim(),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { checkoutUrl?: string };
        message?: string;
      } | null;
      const checkoutUrl = body?.data?.checkoutUrl;
      if (!response.ok || !checkoutUrl) {
        turnstileApi()?.reset();
        throw new Error(body?.message ?? "Checkout could not be started.");
      }
      window.location.assign(checkoutUrl);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Checkout could not be started.");
      setBusySku(null);
    }
  }

  const familyPlans = useMemo(() => {
    const selectedOs = osTemplates.find((template) => template.slug === os);
    const family = selectedOs?.family?.toUpperCase();
    if (family === "WINDOWS") return plans.filter((plan) => plan.product === "windows-rdp");
    if (family === "LINUX") return plans.filter((plan) => plan.product === "linux-vps");
    return plans;
  }, [plans, os, osTemplates]);

  const locations = useMemo(
    () => [...new Set(familyPlans.map((plan) => plan.region))].sort(sortRegions),
    [familyPlans],
  );

  const activeLocation =
    selectedLocation && locations.includes(selectedLocation)
      ? selectedLocation
      : (locations[0] ?? "");

  const tiers = useMemo(
    () =>
      [
        ...new Set(
          familyPlans.filter((plan) => plan.region === activeLocation).map((plan) => plan.tier),
        ),
      ].sort(sortTiers),
    [familyPlans, activeLocation],
  );

  const activePerformance =
    selectedPerformance && tiers.includes(selectedPerformance)
      ? selectedPerformance
      : (tiers[0] ?? "");

  const visiblePlans = useMemo(
    () =>
      familyPlans.filter(
        (plan) => plan.region === activeLocation && plan.tier === activePerformance,
      ),
    [familyPlans, activeLocation, activePerformance],
  );

  const statusText =
    status ??
    (checkoutAvailable
      ? "AWAITING PLAN SELECTION // EMAIL REQUIRED FOR CREDENTIAL DELIVERY"
      : CHECKOUT_UNAVAILABLE_MESSAGE);

  return (
    <div>
      <div className="catalogue-controls">
        {locations.length > 0 ? (
          <div className="control-group" role="group" aria-label="Server location">
            <span className="control-label">Location</span>
            <div className="segmented">
              {locations.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === activeLocation ? "segment active" : "segment"}
                  aria-pressed={option === activeLocation}
                  aria-label={regionName(option)}
                  onClick={() => setSelectedLocation(option)}
                >
                  {regionCode(option)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tiers.length > 1 ? (
          <div className="control-group" role="group" aria-label="Server class">
            <span className="control-label">Class</span>
            <div className="segmented">
              {tiers.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === activePerformance ? "segment active" : "segment"}
                  aria-pressed={option === activePerformance}
                  aria-label={tierName(option)}
                  onClick={() => setSelectedPerformance(option)}
                >
                  {tierCode(option)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="control-group" role="group" aria-label="Billing term">
          <span className="control-label">Billing term</span>
          <div className="segmented">
            {CYCLES.map((option) => (
              <button
                key={option}
                type="button"
                className={option === cycle ? "segment active" : "segment"}
                aria-pressed={option === cycle}
                onClick={() => setCycle(option)}
              >
                {cycleLabel(option)}
              </button>
            ))}
          </div>
        </div>

        <label className="control-group" htmlFor="checkout-os">
          <span className="control-label">Operating system</span>
          <select
            id="checkout-os"
            value={os}
            onChange={(event) => setOs(event.target.value)}
            aria-describedby="checkout-status"
          >
            {osTemplates.length === 0 ? <option value={os}>{os}</option> : null}
            {osTemplates.map((template) => (
              <option key={template.slug} value={template.slug}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="control-group wide" htmlFor="checkout-email">
          <span className="control-label">Credential delivery</span>
          <input
            id="checkout-email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby="checkout-status"
          />
        </label>
      </div>

      <div id="checkout-status" className="catalogue-status" role="status" aria-live="polite">
        <span className="prompt">&gt;</span>
        <span>{statusText}</span>
      </div>

      <p className="legal-note">
        Review the{" "}
        {LEGAL_LINKS.map((link, index) => (
          <span key={link.href}>
            {index > 0 ? (index === LEGAL_LINKS.length - 1 ? " and " : ", ") : null}
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          </span>
        ))}{" "}
        before you pay.
      </p>

      {turnstileSiteKey ? (
        <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" />
      ) : null}

      {familyPlans.length === 0 ? (
        <p className="plan-empty">NO PLANS FOR THIS OPERATING SYSTEM. Choose another OS.</p>
      ) : visiblePlans.length === 0 ? (
        <p className="plan-empty">
          NO PLANS IN THIS LOCATION AND CLASS. Choose another combination.
        </p>
      ) : (
        <section className="plan-region">
          <div className="plan-region-head">
            <h3>
              {regionName(activeLocation)} // {tierName(activePerformance)}
            </h3>
            <span>
              {visiblePlans.length} PLAN{visiblePlans.length === 1 ? "" : "S"} // LIVE INVENTORY
            </span>
          </div>

          <table className="plan-table">
            <caption className="sr-only">
              {regionName(activeLocation)} {tierName(activePerformance)} servers, prices in USD for
              the selected term
            </caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">vCPU</th>
                <th scope="col">RAM</th>
                <th scope="col">NVMe</th>
                <th scope="col">USD / mo</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlans.map((plan) => {
                const total = plan.retail[cycle] ?? plan.retailMonthly;
                const monthly = Math.round(total / CYCLE_MONTHS[cycle]);
                const busy = busySku === plan.sku;
                return (
                  <tr key={plan.sku} data-sku={plan.sku} data-product={plan.product}>
                    <td data-label="Plan">
                      <span className="plan-name">{plan.name}</span>
                      <span className="plan-spec">
                        <span className="plan-tier">{tierName(plan.tier)}</span>
                      </span>
                    </td>
                    <td data-label="vCPU" className="plan-number">
                      {plan.cpuCores}
                    </td>
                    <td data-label="RAM" className="plan-number">
                      {Math.round(plan.ramMb / 1024)} GB
                    </td>
                    <td data-label="NVMe" className="plan-number">
                      {plan.diskGb} GB
                    </td>
                    <td data-label="USD / mo">
                      <span className="plan-price">{formatUsd(monthly)}</span>
                      <span className="plan-price-sub">
                        {cycle === "MONTHLY"
                          ? "BILLED MONTHLY"
                          : `${formatUsd(total)} EVERY ${CYCLE_MONTHS[cycle]} MO`}
                      </span>
                    </td>
                    <td data-label="Action" className="plan-action">
                      <button
                        type="button"
                        className="button primary small"
                        disabled={!checkoutAvailable || busySku !== null}
                        aria-describedby="checkout-status"
                        aria-label={`Deploy ${plan.name} in ${regionName(activeLocation)}`}
                        onClick={() => startCheckout(plan.sku)}
                      >
                        {!checkoutAvailable ? "CLOSED" : busy ? "STARTING…" : "DEPLOY"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
