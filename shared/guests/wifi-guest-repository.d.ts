/** Types for the TypeScript Workers; see wifi-guest-repository.js. */
import type { WifiGuestRecord } from "./wifi-guests.js";

export type WifiGuestRepository = {
  recordVisit(visit: { email: string; on: string }): Promise<WifiGuestRecord>;
  getByEmail(email: string): Promise<WifiGuestRecord | null>;
  remove(id: number): Promise<void>;
  count(): Promise<number>;
  exportAll(): Promise<{ wifiGuests: WifiGuestRecord[] }>;
};

export function wifiGuestRepository(env: unknown): WifiGuestRepository;
