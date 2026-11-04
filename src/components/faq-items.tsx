import type { ReactNode } from "react";

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

export const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    question: "How fast is provisioning?",
    answer:
      "The server is created automatically after the payment is confirmed. Usually it takes a few minutes, and installation time can vary. The order page updates on its own until the server is active.",
  },
  {
    question: "What do I actually get?",
    answer:
      "A managed server with full administrator access, the vCPU, RAM and NVMe storage shown on the plan, one IPv4 address, and the operating system you selected. The IP, username and password appear on the order page and are emailed once.",
  },
  {
    question: "Do I need ID or KYC?",
    answer:
      "No. We do not ask for a government ID, phone number, selfie, card or billing address. Checkout requires an email address so we can deliver your credentials.",
  },
  {
    question: "What data do you keep?",
    answer:
      "Your email, the order and payment reference, the server details and its status. We do not sell data or use advertising trackers. The Privacy Policy lists every category and recipient.",
  },
  {
    question: "How do I pay?",
    answer:
      "Checkout is hosted by Zeno and charged in USD. Crypto is the only payment rail. If the gateway fails, the order is not charged; if checkout succeeds, provisioning starts after settlement.",
  },
  {
    question: "How do I connect?",
    answer:
      "Windows: open Remote Desktop Connection (mstsc) and enter the IP, username and password from the order page. Linux: connect over SSH with the same details. Keep the order link private; it is a bearer credential.",
  },
  {
    question: "What happens if provisioning fails?",
    answer:
      "A definite rejection moves the order to failed. An uncertain create is recorded for review and never automatically repeated, because a duplicate server costs money. The order page shows the current state.",
  },
  {
    question: "Can I cancel or renew?",
    answer:
      "Contact support with the order link before the renewal date. Self-service cancellation and renewal are not available yet. Cancellation does not create a prorated refund.",
  },
  {
    question: "Are refunds available?",
    answer: (
      <>
        Provisioned services are not refundable because crypto payments are irreversible and
        provisioned capacity is consumed. We do review non-delivery and duplicate charges manually.
        Read the <a href="/refund">Refund policy</a> for the exact cases.
      </>
    ),
  },
  {
    question: "Is a VPS the same as a VPN?",
    answer:
      "No. A VPN reroutes your device's traffic. A WHATRDP server is a full remote computer with its own IP that runs independently of your device.",
  },
  {
    question: "Is anonymous hosting legal?",
    answer:
      "Yes, for lawful use. The Acceptable Use Policy still applies, and we respond to lawful process about activity on the service.",
  },
  {
    question: "Who is behind WHATRDP?",
    answer:
      "WHATRDP is a Cyberise project. We run the storefront, payments, provisioning and support end to end.",
  },
];

export const ANONYMOUS_FAQ_ITEMS: FaqItem[] = [
  {
    question: "Do I need ID or KYC?",
    answer:
      "No. We do not ask for a government ID, phone number, selfie, card or billing address. Checkout requires an email address so we can deliver your credentials.",
  },
  {
    question: "What data do you keep?",
    answer:
      "Your email, the order and payment reference, the server details and its status. We do not sell data or use advertising trackers. The Privacy Policy lists every category and recipient.",
  },
  {
    question: "Is a VPS the same as a VPN?",
    answer:
      "No. A VPN reroutes your device's traffic. A WHATRDP server is a full remote computer with its own IP that runs independently of your device.",
  },
  {
    question: "Is anonymous hosting legal?",
    answer:
      "Yes, for lawful use. The Acceptable Use Policy still applies, and we respond to lawful process about activity on the service.",
  },
  {
    question: "How do I pay?",
    answer:
      "Checkout is hosted by Zeno and charged in USD. Crypto is the only payment rail, and no card details touch this site.",
  },
  {
    question: "How fast is delivery?",
    answer:
      "Provisioning starts after payment settles and is usually a few minutes. The order page updates until the server is active, and the credentials are emailed once.",
  },
  {
    question: "Are refunds available?",
    answer: (
      <>
        Provisioned services are not refundable because crypto payments are irreversible and
        provisioned capacity is consumed. We do review non-delivery and duplicate charges manually.
        Read the <a href="/refund">Refund policy</a> for the exact cases.
      </>
    ),
  },
  {
    question: "Who is behind WHATRDP?",
    answer:
      "WHATRDP is a Cyberise project. We run the storefront, payments, provisioning and support end to end.",
  },
];
