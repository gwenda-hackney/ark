/**
 * Contract tests for a repository (#186, #194): every adapter (memory,
 * Baserow, D1, …) must pass the same cases, so switching adapters is proved
 * by the tests rather than hoped for. Each feature supplies its adapters and
 * cases; the copy round trip (exportAll → importAll) is shared.
 *
 *   repositoryContract("EventRepository", {
 *     adapters: { memory: () => memoryEvents(), d1: () => d1Events(createTestD1("ops")) },
 *     seed: async (repo) => { await repo.create({ title: "Jazz" }); },
 *     cases: {
 *       "every field round-trips": async (repo) => { … },
 *     },
 *   });
 *
 * An adapter factory may return a promise. `exportAll` (every record, ids
 * kept) is required of every adapter; `importAll` (replace everything) only of
 * adapters a copy can write to: the copy runs from each adapter into each
 * adapter that has it.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";

/**
 * Seed `source`, copy it into `target`, and check nothing changed on the way.
 * @returns {Promise<{ snapshot: unknown, copied: unknown }>}
 */
export async function copyRoundTrip(source, target, seed) {
  await seed(source);
  const snapshot = await source.exportAll();
  await target.importAll(snapshot);
  const copied = await target.exportAll();
  assert.deepEqual(
    copied,
    snapshot,
    "importAll(exportAll()) changed the records",
  );
  return { snapshot, copied };
}

/**
 * @param {string} name
 * @param {{ adapters: Record<string, () => any>, cases?: Record<string, (repo: any) => Promise<void>>,
 *   seed?: (repo: any) => Promise<void> }} contract
 */
export function repositoryContract(name, { adapters, cases = {}, seed }) {
  const entries = Object.entries(adapters);
  if (!entries.length) throw new Error(`${name}: no adapters to test.`);

  for (const [adapterName, make] of entries) {
    describe(`${name} (${adapterName})`, () => {
      for (const [title, run] of Object.entries(cases)) {
        it(title, async () => run(await make()));
      }
      it("can export every record", async () => {
        const repo = await make();
        assert.equal(
          typeof repo.exportAll,
          "function",
          `${adapterName} has no exportAll()`,
        );
      });
    });
  }

  if (!seed) return;
  describe(`${name}: copy between adapters`, () => {
    for (const [fromName, makeSource] of entries) {
      for (const [toName, makeTarget] of entries) {
        it(`${fromName} → ${toName} keeps every record`, async (context) => {
          const target = await makeTarget();
          if (typeof target.importAll !== "function") return context.skip();
          await copyRoundTrip(await makeSource(), target, seed);
        });
      }
    }
  });
}
