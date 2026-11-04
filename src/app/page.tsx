import { loadShopCatalog, type ShopCatalog } from "@/lib/catalog";
import { checkoutEnabled } from "@/lib/checkout-policy";
import { Hero } from "@/components/Hero";
import { CatalogueSection } from "@/components/CatalogueSection";
import { HowItWorks } from "@/components/HowItWorks";
import { SpecSheet } from "@/components/SpecSheet";
import { PrivacySection } from "@/components/PrivacySection";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let shop: ShopCatalog | undefined;
  let catalogueError: string | null = null;

  try {
    shop = await loadShopCatalog();
  } catch (caught) {
    catalogueError = caught instanceof Error ? caught.message : "Catalogue unavailable";
    console.error(
      JSON.stringify({
        event: "home_catalogue_unavailable",
        message: catalogueError,
      }),
    );
  }

  const checkoutOpen = checkoutEnabled();

  return (
    <>
      <Hero plan={shop?.plans[0] ?? null} checkoutOpen={checkoutOpen} />

      <CatalogueSection
        index="01"
        heading="Choose the machine."
        intro="Prices are in USD for the selected term. Specs, locations and stock are read live from our inventory; nothing here is placeholder stock."
        shop={shop ?? null}
        catalogueError={catalogueError}
        checkoutOpen={checkoutOpen}
      />

      <HowItWorks />
      <SpecSheet />
      <PrivacySection index="04" />
      <Faq />
      <FinalCta />
    </>
  );
}
