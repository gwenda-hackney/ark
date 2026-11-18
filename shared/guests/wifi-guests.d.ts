/** Types for the TypeScript Workers; see wifi-guests.js. */
export type WifiGuestRecord = {
  id: number;
  email: string;
  /** YYYY-MM-DD */
  firstSeenOn: string;
  /** YYYY-MM-DD */
  lastSeenOn: string;
};

export function recordWifiGuest(
  repo: Pick<
    import("./wifi-guest-repository.js").WifiGuestRepository,
    "recordVisit"
  >,
  input: { email: unknown; now?: Date },
): Promise<{ ok: true; guest: WifiGuestRecord } | { ok: false; error: string }>;
