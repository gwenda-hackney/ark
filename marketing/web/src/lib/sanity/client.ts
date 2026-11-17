import { createClient } from "@sanity/client";
import { getSanityConfig, sanityPerspective } from "./env";
import { fixtureClient } from "./fixture-client.js";

/**
 * The site's Sanity client. `SITE_FIXTURE` (a local dev server only, see
 * fixture-client.js) points it at documents in a local file instead, so a
 * change can be seen with sample data and no Sanity token.
 */
export function createSanityClient() {
  const fixture = String(process.env.SITE_FIXTURE || "").trim();
  if (fixture) return fixtureClient(fixture);

  const { projectId, dataset, token } = getSanityConfig();
  const perspective = sanityPerspective({
    perspective: process.env.SANITY_PERSPECTIVE,
    dev: Boolean(import.meta.env.DEV),
  });

  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2025-01-01",
    useCdn: false,
    perspective,
  });
}
