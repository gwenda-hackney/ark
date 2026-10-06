/**
 * End-to-end sign-up test for the post-deploy smoke check.
 *
 * Signs up a test address through the same code POST /api/subscribe uses,
 * then signs it up again with the other tag (the path a returning guest
 * takes), checks the record after each, and deletes it. The address is
 * SIGNUP_SMOKE_EMAIL, which the Mailchimp sync skips, so it never reaches
 * the real list even if the sync runs before the record is gone.
 *
 * The tags are real ones (Baserow's Tag only allows its options): prelaunch,
 * then wifi.
 */
import { SIGNUP_SMOKE_EMAIL } from "../../../../shared/smoke-test.js";
import { subscriberRepository } from "../../../../shared/guests/subscriber-repository.js";
import { subscribeEmail } from "./subscribe.js";

async function signUp(env, email, tag, step) {
  const result = await subscribeEmail({ email, tag, env });
  if (!result.ok)
    throw new Error(`${step} failed: ${result.error || result.status}`);
}

function expectOne(records, tags, step) {
  if (records.length !== 1)
    throw new Error(
      `${step}: expected one row for the test address, found ${records.length}.`,
    );
  const [record] = records;
  if (record.tags.join(",") !== tags.join(","))
    throw new Error(
      `${step}: tags are [${record.tags.join(", ")}], expected [${tags.join(", ")}].`,
    );
  if (!record.signedUpOn) throw new Error(`${step}: "Signed up" is empty.`);
  if (record.synced)
    throw new Error(`${step}: the row is marked synced already.`);
}

/** Throws with a clear step name if any part fails. Always tries to delete the record. */
export async function runSignupSmoke(env, { email = SIGNUP_SMOKE_EMAIL } = {}) {
  const subscribers = subscriberRepository(env);
  const removeAll = async () => {
    for (const record of await subscribers.listByEmail(email))
      await subscribers.remove(record.id);
  };

  // A run that failed before cleaning up leaves its record; start from none.
  await removeAll();
  try {
    await signUp(env, email, "prelaunch", "Signing up");
    expectOne(
      await subscribers.listByEmail(email),
      ["prelaunch"],
      "After signing up",
    );
    await signUp(env, email, "wifi", "Signing up again");
    expectOne(
      await subscribers.listByEmail(email),
      ["prelaunch", "wifi"],
      "After signing up again",
    );
  } finally {
    await removeAll();
  }
  return `${email} signed up, second tag merged, test row deleted`;
}
