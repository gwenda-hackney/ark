/**
 * What every OccasionRepository adapter must do (#353): the same cases run in
 * memory and on D1 (SQLite with the real migrations), plus the copy between
 * them.
 */
import assert from "node:assert/strict";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { assertValidOccasion } from "../occasion-model.js";
import { d1OccasionRepository } from "./adapters/d1-occasions.js";
import { memoryOccasionRepository } from "./adapters/memory-occasions.js";

const christmas = (overrides = {}) => ({
  ...assertValidOccasion({
    name: "Christmas parties",
    line: "Book the back room for your work do.",
    included: "Welcome drink\nCanapés",
    covers: "Throughout December",
    showFrom: "2026-11-01",
    showUntil: "2026-12-20",
    image: { asset: "image-abc-1200x800-jpg", alt: "The back room" },
    ...overrides,
  }),
  updatedAt: "2026-11-19T09:00:00.000Z",
  updatedBy: "owner@gwenda.co.uk",
});

repositoryContract("OccasionRepository", {
  adapters: {
    memory: () => memoryOccasionRepository(),
    d1: () => d1OccasionRepository(createTestD1("ops")),
  },
  seed: async (repo) => {
    await repo.create(christmas());
    await repo.create(christmas({ name: "Summer terrace", image: null, showFrom: "2027-05-01", showUntil: "2027-08-31" }));
  },
  cases: {
    "has none until one is added": async (repo) => {
      assert.deepEqual(await repo.list(), []);
      assert.equal(await repo.get(1), null);
    },
    "keeps every field, the picture too": async (repo) => {
      const made = await repo.create(christmas());
      assert.deepEqual(await repo.get(made.id), { id: made.id, ...christmas() });
      assert.deepEqual(await repo.list(), [{ id: made.id, ...christmas() }]);
    },
    "replaces one whole, the picture gone when it's taken off": async (repo) => {
      const made = await repo.create(christmas());
      const changed = await repo.update(made.id, christmas({ line: "Now with a DJ.", image: null }));
      assert.equal(changed.line, "Now with a DJ.");
      assert.equal(changed.image, null);
      assert.equal(await repo.update(999, christmas()), null);
    },
    "takes one out, and taking out what isn't there changes nothing": async (repo) => {
      const first = await repo.create(christmas());
      const second = await repo.create(christmas({ name: "Summer terrace" }));
      await repo.remove(first.id);
      await repo.remove(999);
      assert.deepEqual((await repo.list()).map((item) => item.id), [second.id]);
    },
  },
});
