/**
 * SubscriberRepository (guests, #186): the only way anything reads or writes
 * subscribers: the website's sign-up and its smoke test, the Wi-Fi portal,
 * the Mailchimp sync and the smoke-test cleanup. Records are subscribers.js's;
 * subscriber-repository.contract.test.js holds every adapter to this:
 *
 *   listByEmail(email)            SubscriberRecord[], any case; at most one on D1
 *   listUnsynced({ limit, all })  up to `limit` unsynced records (every record with
 *                                 `all`), by id; only marketing ones, ever
 *   latestMarketingOff()          the latest marketingOffOn, or null
 *   create(fields)                SubscriberRecord; throws code "duplicate" when the
 *                                 email is there already
 *   update(id, fields)            SubscriberRecord, or null when missing; only the
 *                                 given fields change
 *   remove(id)                    a missing record is fine
 *   count()                       how many there are
 *   exportAll()                   { subscribers }; importAll(snapshot) on memory and D1
 *
 * Subscribers live in the website D1 database (#127).
 */
import { databaseFor } from "../d1-env.js";
import { d1SubscriberRepository } from "./adapters/d1-subscribers.js";

/** The repository for this runtime. Tests may hand one in as env.subscriberRepository. */
export function subscriberRepository(env) {
  return env?.subscriberRepository || d1SubscriberRepository(databaseFor(env, "website"));
}
