/** Types for the TypeScript Workers; see subscribers.js. */
export type SubscriberRecord = {
  id: number;
  email: string;
  tags: string[];
  /** YYYY-MM-DD */
  signedUpOn: string | null;
  synced: boolean;
};

export type SubscribeResult =
  | {
      ok: true;
      status: 200;
      subscriber: SubscriberRecord | null;
      changed: boolean;
    }
  | { ok: false; status: number; error: string };

export const SUBSCRIBER_TAGS: string[];
export function normalizeEmail(raw: unknown): string | null;
export function normalizeTags(raw: unknown): string[];
export function mergeTags(existing: unknown, add: string): string[];
export function subscribe(
  repo: Pick<
    import("./subscriber-repository.js").SubscriberRepository,
    "listByEmail" | "create" | "update"
  >,
  input: { email: unknown; tag?: unknown; now?: Date },
): Promise<SubscribeResult>;
