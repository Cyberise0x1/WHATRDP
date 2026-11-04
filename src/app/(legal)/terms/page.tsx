import type { Metadata } from "next";
import { Emblem } from "@/components/Emblem";
import { LegalContact } from "@/components/LegalContact";
import { LEGAL_ENTITY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service — WHATRDP",
  description: "The terms that govern WHATRDP orders, provisioning, payments and server use.",
};

export default function TermsPage() {
  return (
    <>
      <p className="legal-kicker">
        <Emblem className="legal-emblem" />
        LEGAL // WHATRDP
      </p>
      <h1>Terms of Service</h1>
      <p className="legal-lede">
        These terms govern your use of {LEGAL_ENTITY.website} and the servers you buy through it.
        They apply to every order. Nothing here limits a right you have under mandatory consumer
        law.
      </p>

      <h2>1. Who we are</h2>
      <p>
        WHATRDP is a trading name of {LEGAL_ENTITY.legalName}, registered at {LEGAL_ENTITY.address},{" "}
        {LEGAL_ENTITY.jurisdiction}. Company or registration number: {LEGAL_ENTITY.companyNumber}.
        WHATRDP is a Cyberise project. You can contact us at <LegalContact />.
      </p>

      <h2>2. The service</h2>
      <p>
        We provide remote-server capacity on infrastructure operated by our infrastructure
        providers. We run the storefront, checkout, provisioning workflow and order support. The
        underlying hardware, network and installation are controlled by our infrastructure
        providers. Your order contract is with us; their technical and acceptable-use rules also
        apply to the server.
      </p>

      <h2>3. Eligibility</h2>
      <p>
        You must be at least 18 years old and legally able to enter a contract. You must provide an
        email address you control. You are responsible for keeping the order link and the mailbox
        secure, because either can reveal server credentials.
      </p>

      <h2>4. Orders and acceptance</h2>
      <p>
        An order is an offer, not an accepted contract. We accept it when payment is confirmed and
        provisioning begins. We may refuse or cancel an order before provisioning for reasons such
        as unavailable stock, a pricing or catalogue error, insufficient capacity, suspected fraud,
        or a legal requirement. If checkout cannot start, no payment is taken.
      </p>

      <h2>5. Prices and payment</h2>
      <p>
        Prices are shown in US dollars for the billing term you select. The amount charged is the
        amount shown at checkout. Payments are processed by Zeno&apos;s hosted checkout. Crypto
        payments are irreversible and are subject to network fees and confirmation times. A checkout
        may expire before payment. Partial payments do not create a paid order and do not provision
        a server.
      </p>

      <h2>6. Provisioning and delivery</h2>
      <p>
        Provisioning starts after settlement. It is automated, but installation time depends on the
        underlying infrastructure and can vary. When the server is active, the IP address, username
        and password appear on the order page and are emailed once to the address used at checkout.
        Keep the order link private: anyone who has it can view the credentials. We can reset the
        password on request.
      </p>

      <h2>7. Acceptable use</h2>
      <p>
        You must follow the <a href="/acceptable-use">Acceptable Use Policy</a>. You are responsible
        for all activity under your server, credentials and order link, including activity by people
        you allow to use the server. We may suspend or terminate a server for a material breach.
      </p>

      <h2>8. Renewal and cancellation</h2>
      <p>
        Self-service renewal and cancellation are not available yet. Contact support before the
        renewal date. Cancellation stops future renewal; it does not create a prorated refund. The
        infrastructure provider may suspend or remove a server for non-payment, expiry, abuse or a
        legal requirement. We will pass through the resulting status on the order page.
      </p>

      <h2>9. Availability and changes</h2>
      <p>
        We do not promise a specific uptime, service level or delivery time. The service depends on
        third-party infrastructure, its stock, its network and maintenance. We may change, suspend
        or withdraw a feature when necessary, and we will give reasonable notice where practical.
        Nothing in this section excludes a mandatory statutory right.
      </p>

      <h2>10. Liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for indirect, incidental, special
        or consequential loss, lost profits, lost data, or business interruption. Our total
        liability for a claim relating to a service is limited to the amount you paid us for that
        service in the three months before the claim. Nothing limits liability for fraud, wilful
        misconduct, or a right that cannot be excluded by law.
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You agree to indemnify us against claims, losses and costs arising from your misuse of the
        service, your content, your violation of these terms, or your violation of another
        person&apos;s rights or the infrastructure provider&apos;s rules.
      </p>

      <h2>12. Termination</h2>
      <p>
        We may suspend or terminate the service for a material breach, non-payment, fraud, a threat
        to the infrastructure or network, or a legal requirement. Termination for breach does not
        create a refund. Provisions that by their nature should survive termination, including
        payment, liability and governing law, will survive.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the laws of {LEGAL_ENTITY.jurisdiction}, and the courts of{" "}
        {LEGAL_ENTITY.jurisdiction} have exclusive jurisdiction, except where mandatory consumer law
        gives you the right to bring a claim in your local courts.
      </p>

      <h2>14. Changes and contact</h2>
      <p>
        We may update these terms. Material changes will be posted on this page with a new date.
        Continued use after a change means you accept the updated terms. Questions or notices:{" "}
        <LegalContact />.
      </p>
    </>
  );
}
