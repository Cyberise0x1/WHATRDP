import type { Metadata } from "next";
import { loadShopCatalog, type ShopCatalog } from "@/lib/catalog";
import { checkoutEnabled } from "@/lib/checkout-policy";
import { Hero } from "@/components/Hero";
import { CatalogueSection } from "@/components/CatalogueSection";
import { PrivacySection } from "@/components/PrivacySection";
import { HowItWorks } from "@/components/HowItWorks";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anonymous VPS — No KYC, crypto checkout — WHATRDP",
  description:
    "Anonymous Windows RDP and Linux VPS. No ID, no account, email-only delivery, crypto checkout in USD, EU and US locations.",
};

const STATS = [
  { label: "NO KYC / NO ID", value: "01" },
  { label: "EMAIL-ONLY DELIVERY", value: "02" },
  { label: "CRYPTO CHECKOUT", value: "03" },
  { label: "EU + US LOCATIONS", value: "04" },
] as const;

export default async function AnonymousVpsPage() {
  let shop: ShopCatalog | undefined;
  let catalogueError: string | null = null;

  try {
    shop = await loadShopCatalog();
  } catch (caught) {
    catalogueError = caught instanceof Error ? caught.message : "Catalogue unavailable";
    console.error(
      JSON.stringify({
        event: "anonymous_catalogue_unavailable",
        message: catalogueError,
      }),
    );
  }

  const checkoutOpen = checkoutEnabled();

  return (
    <>
      <Hero
        plan={shop?.plans[0] ?? null}
        checkoutOpen={checkoutOpen}
        kicker="NO KYC · NO ACCOUNT · CRYPTO ONLY"
        title={
          <>
            A server that doesn&apos;t <span className="accent-line">need your name.</span>
          </>
        }
        lede="Windows RDP and Linux VPS with full administrator access. Email is the only identifier: no ID, no phone, no account. Pay in USD crypto and connect when provisioning finishes."
        primaryLabel="DEPLOY ANONYMOUSLY"
        secondaryHref="#privacy"
        secondaryLabel="WHAT ANONYMOUS MEANS"
        stats={STATS}
      />

      <CatalogueSection
        index="01"
        heading="Pick a location."
        intro="Choose EU or US, standard or high performance, and a term. Live stock and prices, no account needed."
        shop={shop ?? null}
        catalogueError={catalogueError}
        checkoutOpen={checkoutOpen}
        reloadHref="/anonymous-vps"
      />

      <PrivacySection index="02" />
      <HowItWorks index="03" />
      <Faq
        variant="anonymous"
        index="04"
        heading="Anonymous questions."
        intro="What we collect, what we do not, and how the service works. If something is still unclear, ask before you pay."
      />
      <FinalCta />
    </>
  );
}
