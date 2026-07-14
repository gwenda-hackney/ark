import { getStudioDataset } from "./env";

export function siteOriginForDataset(dataset: string): string {
  const override = process.env.SANITY_STUDIO_INVITE_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  return dataset === "production"
    ? "https://gwenda.co.uk"
    : "https://gwenda-staging.pages.dev";
}

export function siteOrigin(): string {
  return siteOriginForDataset(getStudioDataset());
}

export function buildEventChannelUrl(
  slug: string,
  token: string,
  origin = siteOrigin(),
): string {
  const base = origin.replace(/\/$/, "");
  const cleanSlug = slug.trim();
  const cleanToken = token.trim().toLowerCase();
  return `${base}/events/${cleanSlug}?key=${cleanToken}`;
}
