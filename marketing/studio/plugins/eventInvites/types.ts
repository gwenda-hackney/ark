import { siteOriginForDataset as siteOriginForDatasetFromLib } from "../../lib/site";

export type EventOption = {
  id: string;
  title: string;
  date: string;
};

export type InviteSummary = {
  invited: number;
  responded: number;
  totalAttending: number;
  pendingSend: number;
  notResponded: number;
};

export type InviteGuest = {
  rowId: number;
  name: string;
  contact: string | null;
  channel: string | null;
  token: string | null;
  rsvpGuests: number | null;
  rsvpUpdated: string | null;
};

export type SummaryResponse = {
  ok: boolean;
  slug: string;
  event: {
    title: string;
    description: string;
    date: string | null;
    heroImageUrl: string | null;
  } | null;
  summary: InviteSummary;
  error?: string;
};

export type SendResponse = {
  ok: boolean;
  dryRun?: boolean;
  emailCount?: number;
  instagramSent?: number;
  instagramManual?: number;
  skipped?: number;
  error?: string;
};

export function adminBaseUrl(): string {
  return (process.env.SANITY_STUDIO_EVENT_ADMIN_URL ?? "").replace(/\/$/, "");
}

export function adminSecret(): string {
  return process.env.SANITY_STUDIO_EVENT_ADMIN_SECRET?.trim() ?? "";
}

export function baserowGridUrl(): string {
  return process.env.SANITY_STUDIO_BASEROW_RSVP_URL?.trim() ?? "";
}

export function siteOriginForDataset(dataset: string): string {
  return siteOriginForDatasetFromLib(dataset);
}
