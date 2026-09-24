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
  assert.equal(title.staging, "Gwenda Saturdays");
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

test("publishRelease copies missing assets, writes, then deletes, and refuses local", async () => {
  const staging = [series(), night("2026-10-03")];
  const production = [series(), night("2026-09-26")];
  const mutations = [];
  const uploads = [];
  const query = async (_env, dataset, q, params) => {
    if (q.startsWith("*[_id in $ids]._id")) return [];
    if (q.startsWith("*[_id in $ids]{")) {
      return params.ids.map((id) => ({ _id: id, url: `https://cdn/${id}`, mimeType: "image/jpeg" }));
    }
    return dataset === "production" ? production : staging;
  };
  const result = await publishRelease(
    { SITE_ENV: "production" },
    {},
    {
      query,
      mutate: async (_env, batch) => mutations.push(...batch),
      upload: async (_env, kind, _bytes, meta) => {
        uploads.push([kind, meta.contentType]);
        return { _id: "image-abc123-10x10-jpg" };
      },
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3])),
    },
  );
  assert.deepEqual(uploads, [["images", "image/jpeg"]]);
  assert.equal(mutations[0].createOrReplace._id, "event-nights-2026-10-03");
  assert.equal(mutations[0].createOrReplace._rev, undefined);
  assert.deepEqual(mutations[1], { delete: { id: "event-nights-2026-09-26" } });
  assert.deepEqual(result.deleted, ["event-nights-2026-09-26"]);

  await assert.rejects(
    publishRelease({ SITE_ENV: "local" }, {}, { query }),
    (error) => error.status === 403,
  );
});
