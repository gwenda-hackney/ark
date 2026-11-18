import { frozenFeatures } from "../../../shared/write-freeze.js";
import { isSmokeSubscriber } from "../../../shared/smoke-test.js";
import { subscriberRepository } from "../../../shared/guests/subscriber-repository.js";
import { normalizeEmail } from "../../../shared/guests/subscribers.js";
import type { SubscriberRepository } from "../../../shared/guests/subscriber-repository.js";
import { createHash } from "node:crypto";
import type { Env, SyncOptions, SyncRowResult, SyncSummary } from "./types";
import { captureMessage } from "@sentry/cloudflare";

export { normalizeEmail };

export const DEFAULT_MAILCHIMP_AUDIENCE_ID = "e2c69d5d31";
export const DEFAULT_LIMIT = 100;
/** Mailchimp merge field for the subscriber's sign-up date (YYYY-MM-DD). */
export const SIGNED_UP_MERGE_TAG = "SIGNEDUP";

/**
 * Members never re-added: bounced (cleaned) or archived. An unsubscribed one
 * who signs up again is asked to confirm instead (upsertMailchimpMember).
 */
const NOT_READDED_STATUSES = new Set(["cleaned", "archived"]);

/** Mailchimp's most members per page. */
export const UNSUBSCRIBES_PAGE_SIZE = 1000;

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

type UpsertParams = {
  apiKey: string;
  audienceId: string;
  email: string;
  tags?: string[];
  signedUp?: string;
  fetchImpl: typeof fetch;
};

export type UpsertResult =
  | {
      ok: true;
      /** Why Mailchimp wasn't changed (a cleaned or archived member). */
      notReadded?: string;
      /** Re-added as pending: Mailchimp emails them to confirm. */
      confirming?: boolean;
      rejected?: string;
    }
  | { ok: false; detail: string; rateLimited?: boolean };

/**
 * Mailchimp refuses some addresses for good ("looks fake or invalid"): a 400
 * "Invalid Resource". Retrying can't help, so the row counts as done instead
 * of failing every hour. Returns Mailchimp's reason, or "" for other errors.
 */
const PERMANENT_REJECTIONS = new Set([
  "Invalid Resource",
  "Forgotten Email Not Subscribed",
  "Member In Compliance State",
]);

export function permanentRejection(status: number, body: string): string {
  if (status !== 400) return "";
  try {
    const parsed = JSON.parse(body) as { title?: string; detail?: string };
    // A bad address; an address someone had permanently deleted (forgotten);
    // or one Mailchimp won't take back without the person (compliance).
    return PERMANENT_REJECTIONS.has(parsed.title ?? "")
      ? parsed.detail || parsed.title || ""
      : "";
  } catch {
    return "";
  }
}

export async function upsertMailchimpMember({
  apiKey,
  audienceId,
  email,
  tags: rawTags,
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

  let current = "";
  if (existing.ok) {
    const member = (await existing.json()) as { status?: string };
    current = member.status ?? "";
    if (NOT_READDED_STATUSES.has(current)) {
      return { ok: true, notReadded: `Mailchimp member is ${current}; not re-added` };
    }
  } else if (existing.status !== 404) {
    const detail = await existing.text();
    return {
      ok: false,
      detail: `Mailchimp GET ${existing.status}: ${detail}`,
      rateLimited: isRateLimited(existing.status, detail),
    };
  }

  // Only consenting subscribers reach here. Someone who unsubscribed and
  // signed up again goes back as pending: Mailchimp won't subscribe them
  // directly, and emails them a link to confirm. A pending member stays
  // pending until they confirm.
  const status =
    current === "unsubscribed"
      ? "pending"
      : current === "pending"
        ? undefined
        : "subscribed";
  const body: Record<string, unknown> = {
    email_address: email,
    status_if_new: "subscribed",
    ...(status && { status }),
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
    const rejected = permanentRejection(put.status, detail);
    if (rejected) return { ok: true, rejected };
    return {
      ok: false,
      detail: `Mailchimp PUT ${put.status}: ${detail}`,
      rateLimited: isRateLimited(put.status, detail),
    };
  }

  const tags = (rawTags ?? []).map((tag) => tag.trim()).filter(Boolean);
  if (tags.length) {
    const tagged = await applyMailchimpTags({
      apiKey,
      audienceId,
      hash,
      tags,
      fetchImpl,
    });
    if (!tagged.ok) return tagged;
  }

  return status === "pending" ? { ok: true, confirming: true } : { ok: true };
}

type TagParams = {
  apiKey: string;
  audienceId: string;
  hash: string;
  tags: string[];
  fetchImpl: typeof fetch;
};

export async function applyMailchimpTags({
  apiKey,
  audienceId,
  hash,
  tags,
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
        tags: tags.map((name) => ({ name, status: "active" as const })),
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

type MailchimpMember = { email_address?: string; last_changed?: string };

/**
 * Bring Mailchimp's unsubscribes back: members unsubscribed since the latest
 * one we have (all of them, the first time) go off our list, marketingOffOn
 * the day they left. Only synced subscribers: an unsynced one has signed up
 * again since, and goes to Mailchimp as pending instead.
 */
export async function pullUnsubscribes({
  apiKey,
  audienceId,
  subscribers,
  fetchImpl,
  pageSize = UNSUBSCRIBES_PAGE_SIZE,
}: {
  apiKey: string;
  audienceId: string;
  subscribers: SubscriberRepository;
  fetchImpl: typeof fetch;
  pageSize?: number;
}): Promise<{ ok: true; unsubscribed: number } | { ok: false; detail: string }> {
  const since = await subscribers.latestMarketingOff();
  const base = resolveMailchimpBase(apiKey);
  let unsubscribed = 0;
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      status: "unsubscribed",
      fields: "members.email_address,members.last_changed,total_items",
      count: String(pageSize),
      offset: String(offset),
    });
    if (since) query.set("since_last_changed", `${since}T00:00:00+00:00`);
    const response = await fetchImpl(`${base}/lists/${audienceId}/members?${query}`, {
      headers: { Authorization: mailchimpAuthHeader(apiKey) },
    });
    if (!response.ok)
      return {
        ok: false,
        detail: `Mailchimp unsubscribes ${response.status}: ${await response.text()}`,
      };
    const page = (await response.json()) as {
      members?: MailchimpMember[];
      total_items?: number;
    };
    const members = page.members ?? [];
    for (const member of members) {
      const email = normalizeEmail(member.email_address);
      if (!email) continue;
      for (const record of await subscribers.listByEmail(email)) {
        if (!record.marketing || !record.synced) continue;
        await subscribers.update(record.id, {
          marketing: false,
          marketingOffOn:
            normalizeSignedUp(member.last_changed) ??
            new Date().toISOString().slice(0, 10),
        });
        unsubscribed += 1;
      }
    }
    if (!members.length || offset + members.length >= (page.total_items ?? 0))
      return { ok: true, unsubscribed };
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

  // While subscribers move to D1, marking them synced would be lost (#191);
  // the next hourly run catches up.
  if ((await frozenFeatures(env, ["guests"])).length) {
    return {
      ok: true,
      scanned: 0,
      synced: 0,
      dryRun,
      errors: 0,
      results: [],
      unsubscribed: 0,
      frozen: true,
    };
  }

  const mailchimpKey = env.MAILCHIMP_API_KEY?.trim();
  if (!mailchimpKey) throw new Error("MAILCHIMP_API_KEY is not configured");

  // Wherever subscribers live now: Baserow, or D1 once store:guests says so.
  const subscribers = options.repository ?? subscriberRepository(env);
  const audienceId = resolveAudienceId(env);

  const results: SyncRowResult[] = [];
  let synced = 0;
  let errors = 0;
  let unsubscribed = 0;

  // Unsubscribes first, so nobody who left is sent again. A dry run only looks.
  if (!dryRun) {
    const pulled = await pullUnsubscribes({
      apiKey: mailchimpKey,
      audienceId,
      subscribers,
      fetchImpl,
      pageSize: options.pageSize,
    });
    if (pulled.ok) unsubscribed = pulled.unsubscribed;
    else {
      errors += 1;
      console.error("[subscribe-mailchimp-sync] Unsubscribes not read", pulled.detail);
    }
  }

  // Marketing (consenting) subscribers only; the repository never lists others.
  const rows = await subscribers.listUnsynced({ limit, all });

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) {
      results.push({
        rowId: row.id,
        email: row.email,
        status: "skipped",
        detail: "Invalid or missing Email",
      });
      continue;
    }

    // The deploy smoke test's sign-up: deleted within seconds, never for Mailchimp.
    if (isSmokeSubscriber(email)) {
      results.push({ rowId: row.id, email, status: "skipped", detail: "Smoke test" });
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
      tags: row.tags,
      signedUp: normalizeSignedUp(row.signedUpOn),
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

    if (upserted.rejected) {
      // Visible in Sentry, without an alert email; the address stays out of it.
      captureMessage("Mailchimp rejected a subscriber address for good; not retried", {
        level: "warning",
        extra: { rowId: row.id },
      });
    }

    try {
      const marked = await subscribers.update(row.id, { synced: true });
      if (!marked) throw new Error(`Subscriber ${row.id} is gone; not marked synced`);
      synced += 1;
      results.push({
        rowId: row.id,
        email,
        status: "synced",
        detail: upserted.rejected
          ? `Mailchimp rejected the address, not retried: ${upserted.rejected}`
          : upserted.notReadded
            ? upserted.notReadded
            : upserted.confirming
              ? "Unsubscribed before: Mailchimp emails them to confirm (pending)"
              : undefined,
      });
    } catch (error) {
      errors += 1;
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ rowId: row.id, email, status: "error", detail });
    }
  }

  const summary: SyncSummary = {
    ok: errors === 0,
    scanned: rows.length,
    synced,
    dryRun,
    errors,
    results,
    unsubscribed,
  };

  return summary;
}
