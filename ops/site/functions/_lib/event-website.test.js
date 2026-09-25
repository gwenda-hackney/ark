import test from "node:test";
import assert from "node:assert/strict";
import { eventDocumentIds } from "./event-publish.js";

test("an event's documents: series, nights on either side, and ops rows", async () => {
  const seen = [];
  const query = async (_env, dataset, _groq, params) => {
    seen.push([dataset, params.slug, params.seriesId]);
    return dataset === "production"
      ? ["series-jazz", "event-jazz-2026-09-01"]
      : ["series-jazz", "event-jazz-2026-10-06"];
  };
  const ids = await eventDocumentIds(
    {},
    { slug: "jazz", dates: [{ sanityId: "event-jazz-2026-10-13" }, { sanityId: "" }] },
    { query },
  );
  assert.deepEqual(ids.sort(), [
    "event-jazz-2026-09-01",
    "event-jazz-2026-10-06",
    "event-jazz-2026-10-13",
    "series-jazz",
  ]);
  assert.deepEqual(seen.map((row) => row[0]).sort(), ["production", "staging"]);
  assert.equal(seen[0][2], "series-jazz");
});
