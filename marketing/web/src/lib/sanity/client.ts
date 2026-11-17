import { createClient } from "@sanity/client";
import { getSanityConfig, sanityPerspective } from "./env";

export function createSanityClient() {
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
