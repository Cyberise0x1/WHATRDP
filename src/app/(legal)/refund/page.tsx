import type { Metadata } from "next";
import { Emblem } from "@/components/Emblem";
import { LegalContact } from "@/components/LegalContact";

export const metadata: Metadata = {
  title: "Refund Policy — WHATRDP",
  description: "When WHATRDP refunds a payment, how to request one, and the limits.",
};

export default function RefundPage() {
  return (
    <>
      <p className="legal-kicker">
        <Emblem className="legal-emblem" />
        LEGAL // WHATRDP
      </p>
      <h1>Refund Policy</h1>
      <p className="legal-lede">
        Crypto payments are irreversible and a provisioned server consumes provisioned capacity. We
        do not refund after provisioning except in the cases below. Nothing in this policy limits a
        mandatory right you have under consumer law.
      </p>

      <h2>1. The short version</h2>
      <ul>
        <li>
          <strong>No refunds after provisioning.</strong> Once a server has been created, the
          infrastructure cost is committed and the service is delivered.
        </li>
        <li>
          <strong>We do review non-delivery and duplicate charges.</strong> If you paid and no
          server was delivered, or you were charged twice for the same order, contact us.
        </li>
        <li>
          <strong>Refunds are manual.</strong> Zeno does not expose a refund API. Approved refunds
          are sent in crypto to the originating wallet, minus network fees.
        </li>
      </ul>

      <h2>2. When we may refund</h2>
      <p>We will review a refund request in these cases:</p>
      <ul>
        <li>
          You paid for an order and we could not deliver the server because of a failure on our
          side.
        </li>
        <li>You paid more than once for the same order, and the duplicate is confirmed.</li>
        <li>
          You report an unauthorized transaction and we can verify it with the payment and
          infrastructure records.
        </li>
        <li>Mandatory consumer law gives you a refund right that we cannot exclude.</li>
      </ul>
      <p>
        If we cannot deliver a plan you paid for, we may offer a replacement plan or a refund of the
        amount paid, minus network fees. We will tell you which option is available.
      </p>

      <h2>3. When we do not refund</h2>
      <ul>
        <li>A change of mind after the server is provisioned.</li>
        <li>Unused time after cancellation, suspension or non-renewal.</li>
        <li>A server that is active but no longer needed by you.</li>
        <li>Suspension or termination for a breach of the Acceptable Use Policy.</li>
        <li>
          Infrastructure outages, stock changes or network issues after a server has been delivered.
        </li>
        <li>Fees charged by a wallet, exchange, bank or the crypto network.</li>
      </ul>

      <h2>4. Partial payments</h2>
      <p>
        A checkout that is only partially paid does not count as a paid order and does not provision
        a server. Contact us before the checkout expires. We may ask you to complete the payment or
        refund the partial amount minus network fees, at our discretion. We do not hold a partially
        paid order open indefinitely.
      </p>

      <h2>5. How to request a refund</h2>
      <p>
        Email <LegalContact /> with the order link or order number, the payment transaction hash,
        the wallet address that sent the payment, and the reason. Do not send your server password.
        We may ask for additional evidence. We aim to respond within five business days.
      </p>

      <h2>6. How approved refunds are paid</h2>
      <p>
        Approved refunds are sent in the same crypto asset and to the originating wallet where
        possible, minus network fees. We process an approved refund within ten business days;
        network confirmation can take longer. We cannot send a refund to a different wallet without
        verifying the change. We do not refund to a card because the checkout is crypto-only.
      </p>

      <h2>7. Consumer rights</h2>
      <p>
        If you are a consumer in the EU or UK, you may have a 14-day right to withdraw from a
        digital service. Because provisioning begins immediately after payment, you may lose that
        right once the service has been supplied; this does not affect your rights if the service is
        not supplied or is not as described. If you need to rely on a statutory right, contact us
        before ordering so we can explain the position for your country.
      </p>
      <p>
        Nothing in this policy excludes or limits a right that cannot be excluded or limited by law.
        If this policy conflicts with mandatory law, the mandatory law applies.
      </p>

      <h2>8. Chargebacks and fraud</h2>
      <p>
        Crypto payments do not have card chargebacks. If you believe a transaction was unauthorized,
        contact us and your wallet provider immediately. We will cooperate with Zeno, infrastructure
        providers and law enforcement. Deliberately false claims may result in account or service
        termination.
      </p>

      <h2>9. Contact</h2>
      <p>
        Refund questions: <LegalContact kind="support" />. Include the order reference, not the
        server password.
      </p>
    </>
  );
}
