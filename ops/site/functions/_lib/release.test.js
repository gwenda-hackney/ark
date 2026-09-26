import test from "node:test";
import assert from "node:assert/strict";
import {
  collectRefs,
  computeReleaseDiff,
  planRelease,
  publishRelease,
  summarizeValue,
} from "./release.js";

const series = (extra = {}) => ({
  _id: "series-nights",
  _type: "eventSeries",
  _rev: "a",
  _updatedAt: "2026-09-01",
  title: "Gwenda Nights",
  ...extra,
});
const night = (date, extra = {}) => ({
  _id: `event-nights-${date}`,
  _type: "event",
  _rev: "b",
  title: "Gwenda Nights",
  date,
  series: { _type: "reference", _ref: "series-nights" },
  heroImage: { asset: { _type: "reference", _ref: "image-abc123-10x10-jpg" } },
  ...extra,
});

test("revisions and timestamps alone are not a change", () => {
  const entries = computeReleaseDiff(
    [series({ _rev: "x", _updatedAt: "2026-09-20" })],
    [series()],
  );
  assert.deepEqual(entries, []);
});

test("added, changed and removed documents, grouped series first", () => {
  const entries = computeReleaseDiff(
    [series({ title: "Gwenda Saturdays" }), night("2026-10-03")],
    [series(), night("2026-09-26")],
  );
  assert.deepEqual(
    entries.map((entry) => [entry.type, entry.change]),
    [
      ["eventSeries", "changed"],
      ["event", "removed"],
      ["event", "added"],
    ],
  );
  const title = entries[0].fields.find((field) => field.key === "title");
  assert.equal(title.preview, "Gwenda Saturdays");
  assert.equal(title.production, "Gwenda Nights");
  assert.equal(entries[2].label, "Gwenda Nights · 2026-10-03");
});

test("choosing a night brings its changed series along, written first", () => {
  const entries = computeReleaseDiff(
    [series({ title: "New" }), night("2026-10-03")],
    [series()],
  );
  const plan = planRelease(entries, ["event-nights-2026-10-03"]);
  assert.deepEqual(plan.writes, ["series-nights", "event-nights-2026-10-03"]);
  assert.deepEqual(plan.included, ["series-nights"]);
  assert.deepEqual(plan.deletes, []);
});

test("unknown ids are ignored and removals are deletes", () => {
  const entries = computeReleaseDiff([], [night("2026-09-26")]);
  const plan = planRelease(entries, ["event-nights-2026-09-26", "nope"]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.deletes, ["event-nights-2026-09-26"]);
});

test("collectRefs separates assets from documents", () => {
  const refs = collectRefs(night("2026-10-03"));
  assert.deepEqual([...refs.docs], ["series-nights"]);
  assert.deepEqual([...refs.assets], ["image-abc123-10x10-jpg"]);
});

test("summaries read like the site: text for blocks, short image ids", () => {
  assert.equal(
    summarizeValue([{ _type: "block", children: [{ text: "Doors " }, { text: "at 8" }] }]),
    "Doors at 8",
  );
  assert.equal(summarizeValue({ asset: { _ref: "image-abc12345xyz-10x10-jpg" } }), "Image abc12345");
  assert.equal(summarizeValue(""), "—");
});

test("publishing writes each draft over its document and drops the draft, and refuses local", async () => {
  // The preview view hands back drafts under their documents' own ids.
  const preview = [series(), night("2026-10-03", { _originalId: "drafts.event-nights-2026-10-03" })];
  const production = [series()];
  const batches = [];
  const query = async (_env, view) => (view === "production" ? production : preview);
  const result = await publishRelease(
    { SITE_ENV: "production" },
    {},
    { query, mutate: async (_env, batch) => batches.push(batch) },
  );
  assert.equal(batches.length, 1);
  const [write, drop] = batches[0];
  assert.equal(write.createOrReplace._id, "event-nights-2026-10-03");
  assert.equal(write.createOrReplace._rev, undefined);
  assert.equal(write.createOrReplace._originalId, undefined);
  assert.deepEqual(drop, { delete: { id: "drafts.event-nights-2026-10-03" } });
  assert.deepEqual(result.written, ["event-nights-2026-10-03"]);

  await assert.rejects(
    publishRelease({ SITE_ENV: "local" }, {}, { query }),
    (error) => error.status === 403,
  );
});

test("discard drops the chosen drafts and leaves the website alone", async () => {
  const preview = [series({ title: "Edited" }), night("2026-10-03")];
  const production = [series()];
  const writes = [];
  const query = async (_env, view) => (view === "production" ? production : preview);
  const deps = { query, mutate: async (_env, batch) => writes.push(...batch) };
  const result = await publishRelease({ SITE_ENV: "production" }, { direction: "discard", ids: ["series-nights"] }, deps);
  assert.deepEqual(writes, [{ delete: { id: "drafts.series-nights" } }]);
  assert.deepEqual(result.discarded, ["series-nights"]);
  await assert.rejects(
    publishRelease({ SITE_ENV: "production" }, { direction: "to-preview" }, deps),
    (error) => error.status === 400,
  );
});

test("publish all reports every source document as in sync; a selection does not", async () => {
  const docs = [series(), night("2026-10-03")];
  const query = async () => docs;
  const deps = { query, mutate: async () => {} };
  const all = await publishRelease({ SITE_ENV: "production" }, {}, deps);
  assert.deepEqual(all.inSync, ["series-nights", "event-nights-2026-10-03"]);
  assert.deepEqual(all.written, []);
  const some = await publishRelease({ SITE_ENV: "production" }, { ids: ["series-nights"] }, deps);
  assert.equal(some.inSync, null);
});
