"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Emblem } from "./Emblem";

export interface TerminalPlan {
  name: string;
  region: string;
  cpuCores: number;
  ramGb: number;
  diskGb: number;
  monthlyPrice: string;
  cycleLabel: string;
}

export function TerminalCard({ plan }: { plan: TerminalPlan | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".terminal-line", {
          y: 8,
          autoAlpha: 0,
          duration: 0.35,
          stagger: 0.055,
          ease: "power2.out",
          delay: 0.1,
        });
      });

      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="terminal" aria-label="Live inventory preview">
      <div className="terminal-bar">
        <span className="terminal-bar-title">WHATRDP://CONNECT</span>
        <span className="terminal-bar-live">
          <span className={plan ? "status-dot live" : "status-dot"} aria-hidden="true" />
          {plan ? "CATALOGUE SYNCED" : "CATALOGUE OFFLINE"}
        </span>
      </div>

      <div className="terminal-body">
        <div className="terminal-line">
          <span className="terminal-prompt">&gt;</span>
          <span className="terminal-key">connect</span>
          <span className="terminal-value">--region {plan?.region ?? "unknown"}</span>
        </div>
        <div className="terminal-line">
          <span className="terminal-prompt">&gt;</span>
          <span className="terminal-key">catalogue</span>
          <span className={plan ? "terminal-value signal" : "terminal-value accent"}>
            {plan ? "OK" : "OFFLINE"}
          </span>
        </div>
        <div className="terminal-divider" />
        {plan ? (
          <>
            <div className="terminal-line">
              <span className="terminal-key">plan</span>
              <span className="terminal-value">{plan.name}</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-key">price</span>
              <span className="terminal-value accent">
                {plan.monthlyPrice} USD / {plan.cycleLabel}
              </span>
            </div>
            <div className="terminal-spec">
              <div>
                <span>VCPU</span>
                <strong>{plan.cpuCores}</strong>
              </div>
              <div>
                <span>RAM</span>
                <strong>{plan.ramGb} GB</strong>
              </div>
              <div>
                <span>NVME</span>
                <strong>{plan.diskGb} GB</strong>
              </div>
              <div>
                <span>REGION</span>
                <strong>{plan.region}</strong>
              </div>
            </div>
            <div className="terminal-divider" />
            <div className="terminal-line">
              <span className="terminal-prompt">&gt;</span>
              <span className="terminal-value signal">READY TO DEPLOY</span>
              <span className="terminal-cursor" aria-hidden="true" />
            </div>
          </>
        ) : (
          <>
            <div className="terminal-line">
              <span className="terminal-key">plan</span>
              <span className="terminal-value">No catalogue response</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-key">next</span>
              <span className="terminal-value accent">Retry from the catalogue below</span>
              <span className="terminal-cursor" aria-hidden="true" />
            </div>
          </>
        )}
      </div>

      <Emblem className="terminal-emblem" />
    </div>
  );
}
