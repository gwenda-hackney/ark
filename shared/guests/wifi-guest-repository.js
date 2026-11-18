/**
 * WifiGuestRepository (guests): the only way anything reads or writes Wi-Fi
 * guests (wifi-guests.js). The Wi-Fi portal writes them. On D1 only (the
 * website database). wifi-guest-repository.contract.test.js holds every
 * adapter to this:
 *
 *   recordVisit({ email, on })   WifiGuestRecord; a new address is first and
 *                                last seen `on`, a known one (any case) moves
 *                                lastSeenOn to `on`
 *   getByEmail(email)            WifiGuestRecord, any case, or null
 *   remove(id)                   a missing record is fine
 *   count()                      how many there are
 *   exportAll()                  { wifiGuests }; importAll(snapshot) on memory and D1
 */
import { databaseFor } from "../d1-env.js";
import { d1WifiGuestRepository } from "./adapters/d1-wifi-guests.js";

/** The repository for this runtime. Tests may hand one in as env.wifiGuestRepository. */
export function wifiGuestRepository(env) {
  if (env?.wifiGuestRepository) return env.wifiGuestRepository;
  return d1WifiGuestRepository(databaseFor(env, "website"));
}
