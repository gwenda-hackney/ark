/** Types for the TypeScript Workers' tests; see memory-subscribers.js. */
import type { SubscriberRepository } from "../subscriber-repository.js";

export function memorySubscriberRepository(): SubscriberRepository & {
  importAll(snapshot: {
    subscribers: import("../subscribers.js").SubscriberRecord[];
  }): Promise<void>;
};
