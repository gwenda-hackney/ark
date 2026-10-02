import assert from "node:assert/strict";
import { test } from "vitest";
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../../../../shared/sanity-projects.js";
import {
  assertSanityWritable,
  draftMutations,
  sanityMutate,
  sanityQuery,
} from "./sanity.js";

const local = (projectId) => ({ SITE_ENV: "local", SANITY_PROJECT_ID: projectId });

test("local ops writes and updates the website only in the Gwenda Dev project", () => {
  assert.doesNotThrow(() => assertSanityWritable(local(DEV_SANITY_PROJECT_ID)));

  assert.throws(() => assertSanityWritable(local(REAL_SANITY_PROJECT_ID)), { status: 403 });
  // No project set means the real default: refused.
  assert.throws(() => assertSanityWritable({ SITE_ENV: "local" }), { status: 403 });
});

test("hosted ops writes the real project", () => {
  const hosted = { SITE_ENV: "production", SANITY_PROJECT_ID: REAL_SANITY_PROJECT_ID };
  assert.doesNotThrow(() => assertSanityWritable(hosted));
});

test("ops writes become draft writes; a removal takes both copies", () => {
  const out = draftMutations(
    [
      { createOrReplace: { _id: "event-a", _type: "event", title: "A" } },
      { create: { _type: "menuItem", name: "Negroni" } },
      { patch: { id: "menu-b", set: { name: "B" } } },
      { patch: { id: "menu-c", set: { name: "C" } } },
      { delete: { id: "event-d" } },
    ],
    [
      { _id: "menu-b", _type: "menuItem", _rev: "r1", _updatedAt: "t", name: "Old B" },
      { _id: "menu-c", _type: "menuItem", name: "Old C" },
      { _id: "drafts.menu-c", _type: "menuItem", name: "Draft C" },
    ],
    () => "new-id",
  );
  assert.deepEqual(out, [
    { createOrReplace: { _id: "drafts.event-a", _type: "event", title: "A" } },
    { create: { _id: "drafts.new-id", _type: "menuItem", name: "Negroni" } },
    // No draft yet: start one from the published document, without its revision.
    { createIfNotExists: { _id: "drafts.menu-b", _type: "menuItem", name: "Old B" } },
    { patch: { id: "drafts.menu-b", set: { name: "B" } } },
    { patch: { id: "drafts.menu-c", set: { name: "C" } } },
    { delete: { id: "drafts.event-d" } },
    { delete: { id: "event-d" } },
  ]);
  assert.throws(() => draftMutations([{ publish: {} }]), { status: 500 });
});

test("draft references are weak until publish, so a new series can be referenced", () => {
  const out = draftMutations([
    { createOrReplace: { _id: "series-new", _type: "eventSeries", title: "New" } },
    {
      createOrReplace: {
        _id: "event-new-2026-10-01",
        _type: "event",
        series: { _type: "reference", _ref: "series-new" },
        heroImage: { _type: "image", asset: { _type: "reference", _ref: "image-abc-10x10-jpg" } },
      },
    },
    { patch: { id: "section-b", set: { parent: { _type: "reference", _ref: "section-a" } } } },
  ]);
  const event = out[1].createOrReplace;
  assert.equal(event._id, "drafts.event-new-2026-10-01");
  assert.deepEqual(event.series, {
    _type: "reference",
    _ref: "series-new",
    _weak: true,
    _strengthenOnPublish: { type: "eventSeries" },
  });
  // Images are assets, which have no drafts: their references stay strong.
  assert.deepEqual(event.heroImage.asset, { _type: "reference", _ref: "image-abc-10x10-jpg" });
  assert.deepEqual(out[2].patch.set.parent, {
    _type: "reference",
    _ref: "section-a",
    _weak: true,
    _strengthenOnPublish: {},
  });
});

test("sanityMutate reports the documents' own ids, not their drafts", async () => {
  const hosted = { SITE_ENV: "production", SANITY_PROJECT_ID: REAL_SANITY_PROJECT_ID };
  let sent;
  const result = await sanityMutate(hosted, [{ create: { _type: "menuItem" } }], {
    query: async () => [],
    send: async (_env, mutations) => {
      sent = mutations;
      return { results: [{ id: mutations[0].create._id, operation: "create" }] };
    },
  });
  assert.match(sent[0].create._id, /^drafts\./);
  assert.equal(result.results[0].id, sent[0].create._id.slice("drafts.".length));
});

test("ops reads only the preview, the website or raw", async () => {
  await assert.rejects(sanityQuery({}, "staging", "*"), { status: 500 });
});
