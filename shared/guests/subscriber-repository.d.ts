/** Types for the TypeScript Workers; see subscriber-repository.js. */
import type { SubscriberRecord } from "./subscribers.js";

export type SubscriberRepository = {
  listByEmail(email: string): Promise<SubscriberRecord[]>;
  listUnsynced(options?: {
    limit?: number;
    all?: boolean;
  }): Promise<SubscriberRecord[]>;
  create(fields: Omit<SubscriberRecord, "id">): Promise<SubscriberRecord>;
  update(
    id: number,
    fields: Partial<Omit<SubscriberRecord, "id">>,
  ): Promise<SubscriberRecord | null>;
  remove(id: number): Promise<void>;
  count(): Promise<number>;
  exportAll(): Promise<{ subscribers: SubscriberRecord[] }>;
};

export function subscriberRepository(
  env: unknown,
  options?: { baserow?: (env: any) => SubscriberRepository },
): SubscriberRepository;
