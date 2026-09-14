import { createClient } from "@sanity/client";
import { getSanityConfig } from "./env";

export function createSanityClient() {
  const { projectId, dataset, token } = getSanityConfig();

  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2025-01-01",
    useCdn: false,
    // The public site only ever renders published content — never Studio drafts.
    perspective: "published",
  });
}
