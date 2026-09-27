import { test } from "vitest";
import assert from "node:assert/strict";
import { eventDocumentIds } from "./event-publish.js";

test("an event's documents: series, nights on either side, and ops rows", async () => {
  const seen = [];
  const query = async (_env, dataset, _groq, params) => {
    seen.push([dataset, params.slugs, params.seriesIds]);
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
  assert.deepEqual(seen[0][2], ["series-jazz"]);
});

test("after a new web address, the old series is the event's too, and goes last", async () => {
  const seen = [];
  const query = async (_env, dataset, _groq, params) => {
    seen.push(params);
    return dataset === "production"
      ? ["series-jazz", "event-jazz-2026-10-06"]
      : ["series-jazz-nights", "event-jazz-2026-10-06"];
  };
  const ids = await eventDocumentIds(
    {},
    { slug: "jazz-nights", formerSlugs: ["jazz"], dates: [] },
    { query },
  );
  assert.deepEqual(seen[0], { slugs: ["jazz-nights", "jazz"], seriesIds: ["series-jazz-nights", "series-jazz"] });
  assert.deepEqual(ids, ["event-jazz-2026-10-06", "series-jazz-nights", "series-jazz"]);
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

test("a new web address reads out of date until the website has it", () => {
  const moved = { slug: "negroni-hour", formerSlugs: ["negroni"], publish: { live: "current" } };
  const renamed = { ...series("£8"), _id: "series-negroni-hour" };
  const preview = docs(renamed, { ...series("£8"), removed: true }, night("2026-09-29", { seriesId: "negroni-hour" }));
  const production = docs(series("£8"), night("2026-09-29"));
  assert.equal(websiteStatusFor(moved, preview, production), "stale");
  assert.equal(
    websiteStatusFor(moved, preview, docs(renamed, night("2026-09-29", { seriesId: "negroni-hour" }))),
    "current",
  );
});

import { retireFormerSeries } from "./event-publish.js";

test("the old series is marked removed once past nights point at the new one", async () => {
  const sent = [];
  const query = async (_env, dataset) =>
    dataset === "production"
      ? ["series-jazz"]
      : [
          { _id: "series-jazz", _type: "eventSeries" },
          { _id: "event-jazz-2026-09-01", _type: "event" },
          { _id: "event-jazz-2026-10-06", _type: "event" },
        ];
  const result = await retireFormerSeries(
    {},
    { slug: "jazz-nights", formerSlugs: ["jazz"] },
    new Set(["event-jazz-2026-10-06"]),
    { query, mutate: async (_env, mutations) => sent.push(...mutations) },
  );
  assert.deepEqual(result, { changed: true, warnings: [] });
  assert.deepEqual(sent, [
    {
      patch: {
        id: "event-jazz-2026-09-01",
        set: { seriesId: "jazz-nights", series: { _type: "reference", _ref: "series-jazz-nights" } },
      },
    },
    { patch: { id: "series-jazz", set: { removed: true } } },
  ]);
});

test("no former web address: nothing to retire", async () => {
  const result = await retireFormerSeries({}, { slug: "jazz" }, new Set(), {
    query: async () => assert.fail("no query"),
    mutate: async () => assert.fail("no mutation"),
  });
  assert.deepEqual(result, { changed: false, warnings: [] });
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
