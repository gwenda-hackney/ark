import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNotLocal,
  draftMutations,
  isLocalOps,
  sanityMutateProduction,
  weakenReferences,
} from "./sanity.js";

const LOCAL = { SITE_ENV: "local", SANITY_API_TOKEN: "t" };

test("only SITE_ENV=local counts as local ops", () => {
  assert.equal(isLocalOps(LOCAL), true);
  assert.equal(isLocalOps({ SITE_ENV: "staging" }), false);
  assert.equal(isLocalOps({}), false);
});

test("local ops cannot write production", async () => {
  assert.throws(() => assertNotLocal(LOCAL), (error) => error.status === 403);
  await assert.rejects(
    sanityMutateProduction(LOCAL, [{ delete: { id: "x" } }]),
    (error) => error.status === 403,
  );
});

test("createOrReplace becomes a draft with weak document refs, asset refs untouched", async () => {
  const [mutation] = await draftMutations(LOCAL, "staging", [
    {
      createOrReplace: {
        _id: "event-a",
        _type: "event",
        _rev: "r1",
        series: { _type: "reference", _ref: "series-a" },
        heroImage: { asset: { _type: "reference", _ref: "image-abc-10x10-jpg" } },
      },
    },
  ]);
  const doc = mutation.createOrReplace;
  assert.equal(doc._id, "drafts.event-a");
  assert.equal(doc._rev, undefined);
  assert.equal(doc.series._weak, true);
  assert.equal(doc.heroImage.asset._weak, undefined);
});

test("a patch seeds the draft from the published document first", async () => {
  const query = async (_env, _dataset, _q, { ids }) => {
    assert.deepEqual(ids, ["item-1", "drafts.item-1"]);
    return [{ _id: "item-1", _type: "menuItem", _rev: "r", name: "Negroni" }];
  };
  const out = await draftMutations(
    LOCAL,
    "staging",
    [{ patch: { id: "item-1", set: { price: 9 } } }],
    query,
  );
  assert.deepEqual(out, [
    { createIfNotExists: { _id: "drafts.item-1", _type: "menuItem", name: "Negroni" } },
    { patch: { id: "drafts.item-1", set: { price: 9 } } },
  ]);
});

test("a patch on an existing draft does not reseed it; unknown ids are skipped", async () => {
  const query = async () => [{ _id: "drafts.item-1", _type: "menuItem" }];
  const out = await draftMutations(
    LOCAL,
    "staging",
    [
      { patch: { id: "item-1", unset: ["photo"] } },
      { patch: { id: "gone", set: { a: 1 } } },
    ],
    query,
  );
  assert.deepEqual(out, [{ patch: { id: "drafts.item-1", unset: ["photo"] } }]);
});

test("deletes only drop the local draft; creates get a draft id", async () => {
  const out = await draftMutations(LOCAL, "staging", [
    { delete: { id: "event-a" } },
    { create: { _type: "menuSection", title: "Wine" } },
  ]);
  assert.deepEqual(out[0], { delete: { id: "drafts.event-a" } });
  assert.match(out[1].create._id, /^drafts\./);
});

test("weakenReferences leaves plain values alone", () => {
  assert.deepEqual(weakenReferences({ a: [1, "x", null] }), { a: [1, "x", null] });
});
