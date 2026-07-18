import { createHash } from "node:crypto";
import type {
  BaserowSubscribeRow,
  Env,
  SyncOptions,
  SyncRowResult,
  SyncSummary,
} from "./types";

export const DEFAULT_BASEROW_API = "https://api.baserow.io";
export const PRODUCTION_SUBSCRIBE_TABLE_ID = "1017358";
export const DEFAULT_MAILCHIMP_AUDIENCE_ID = "e2c69d5d31";
export const DEFAULT_LIMIT = 100;
/** Mailchimp merge field for Baserow "Signed up" (YYYY-MM-DD). */
export const SIGNED_UP_MERGE_TAG = "SIGNEDUP";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMINAL_MAILCHIMP_STATUSES = new Set([
  "unsubscribed",
  "cleaned",
  "archived",
]);

export function resolveTableId(env: Pick<Env, "BASEROW_TABLE_ID">): string {
  return env.BASEROW_TABLE_ID?.trim() || PRODUCTION_SUBSCRIBE_TABLE_ID;
}

export function resolveApiBase(env: Pick<Env, "BASEROW_API_URL">): string {
  return (env.BASEROW_API_URL?.trim() || DEFAULT_BASEROW_API).replace(/\/$/, "");
}

export function resolveAudienceId(
  env: Pick<Env, "MAILCHIMP_AUDIENCE_ID">,
): string {
  return env.MAILCHIMP_AUDIENCE_ID?.trim() || DEFAULT_MAILCHIMP_AUDIENCE_ID;
}

export function resolveMailchimpBase(apiKey: string): string {
  const dc = apiKey.split("-").pop()?.trim();
  if (!dc) throw new Error("MAILCHIMP_API_KEY is missing a data-centre suffix");
  return `https://${dc}.api.mailchimp.com/3.0`;
}

export function mailchimpAuthHeader(apiKey: string): string {
  return `Basic ${btoa(`anystring:${apiKey}`)}`;
}

export function mailchimpSubscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email && EMAIL_RE.test(email) ? email : null;
}

/** Baserow single-select may arrive as `{ value: "prelaunch" }`. */
export function normalizeTag(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const tag = raw.trim();
    return tag || undefined;
  }
  if (raw && typeof raw === "object" && "value" in raw) {
    const value = (raw as { value?: unknown }).value;
    if (typeof value === "string") {
      const tag = value.trim();
      return tag || undefined;
    }
  }
  return undefined;
}

/** Accept YYYY-MM-DD or ISO datetime; return YYYY-MM-DD for Mailchimp date fields. */
export function normalizeSignedUp(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const day = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return day;
}

export function isAuthorized(
  request: Request,
  env: Pick<Env, "SYNC_SECRET">,
): boolean {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const secret = header.slice("Bearer ".length).trim();
  return Boolean(secret && env.SYNC_SECRET && secret === env.SYNC_SECRET);
}

type ListUnsyncedParams = {
  apiKey: string;
  apiBase: string;
  tableId: string;
  limit: number;
  /** When true, do not filter on Synced=false. */
  all?: boolean;
  fetchImpl: typeof fetch;
};

export async function listUnsyncedRows({
  apiKey,
  apiBase,
  tableId,
  limit,
  all = false,
  fetchImpl,
}: ListUnsyncedParams): Promise<BaserowSubscribeRow[]> {
  const url = new URL(`${apiBase}/api/database/rows/table/${tableId}/`);
  url.searchParams.set("user_field_names", "true");
  if (!all) {
    url.searchParams.set("filter__Synced__boolean", "false");
  }
  url.searchParams.set("size", String(limit));

  const upstream = await fetchImpl(url.toString(), {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`Baserow list failed (${upstream.status}): ${detail}`);
  }

  const body = (await upstream.json()) as { results?: BaserowSubscribeRow[] };
  return Array.isArray(body.results) ? body.results : [];
}

type UpsertParams = {
  apiKey: string;
  audienceId: string;
  email: string;
  tag?: string;
  signedUp?: string;
  fetchImpl: typeof fetch;
};

export type UpsertResult =
  | { ok: true; skippedEspUpdate?: boolean }
  | { ok: false; detail: string; rateLimited?: boolean };

export async function upsertMailchimpMember({
  apiKey,
  audienceId,
  email,
  tag,
  signedUp,
  fetchImpl,
}: UpsertParams): Promise<UpsertResult> {
  const base = resolveMailchimpBase(apiKey);
  const auth = mailchimpAuthHeader(apiKey);
  const hash = mailchimpSubscriberHash(email);
  const memberUrl = `${base}/lists/${audienceId}/members/${hash}`;

  const existing = await fetchImpl(memberUrl, {
    headers: { Authorization: auth },
  });

  if (existing.ok) {
    const member = (await existing.json()) as { status?: string };
    if (member.status && TERMINAL_MAILCHIMP_STATUSES.has(member.status)) {
      // Do not force resubscribe; treat as synced for Baserow.
      return { ok: true, skippedEspUpdate: true };
    }
  } else if (existing.status !== 404) {
    const detail = await existing.text();
    return {
      ok: false,
      detail: `Mailchimp GET ${existing.status}: ${detail}`,
      rateLimited: isRateLimited(existing.status, detail),
    };
  }

  const body: Record<string, unknown> = {
    email_address: email,
    status_if_new: "subscribed",
    status: "subscribed",
  };
  if (signedUp) {
    body.merge_fields = { [SIGNED_UP_MERGE_TAG]: signedUp };
  }

  const put = await fetchImpl(memberUrl, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!put.ok) {
    const detail = await put.text();
    return {
      ok: false,
      detail: `Mailchimp PUT ${put.status}: ${detail}`,
      rateLimited: isRateLimited(put.status, detail),
    };
  }

  const trimmedTag = tag?.trim();
  if (trimmedTag) {
    const tagged = await applyMailchimpTag({
      apiKey,
      audienceId,
      hash,
      tag: trimmedTag,
      fetchImpl,
    });
    if (!tagged.ok) return tagged;
  }

  return { ok: true };
}

type TagParams = {
  apiKey: string;
  audienceId: string;
  hash: string;
  tag: string;
  fetchImpl: typeof fetch;
};

export async function applyMailchimpTag({
  apiKey,
  audienceId,
  hash,
  tag,
  fetchImpl,
}: TagParams): Promise<UpsertResult> {
  const base = resolveMailchimpBase(apiKey);
  const auth = mailchimpAuthHeader(apiKey);
  const upstream = await fetchImpl(
    `${base}/lists/${audienceId}/members/${hash}/tags`,
    {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tags: [{ name: tag, status: "active" }],
      }),
    },
  );

  if (upstream.ok || upstream.status === 204) return { ok: true };

  const detail = await upstream.text();
  return {
    ok: false,
    detail: `Mailchimp tags ${upstream.status}: ${detail}`,
    rateLimited: isRateLimited(upstream.status, detail),
  };
}

export function isRateLimited(status: number, detail: string): boolean {
  if (status === 429) return true;
  return /rate.?limit|too many requests|try again later/i.test(detail);
}

type MarkSyncedParams = {
  apiKey: string;
  apiBase: string;
  tableId: string;
  rowId: number;
  fetchImpl: typeof fetch;
};

export async function markBaserowSynced({
  apiKey,
  apiBase,
  tableId,
  rowId,
  fetchImpl,
}: MarkSyncedParams): Promise<void> {
  const url = `${apiBase}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`;
  const upstream = await fetchImpl(url, {
    method: "PATCH",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Synced: true }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(
      `Baserow patch ${rowId} failed (${upstream.status}): ${detail}`,
    );
  }
}

export async function syncUnsyncedSubscribers(
  env: Env,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const dryRun = options.dryRun === true;
  const all = options.all === true;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const fetchImpl = options.fetchImpl ?? fetch;

  const baserowKey = env.BASEROW_API_KEY?.trim();
  const mailchimpKey = env.MAILCHIMP_API_KEY?.trim();
  if (!baserowKey) throw new Error("BASEROW_API_KEY is not configured");
  if (!mailchimpKey) throw new Error("MAILCHIMP_API_KEY is not configured");

  const apiBase = resolveApiBase(env);
  const tableId = resolveTableId(env);
  const audienceId = resolveAudienceId(env);
  const rows = await listUnsyncedRows({
    apiKey: baserowKey,
    apiBase,
    tableId,
    limit,
    all,
    fetchImpl,
  });

  const results: SyncRowResult[] = [];
  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    const email = normalizeEmail(row.Email);
    if (!email) {
      results.push({
        rowId: row.id,
        email: String(row.Email ?? ""),
        status: "skipped",
        detail: "Invalid or missing Email",
      });
      continue;
    }

    if (dryRun) {
      results.push({ rowId: row.id, email, status: "dry-run" });
      synced += 1;
      continue;
    }

    const upserted = await upsertMailchimpMember({
      apiKey: mailchimpKey,
      audienceId,
      email,
      tag: normalizeTag(row.Tag),
      signedUp: normalizeSignedUp(row["Signed up"]),
      fetchImpl,
    });

    if (!upserted.ok) {
      errors += 1;
      results.push({
        rowId: row.id,
        email,
        status: "error",
        detail: upserted.detail,
      });
      if (upserted.rateLimited) break;
      continue;
    }

    try {
      await markBaserowSynced({
        apiKey: baserowKey,
        apiBase,
        tableId,
        rowId: row.id,
        fetchImpl,
      });
      synced += 1;
      results.push({
        rowId: row.id,
        email,
        status: "synced",
        detail: upserted.skippedEspUpdate
          ? "Mailchimp member already terminal; Baserow marked synced"
          : undefined,
      });
    } catch (error) {
      errors += 1;
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ rowId: row.id, email, status: "error", detail });
    }
  }

  return {
    ok: errors === 0,
    scanned: rows.length,
    synced,
    dryRun,
    errors,
    results,
  };
}
