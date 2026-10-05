/**
 * End-to-end sign-up test for the post-deploy smoke check.
 *
 * Signs up a test address through the same code POST /api/subscribe uses,
 * then signs it up again with the other tag (the path a returning guest
 * takes), checks the row after each, and deletes it. The address is
 * SIGNUP_SMOKE_EMAIL, which the Mailchimp sync skips, so it never reaches
 * the real list even if the sync runs before the row is gone.
 *
 * The tags are real ones (Tag only allows its options): prelaunch, then wifi.
 */
import { SIGNUP_SMOKE_EMAIL } from "../../../../shared/smoke-test.js";
import { DEFAULT_BASEROW_API, resolveSubscribeTableId } from "./baserow.js";
import { normalizeTags, subscribeEmail } from "./subscribe.js";

function baserow(env, tableId) {
  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(
    /\/$/,
    "",
  );
  const headers = { Authorization: `Token ${env.BASEROW_API_KEY}` };
  return {
    async rowsFor(email) {
      const url = new URL(`${apiBase}/api/database/rows/table/${tableId}/`);
      url.searchParams.set("user_field_names", "true");
      url.searchParams.set("filter__Email__equal", email);
      const res = await fetch(url, { headers });
      if (!res.ok)
        throw new Error(`Reading the test row failed: Baserow ${res.status}.`);
      return (await res.json()).results || [];
    },
    async remove(id) {
      const res = await fetch(
        `${apiBase}/api/database/rows/table/${tableId}/${id}/`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (!res.ok && res.status !== 404)
        throw new Error(
          `Cleaning up the test row failed: Baserow ${res.status}.`,
        );
    },
  };
}

async function signUp(env, email, tag, step) {
  const result = await subscribeEmail({ email, tag, env });
  if (!result.ok)
    throw new Error(`${step} failed: ${result.error || result.status}`);
}

function expectOneRow(rows, tags, step) {
  if (rows.length !== 1)
    throw new Error(
      `${step}: expected one row for the test address, found ${rows.length}.`,
    );
  const [row] = rows;
  const saved = normalizeTags(row.Tag);
  if (saved.join(",") !== tags.join(","))
    throw new Error(
      `${step}: tags are [${saved.join(", ")}], expected [${tags.join(", ")}].`,
    );
  if (!row["Signed up"]) throw new Error(`${step}: "Signed up" is empty.`);
  if (row.Synced) throw new Error(`${step}: the row is marked synced already.`);
}

/** Throws with a clear step name if any part fails. Always tries to delete the row. */
export async function runSignupSmoke(env, { email = SIGNUP_SMOKE_EMAIL } = {}) {
  const table = await resolveSubscribeTableId(env);
  if (!table.ok) throw new Error(table.error || "Subscribers table not found.");
  const store = baserow(env, table.tableId);
  const removeAll = async () => {
    for (const row of await store.rowsFor(email)) await store.remove(row.id);
  };

  // A run that failed before cleaning up leaves its row; start from none.
  await removeAll();
  try {
    await signUp(env, email, "prelaunch", "Signing up");
    expectOneRow(await store.rowsFor(email), ["prelaunch"], "After signing up");
    await signUp(env, email, "wifi", "Signing up again");
    expectOneRow(
      await store.rowsFor(email),
      ["prelaunch", "wifi"],
      "After signing up again",
    );
  } finally {
    await removeAll();
  }
  return `${email} signed up, second tag merged, test row deleted`;
}
