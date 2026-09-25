import assert from "node:assert/strict";
import test from "node:test";
import {
  DEV_SANITY_PROJECT_ID,
  REAL_SANITY_PROJECT_ID,
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
