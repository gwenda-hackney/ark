export type Env = {
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
  /** The website D1 database (#127); here only for the write freeze (#191). */
  WEBSITE_DB?: unknown;
};

export type SyncOptions = {
  dryRun?: boolean;
  /** Max Baserow rows to process in one run. */
  limit?: number;
  /**
   * When true, process every row (ignore Synced filter).
   * Used for ESP migration / Mailchimp backfill after Buttondown already marked Synced.
   */
  all?: boolean;
  fetchImpl?: typeof fetch;
};

export type BaserowSubscribeRow = {
  id: number;
  Email?: string;
  /** single_select string/object or multiple_select array of those. */
  Tag?: string | { value?: string } | Array<string | { value?: string }>;
  /** Website signup date (YYYY-MM-DD). */
  "Signed up"?: string;
  Synced?: boolean;
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
