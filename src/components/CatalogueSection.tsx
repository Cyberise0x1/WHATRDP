import type { ShopCatalog } from "@/lib/catalog";
import { Emblem } from "./Emblem";
import { PlansConsole } from "./PlansConsole";
import { Reveal } from "./Reveal";

interface Props {
  index: string;
  heading: string;
  intro: string;
  shop: ShopCatalog | null;
  catalogueError: string | null;
  checkoutOpen: boolean;
  reloadHref?: string;
}

export function CatalogueSection({
  index,
  heading,
  intro,
  shop,
  catalogueError,
  checkoutOpen,
  reloadHref = "/",
}: Props) {
  return (
    <section className="section" id="catalogue">
      <Reveal>
        <div className="section-label">
          <Emblem className="section-emblem" />[{index} // CATALOGUE]
        </div>
        <div className="section-head">
          <h2>{heading}</h2>
          <p>{intro}</p>
        </div>
      </Reveal>

      {catalogueError || !shop ? (
        <div className="catalogue-error">
          <h2>Catalogue unavailable.</h2>
          <p>
            The live inventory could not be read just now. No stock or price is being invented. Try
            again in a moment.
          </p>
          <a className="button ghost" href={reloadHref}>
            RELOAD CATALOGUE
          </a>
        </div>
      ) : (
        <PlansConsole
          plans={shop.plans}
          osTemplates={shop.catalog.os}
          turnstileSiteKey={process.env.TURNSTILE_SITE_KEY?.trim() || undefined}
          checkoutAvailable={checkoutOpen}
        />
      )}
    </section>
  );
}
