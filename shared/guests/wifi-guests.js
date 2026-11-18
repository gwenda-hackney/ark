/**
 * Wi-Fi guests (guests): everyone who got online through the guest Wi-Fi
 * portal. Their email is for Wi-Fi and service messages, not marketing: the
 * newsletter list is subscribers.js, which a Wi-Fi guest joins only by
 * ticking the box. One record per address; coming back moves lastSeenOn.
 *
 *   WifiGuestRecord = { id: number, email: string,
 *                       firstSeenOn: "YYYY-MM-DD", lastSeenOn: "YYYY-MM-DD" }
 *
 * Storage is the repository's (wifi-guest-repository.js).
 */
import { normalizeEmail } from "./subscribers.js";

/**
 * Record that `email` got online today (UTC): a new record, or the existing
 * one's lastSeenOn moved on.
 * @param {{ recordVisit(visit: { email: string, on: string }): Promise<object> }} repo
 * @returns {Promise<{ ok: true, guest: object } | { ok: false, error: string }>}
 */
export async function recordWifiGuest(
  repo,
  { email: rawEmail, now = new Date() },
) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "Valid email required." };
  const guest = await repo.recordVisit({
    email,
    on: now.toISOString().slice(0, 10),
  });
  return { ok: true, guest };
}
