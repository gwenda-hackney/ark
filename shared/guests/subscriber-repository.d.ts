/** Types for the TypeScript Workers; see subscriber-repository.js. */
import type { SubscriberRecord } from "./subscribers.js";

export type SubscriberRepository = {
  listByEmail(email: string): Promise<SubscriberRecord[]>;
  listUnsynced(options?: {
    limit?: number;
    all?: boolean;
  }): Promise<SubscriberRecord[]>;
  /** Fields left out take their defaults: on the list, no dates, unsynced. */
  create(
    fields: Pick<SubscriberRecord, "email"> &
      Partial<Omit<SubscriberRecord, "id" | "email">>,
  ): Promise<SubscriberRecord>;
  update(
    id: number,
    fields: Partial<Omit<SubscriberRecord, "id">>,
  ): Promise<SubscriberRecord | null>;
  remove(id: number): Promise<void>;
  /** The latest marketingOffOn (YYYY-MM-DD), or null: where the sync picks up Mailchimp's unsubscribes. */
  latestMarketingOff(): Promise<string | null>;
  count(): Promise<number>;
  exportAll(): Promise<{ subscribers: SubscriberRecord[] }>;
};

export function subscriberRepository(env: unknown): SubscriberRepository;
