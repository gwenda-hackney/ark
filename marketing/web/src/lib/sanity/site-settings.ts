import { createSanityClient } from "./client";
import { SITE_SETTINGS_QUERY } from "./queries";

export type SiteSettings = {
  bookingEnabled: boolean;
  cocktailGalleryEnabled: boolean;
};

type SanitySiteSettings = {
  bookingEnabled?: boolean | null;
  cocktailGalleryEnabled?: boolean | null;
};

/** Defaults when the singleton is missing (local/empty datasets). */
const DEFAULT_SITE_SETTINGS: SiteSettings = {
  bookingEnabled: false,
  /** Match current promo homepage until Studio explicitly turns it off. */
  cocktailGalleryEnabled: true,
};

export async function fetchSiteSettings(): Promise<SiteSettings> {
  const client = createSanityClient();
  const doc = await client.fetch<SanitySiteSettings | null>(SITE_SETTINGS_QUERY);

  if (!doc) {
    return DEFAULT_SITE_SETTINGS;
  }

  return {
    bookingEnabled: doc.bookingEnabled === true,
    cocktailGalleryEnabled: doc.cocktailGalleryEnabled !== false,
  };
}
