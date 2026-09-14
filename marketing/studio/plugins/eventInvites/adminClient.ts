import type { SendResponse, SummaryResponse } from "./types";
import { adminBaseUrl, adminSecret } from "./types";

function authHeaders(): HeadersInit {
  const secret = adminSecret();
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = adminBaseUrl();
  if (!base) throw new Error("SANITY_STUDIO_EVENT_ADMIN_URL is not configured.");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

export async function fetchInviteSummary(slug: string): Promise<SummaryResponse> {
  const response = await adminFetch(
    `/api/event-admin/summary?slug=${encodeURIComponent(slug)}`,
  );
  const body = (await response.json()) as SummaryResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Summary failed (${response.status})`);
  }
  return body;
}

export async function sendInvites(
  slug: string,
  dryRun: boolean,
): Promise<SendResponse> {
  const response = await adminFetch("/api/event-admin/send", {
    method: "POST",
    body: JSON.stringify({ slug, dryRun }),
  });
  const body = (await response.json()) as SendResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Send failed (${response.status})`);
  }
  return body;
}
