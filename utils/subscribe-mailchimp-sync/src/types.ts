export type Env = {
  BASEROW_API_KEY: string;
  MAILCHIMP_API_KEY: string;
  /** Bearer secret for manual POST / sync runs. */
  SYNC_SECRET: string;
  /** Mailchimp Audience (list) ID. */
  MAILCHIMP_AUDIENCE_ID?: string;
  BASEROW_TABLE_ID?: string;
  BASEROW_API_URL?: string;
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
  Tag?: string | { value?: string };
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
};
