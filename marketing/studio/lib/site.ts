import { getStudioDataset } from "./env";
import {
  buildEventInviteUrl,
  normalizeEventPassword,
} from "../web/functions/_lib/event-password.js";

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
  password: string,
  origin = siteOrigin(),
): string {
  return buildEventInviteUrl(origin, slug, normalizeEventPassword(password));
}
