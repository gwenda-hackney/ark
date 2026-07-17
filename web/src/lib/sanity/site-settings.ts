import { createSanityClient } from "./client";
import { SITE_SETTINGS_QUERY } from "./queries";

export type SiteSettings = {
  bookingEnabled: boolean;
};

type SanitySiteSettings = {
  bookingEnabled?: boolean | null;
};

/** Defaults when the singleton is missing (local/empty datasets). */
const DEFAULT_SITE_SETTINGS: SiteSettings = {
  bookingEnabled: false,
};

export async function fetchSiteSettings(): Promise<SiteSettings> {
  const client = createSanityClient();
  const doc = await client.fetch<SanitySiteSettings | null>(SITE_SETTINGS_QUERY);

  if (!doc) {
    return DEFAULT_SITE_SETTINGS;
  }

  return {
    bookingEnabled: doc.bookingEnabled === true,
  };
}
