/** Types for the TypeScript Workers' tests; see memory-wifi-guests.js. */
import type { WifiGuestRepository } from "../wifi-guest-repository.js";

export function memoryWifiGuestRepository(): WifiGuestRepository & {
  importAll(snapshot: {
    wifiGuests: import("../wifi-guests.js").WifiGuestRecord[];
  }): Promise<void>;
};
