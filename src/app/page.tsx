import { loadShopCatalog } from "@/lib/catalog";
import { PlansGrid } from "@/components/PlansGrid";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let shop;
  let error: string | null = null;

  try {
    shop = await loadShopCatalog();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Catalog unavailable";
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Windows RDP · Linux VPS · Dedicated</p>
        <h1>Remote servers. Simple management.</h1>
        <p className="lede">
          Full administrator access, dedicated CPU and NVMe storage, deployed automatically in
          Europe and the United States. No setup tickets, no waiting rooms.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="#plans">
            See plans
          </a>
          <a className="button ghost" href="#faq">
            How it works
          </a>
        </div>
      </section>

      {error ? (
        <section className="notice error">
          <h2>Catalogue unavailable</h2>
          <p>{error}</p>
          <p className="muted">
            Set <code>RDP_MONSTER_API_TOKEN</code> in your environment, then reload. The token is
            only ever used server-side.
          </p>
        </section>
      ) : (
        <PlansGrid
          plans={shop!.plans}
          osTemplates={shop!.catalog.os}
          discountPercent={shop!.discountPercent}
        />
      )}

      <section className="steps" id="faq">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Checkout coming soon.</strong> Browse plans while payment integration is being
            prepared.
          </li>
          <li>
            <strong>We provision.</strong> The server is created automatically and installs itself.
          </li>
          <li>
            <strong>You connect.</strong> Your IP, username and password appear on the order page
            the moment the machine is online.
          </li>
        </ol>
      </section>
    </>
  );
}
