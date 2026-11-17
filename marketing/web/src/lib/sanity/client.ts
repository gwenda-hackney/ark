import { createClient } from "@sanity/client";
import { getSanityConfig, sanityPerspective } from "./env";
import { overlayClient } from "./fixture-client.js";

type SiteClient = Pick<ReturnType<typeof createClient>, "fetch">;

/** The overlay reads the dataset once per server, so there's one of it. */
let overlay: SiteClient | null = null;

/**
 * The site's Sanity client. `SITE_OVERLAY` (a local dev server only, see
 * fixture-client.js) lays sample documents over what it reads, so a change
 * can be seen with a made-up pop-up next to the real content.
 */
export function createSanityClient(): SiteClient {
  const { projectId, dataset, token } = getSanityConfig();
  const perspective = sanityPerspective({
    perspective: process.env.SANITY_PERSPECTIVE,
    dev: Boolean(import.meta.env.DEV),
  });

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2025-01-01",
    useCdn: false,
    perspective,
  });

  const sample = String(process.env.SITE_OVERLAY || "").trim();
  if (!sample || !import.meta.env.DEV) return client;
  overlay ??= overlayClient(sample, client) as SiteClient;
  return overlay;
}
