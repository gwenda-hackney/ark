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
  assert.deepEqual(seen.map((row) => row[0]).sort(), ["preview", "production"]);
  assert.equal(seen[0][2], "series-jazz");
});

import { websiteStatusFor } from "./event-publish.js";

const docs = (...rows) => new Map(rows.map((row) => [row._id, row]));
const series = (short) => ({ _id: "series-negroni", _type: "eventSeries", _rev: "a", shortDescription: short });
const night = (date, extra = {}) => ({ _id: `event-negroni-${date}`, _type: "event", seriesId: "negroni", date, ...extra });
const negroni = { slug: "negroni", publish: { live: "current" } };

test("a series short-description change makes the event out of date", () => {
  const preview = docs(series("£8 Negronis"), night("2026-09-29"));
  const production = docs({ ...series("£10 Negronis"), _rev: "b" }, night("2026-09-29"));
  assert.equal(websiteStatusFor(negroni, preview, production), "stale");
});

test("identical documents (revisions aside) are on the website", () => {
  const preview = docs(series("£8"), night("2026-09-29"));
  const production = docs({ ...series("£8"), _rev: "zzz", _updatedAt: "x" }, night("2026-09-29"));
  assert.equal(websiteStatusFor(negroni, preview, production), "current");
});

test("nothing live is unpublished; a night only on one side is stale", () => {
  const preview = docs(series("£8"), night("2026-09-29"), night("2026-10-06"));
  assert.equal(websiteStatusFor(negroni, preview, docs()), "unpublished");
  assert.equal(
    websiteStatusFor(negroni, preview, docs(series("£8"), night("2026-09-29"))),
    "stale",
  );
});

test("not staged at all keeps ops' own answer", () => {
  assert.equal(websiteStatusFor(negroni, docs(), docs(series("x"))), "current");
});

test("a night marked removed on the preview leaves the event waiting for the website", () => {
  const preview = docs(series("£8"), night("2026-09-29", { removed: true }), night("2026-10-06"));
  const production = docs(series("£8"), night("2026-09-29"), night("2026-10-06"));
  assert.equal(websiteStatusFor(negroni, preview, production), "stale");
});

import { markNightsRemoved } from "./event-publish.js";

test("dropped nights: live ones get a removed draft, never-published ones lose their draft", async () => {
  const sent = [];
  const warnings = await markNightsRemoved(
    {},
    [{ sanityId: "event-negroni-2026-09-29" }, { sanityId: "event-negroni-2026-10-06" }, { date: "x" }],
    {
      query: async (_env, view, _groq, { ids }) => {
        assert.equal(view, "production");
        assert.deepEqual(ids, ["event-negroni-2026-09-29", "event-negroni-2026-10-06"]);
        return ["event-negroni-2026-09-29"];
      },
      mutate: async (_env, mutations) => sent.push(...mutations),
    },
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(sent, [
    { patch: { id: "event-negroni-2026-09-29", set: { removed: true } } },
    { delete: { id: "event-negroni-2026-10-06" } },
  ]);
});

import { removeEventFromWebsite } from "./event-publish.js";

test("deleting an event takes its nights off before the series (Sanity refuses the other order)", async () => {
  const deleted = [];
  const query = async () => ["series-jazz", "event-jazz-2026-10-01"];
  const warnings = await removeEventFromWebsite({}, { slug: "jazz", dates: [] }, null, {
    query,
    mutate: async (_env, [mutation]) => deleted.push(mutation.delete.id),
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(deleted, ["event-jazz-2026-10-01", "series-jazz"]);
});
