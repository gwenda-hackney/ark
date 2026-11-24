/** Types for the TypeScript Workers; see subscribers.js. */
export type SubscriberRecord = {
  id: number;
  email: string;
  tags: string[];
  /** YYYY-MM-DD: first seen */
  signedUpOn: string | null;
  /** On the mailing list: the only records the Mailchimp sync sends. */
  marketing: boolean;
  /** YYYY-MM-DD: the day they last said yes; null without consent. */
  marketingOn: string | null;
  /** YYYY-MM-DD: the day they unsubscribed (in Mailchimp); null otherwise. */
  marketingOffOn: string | null;
  /** YYYY-MM-DD: the last day they got online through the guest Wi-Fi. */
  lastSeenOn: string | null;
  /** How many days they have got online through the guest Wi-Fi. */
  visitDays: number;
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
  input: {
    email: unknown;
    tag?: unknown;
    now?: Date;
    /** May get marketing (default true). False never takes an address off the list. */
    marketing?: boolean;
    /** Got online through the guest Wi-Fi now: sets lastSeenOn. */
    visit?: boolean;
  },
): Promise<SubscribeResult>;
