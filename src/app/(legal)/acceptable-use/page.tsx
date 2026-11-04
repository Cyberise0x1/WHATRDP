import type { Metadata } from "next";
import { Emblem } from "@/components/Emblem";
import { LegalContact } from "@/components/LegalContact";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — WHATRDP",
  description: "The rules for using a WHATRDP server and what happens when they are broken.",
};

export default function AcceptableUsePage() {
  return (
    <>
      <p className="legal-kicker">
        <Emblem className="legal-emblem" />
        LEGAL // WHATRDP
      </p>
      <h1>Acceptable Use Policy</h1>
      <p className="legal-lede">
        A server is a shared piece of infrastructure. This policy protects our network, other
        customers and the people on the receiving end of your traffic. It is part of the Terms of
        Service.
      </p>

      <h2>1. Your responsibility</h2>
      <p>
        You are responsible for all activity under your server, credentials and order link,
        including activity by anyone you allow to use the server. Keep the order link private. It is
        a bearer credential: anyone who has it can view the order and its connection details.
      </p>

      <h2>2. Prohibited activity</h2>
      <p>Do not use a WHATRDP server to:</p>
      <ul>
        <li>
          break the law, infringe intellectual-property rights, or evade sanctions or export
          controls;
        </li>
        <li>
          host or distribute child sexual abuse material, malware, ransomware, phishing pages or
          fraud material;
        </li>
        <li>
          send spam or unsolicited bulk messages, operate botnets, or coordinate harassment or
          threats;
        </li>
        <li>
          launch denial-of-service attacks, scan or probe networks you do not own, or access systems
          without authorization;
        </li>
        <li>interfere with our network, other customers, or the stability of the service;</li>
        <li>
          evade usage limits, resell the service without our written agreement, or misrepresent your
          identity to obtain service;
        </li>
        <li>
          store or process data you have no lawful right to process, or violate another
          person&apos;s privacy.
        </li>
      </ul>

      <h2>3. Security</h2>
      <p>
        Keep the operating system, applications and credentials secure. Use strong passwords,
        restrict remote access where possible, and apply security updates. If you believe your
        server or order link has been compromised, contact us immediately so we can help contain it.
        You remain responsible for activity that occurs before containment.
      </p>

      <h2>4. Enforcement</h2>
      <p>
        We may investigate suspected abuse. If we find a material breach, we may suspend or
        terminate the server, restrict access, or report the activity to our infrastructure
        provider, Zeno, a network operator or law enforcement. Termination for a breach does not
        create a refund. We may act immediately where the network or another person is at risk.
      </p>

      <h2>5. Reporting abuse</h2>
      <p>
        Report abuse or a security issue to <LegalContact kind="support" /> with the IP address,
        time, relevant logs and a description. Do not send server passwords. We will acknowledge a
        report and investigate proportionately.
      </p>

      <h2>6. Changes</h2>
      <p>
        We may update this policy to reflect new risks, infrastructure rules or legal requirements.
        The updated policy will be posted on this page with a new date. Continued use of the service
        after a change means you accept the updated policy.
      </p>
    </>
  );
}
