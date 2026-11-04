import type { Metadata } from "next";
import { Emblem } from "@/components/Emblem";
import { LegalContact } from "@/components/LegalContact";
import { LEGAL_ENTITY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — WHATRDP",
  description: "What WHATRDP collects, why it is used, who receives it, and your rights.",
};

export default function PrivacyPage() {
  return (
    <>
      <p className="legal-kicker">
        <Emblem className="legal-emblem" />
        LEGAL // WHATRDP
      </p>
      <h1>Privacy Policy</h1>
      <p className="legal-lede">
        This policy explains what we collect when you browse or order from {LEGAL_ENTITY.website},
        why we use it, who receives it, and the rights you have. We do not sell personal data and we
        do not use advertising trackers.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        {LEGAL_ENTITY.legalName}, {LEGAL_ENTITY.address}, {LEGAL_ENTITY.jurisdiction}, is the
        controller of the personal data described here. WHATRDP is its trading name and a Cyberise
        project. Privacy questions and requests: <LegalContact />.
      </p>

      <h2>2. What we collect</h2>
      <h3>Order and service data</h3>
      <ul>
        <li>
          Your email address, the plan, operating system, billing term, amount, currency and payment
          reference.
        </li>
        <li>
          The order token, server IP address, username and an encrypted password. The order token is
          a bearer credential: anyone with the order link can view the order and, once active, its
          credentials.
        </li>
        <li>
          Status, timestamps, error messages, and whether the credential email was sent. A
          successfully provisioned order may also record the infrastructure service identifier.
        </li>
      </ul>

      <h3>Payment data</h3>
      <p>
        Zeno hosts the checkout and processes the payment. We receive the checkout reference,
        amount, currency and settlement status. We do not receive your card details, and the
        checkout is crypto-only. Zeno may collect wallet, transaction and identity data under its
        own privacy policy.
      </p>

      <h3>Technical and security data</h3>
      <p>
        We process your IP address, browser and request metadata, and the Cloudflare Turnstile token
        to rate-limit checkout, detect abuse and keep the service available. Operational alerts may
        contain order identifiers and error codes, but they are designed not to contain your email,
        credentials or order token.
      </p>

      <h3>Support communications</h3>
      <p>
        If you contact us, we keep the message and the information needed to resolve it. Do not send
        passwords or the full order link unless we specifically ask for them.
      </p>

      <h2>3. How we use it and why</h2>
      <ul>
        <li>
          <strong>To perform the contract:</strong> create the order, take payment, provision the
          server, deliver credentials and show order status.
        </li>
        <li>
          <strong>Legitimate interests:</strong> secure the service, prevent fraud and abuse,
          reconcile payments, investigate failures and improve operations.
        </li>
        <li>
          <strong>Legal obligations:</strong> keep records required by tax, accounting, consumer or
          law-enforcement rules.
        </li>
        <li>
          <strong>Consent:</strong> where we ask for it for a specific optional purpose. You can
          withdraw consent at any time.
        </li>
      </ul>

      <h2>4. Who receives it</h2>
      <ul>
        <li>
          <strong>Cloudflare</strong> hosts the application and database, runs the email binding and
          Turnstile, and stores encrypted backups in private R2 buckets.
        </li>
        <li>
          <strong>Zeno</strong> processes the hosted checkout and settlement. We send an order
          reference and the amount, not your email address.
        </li>
        <li>
          <strong>Our infrastructure provider</strong> supplies and operates the server. We send the
          plan, operating system, term, quantity and an internal order label. We do not send your
          email address.
        </li>
        <li>
          <strong>Our operational alert channel</strong> receives credential-free alerts with order
          identifiers and error codes.
        </li>
        <li>
          <strong>Authorities and advisers</strong> where required by law, to investigate fraud or
          abuse, or to enforce our terms.
        </li>
      </ul>

      <h2>5. International transfers</h2>
      <p>
        Our providers operate globally. Your data may be processed outside Nigeria, including in the
        European Union, the United Kingdom, the United States and other countries where Cloudflare,
        Zeno or our infrastructure provider operate. We choose providers that offer appropriate
        safeguards for international transfers.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We keep order, payment and support records for as long as needed to provide the service,
        resolve disputes and meet legal, tax and accounting obligations. Encrypted D1 backups are
        retained for 35 days. When the infrastructure provider reports a linked server as deleted,
        we cancel the order and clear the stored IP, username and encrypted password; the order
        record and payment reference remain for reconciliation and legal obligations.
      </p>
      <p>
        If you ask us to delete data we do not need to keep, we will do so, subject to legal
        obligations and backup expiry. Backups are not individually edited, so a deletion may take
        up to the backup retention period to propagate.
      </p>

      <h2>7. Security</h2>
      <p>
        The site uses TLS. Server passwords are encrypted at rest with AES-256-GCM and a
        scrypt-derived key. Access to the application and database is restricted. The credential
        email contains the password by design, so treat the mailbox as part of the credential. If
        you believe an order link or password has been exposed, contact us so we can reset it.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, delete, restrict or
        object to processing, receive a portable copy, or withdraw consent. You may also complain to
        your local supervisory authority, including the Nigeria Data Protection Commission, or the
        data-protection authority where you live. We do not operate customer accounts, so requests
        are handled by contact rather than a self-service dashboard. We may need to verify your
        identity before acting.
      </p>

      <h2>9. Cookies and similar technology</h2>
      <p>
        We do not use advertising or analytics cookies. Cloudflare Turnstile may set a cookie or use
        browser signals to distinguish humans from automated checkout abuse. The hosted Zeno
        checkout may use its own cookies and storage; those are governed by Zeno&apos;s policy.
      </p>

      <h2>10. Children</h2>
      <p>
        The service is for adults. We do not knowingly collect personal data from anyone under 18.
        If you believe a minor has provided data, contact us and we will remove it.
      </p>

      <h2>11. Changes and contact</h2>
      <p>
        We may update this policy and will post the new date on this page. Material changes will be
        communicated where practical. Questions, requests or complaints: <LegalContact />.
      </p>
    </>
  );
}
