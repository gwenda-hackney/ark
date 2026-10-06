import type { SubscriberRepository } from "../../../shared/guests/subscriber-repository.js";

export type Env = {
  /** The Website Baserow token, while subscribers are on Baserow (#127). */
  BASEROW_API_KEY: string;
  MAILCHIMP_API_KEY: string;
  /** Bearer secret for manual POST / sync runs. */
  SYNC_SECRET: string;
  /** Mailchimp Audience (list) ID. */
  MAILCHIMP_AUDIENCE_ID?: string;
  /** Optional. Only needed if the token can see more than one Subscribers table. */
  BASEROW_DATABASE_ID?: string;
  BASEROW_SUBSCRIBE_TABLE_NAME?: string;
  /** Baserow table for durable sync-run history. */
  BASEROW_API_URL?: string;
  /** The website D1 database (#127): subscribers once guests move, and the write freeze (#191). */
  WEBSITE_DB?: unknown;
  /** Local runs only (scripts/run-local.ts): no binding, so D1 is reached over the API. */
  SITE_ENV?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
};

export type SyncOptions = {
  dryRun?: boolean;
  /** Max subscribers to process in one run. */
  limit?: number;
  /**
   * When true, process every row (ignore Synced filter).
   * Used for ESP migration / Mailchimp backfill after Buttondown already marked Synced.
   */
  all?: boolean;
  /** Mailchimp's fetch, for tests. */
  fetchImpl?: typeof fetch;
  /** Where subscribers are read and marked synced; by default this env's (tests hand in memory). */
  repository?: SubscriberRepository;
};

export type SyncRowResult = {
  rowId: number;
  email: string;
  status: "synced" | "dry-run" | "skipped" | "error";
  detail?: string;
};

export type SyncSummary = {
  ok: boolean;
  scanned: number;
  synced: number;
  dryRun: boolean;
  errors: number;
  results: SyncRowResult[];
  /** Set when the run was skipped because guests are frozen (#191). */
  frozen?: boolean;
};
