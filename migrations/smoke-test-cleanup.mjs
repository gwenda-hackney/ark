/**
 * Standing migration: remove anything the deploy smoke test's sign-up left
 * behind (marketing/web/functions/_lib/signup-smoke.js). The test deletes
 * its own row, so normally there's nothing to do; this catches a run that
 * died before cleaning up, and the address reaching Mailchimp if a sync
 * picked the row up first. After the deploy, so it runs after that deploy's
 * smoke test. Safe to re-run. Subscribers live in the website D1 database.
 */
import { createHash } from "node:crypto";
import { d1SubscriberRepository } from "../shared/guests/adapters/d1-subscribers.js";
import { SIGNUP_SMOKE_EMAIL } from "../shared/smoke-test.js";

export const app = "web";
export const phase = "post";
// Standing: tidies up after every deploy, so it runs each time.
export const every = true;
export const about = "Smoke tests: remove the test sign-up from Subscribers and Mailchimp";

/** The sync Worker's audience (marketing/subscribe-mailchimp-sync/wrangler.toml). */
const MAILCHIMP_AUDIENCE_ID = "e2c69d5d31";

/** Archive the test address in Mailchimp if it's there. Returns what happened. */
export async function archiveSmokeMember(apiKey, { audienceId = MAILCHIMP_AUDIENCE_ID, fetchImpl = fetch, dryRun = false } = {}) {
  const dc = apiKey.split("-").pop();
  const hash = createHash("md5").update(SIGNUP_SMOKE_EMAIL).digest("hex");
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${hash}`;
  const headers = { Authorization: `Bearer ${apiKey}` };
  const found = await fetchImpl(url, { headers });
  if (found.status === 404) return "not on the list";
  if (!found.ok) throw new Error(`Mailchimp ${found.status} looking up the test address.`);
  const { status } = await found.json();
  if (status === "archived") return "already archived";
  if (dryRun) return `would archive (is ${status})`;
  const removed = await fetchImpl(url, { method: "DELETE", headers });
  if (!removed.ok) throw new Error(`Mailchimp ${removed.status} archiving the test address.`);
  return `archived (was ${status})`;
}

/** Remove the test sign-up's records; returns how many there were. */
async function removeSmokeSubscribers({ d1, dryRun }) {
  const subscribers = d1SubscriberRepository(await d1("website"));
  const records = await subscribers.listByEmail(SIGNUP_SMOKE_EMAIL);
  if (!dryRun) for (const record of records) await subscribers.remove(record.id);
  return records.length;
}

export async function up({ d1, processEnv, log, dryRun = false, fetchImpl }) {
  const removed = await removeSmokeSubscribers({ d1, dryRun });
  const verb = dryRun ? "would remove" : "removed";
  log(removed ? `Subscribers: ${verb} ${removed} test row(s)` : "Subscribers: no test rows");

  // Only production syncs to Mailchimp, and only its promote exports the key.
  const apiKey = processEnv.MAILCHIMP_API_KEY?.trim();
  if (!apiKey) return log("Mailchimp: no key here (production only); skipped");
  log(`Mailchimp: ${await archiveSmokeMember(apiKey, { fetchImpl, dryRun })}`);
}
