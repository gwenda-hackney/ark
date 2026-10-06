/**
 * SubscriberRepository (guests, #186): the only way anything reads or writes
 * subscribers: the website's sign-up and its smoke test, the Wi-Fi portal,
 * the Mailchimp sync and the smoke-test cleanup. Records are subscribers.js's;
 * subscriber-repository.contract.test.js holds every adapter to this:
 *
 *   listByEmail(email)            SubscriberRecord[], any case; at most one on D1
 *   listUnsynced({ limit, all })  up to `limit` unsynced records (every record with
 *                                 `all`), by id
 *   create(fields)                SubscriberRecord; throws code "duplicate" when the
 *                                 email is there already
 *   update(id, fields)            SubscriberRecord, or null when missing; only the
 *                                 given fields change
 *   remove(id)                    a missing record is fine
 *   count()                       how many there are
 *   exportAll()                   { subscribers }; importAll(snapshot) on memory and D1
 *
 * Baserow until `store:guests` says d1 (shared/data-store.js). Subscribers
 * and form submissions move together, as one feature.
 */
import { switchedRepository } from "../data-store.js";
import { databaseFor } from "../d1-env.js";
import { baserowSubscriberRepository } from "./adapters/baserow-subscribers.js";
import { d1SubscriberRepository } from "./adapters/d1-subscribers.js";

/**
 * The repository for this runtime. Tests may hand one in as
 * env.subscriberRepository. `baserow` builds the Baserow adapter, for an app
 * whose Website token isn't BASEROW_API_KEY (ops).
 */
export function subscriberRepository(
  env,
  { baserow = baserowSubscriberRepository } = {},
) {
  if (env?.subscriberRepository) return env.subscriberRepository;
  return switchedRepository(env, "guests", {
    baserow,
    d1: (env) => d1SubscriberRepository(databaseFor(env, "website")),
  });
}
