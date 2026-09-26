import { getStudioProjectId, isDevProject } from "./env";
import {
  buildEventInviteUrl,
  normalizeEventPassword,
} from "../../web/functions/_lib/event-password.js";

/** Invite links point at the live website of this Studio's project. */
export function siteOrigin(projectId = getStudioProjectId()): string {
  const override = process.env.SANITY_STUDIO_INVITE_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  return isDevProject(projectId) ? "https://gwenda-web-dev.pages.dev" : "https://gwenda.co.uk";
}

export function buildEventChannelUrl(
  slug: string,
  password: string,
  origin = siteOrigin(),
): string {
  return buildEventInviteUrl(origin, slug, normalizeEventPassword(password));
}
