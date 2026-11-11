/**
 * What the menu relies on from events (popups.js): the pop-up kitchens a
 * food chapter can belong to, and the Sanity document each one's section
 * refers to. The menu (menu-store.js, publish-sync.js) uses nothing else of
 * events, so a change here that breaks the menu fails in events' own tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1EventRepository } from "./adapters/d1-events.js";
import { memoryEventRepository } from "./adapters/memory-events.js";
import { sanitySeriesDocument } from "./event-content.js";
import { listPopupSeries } from "./popups.js";

const ADAPTERS = {
  memory: () => memoryEventRepository(),
  d1: () => d1EventRepository(createTestD1("ops")),
};

for (const [name, make] of Object.entries(ADAPTERS)) {
  describe(`pop-up kitchens for the menu (${name})`, () => {
    it("lists the series marked as pop-up kitchens, by name, with ids as text and their Sanity document", async () => {
      const eventRepository = make();
      await eventRepository.create({ name: "Jazz Night" });
      await eventRepository.create({ name: "Happy Hour", category: "promotion" });
      const zed = await eventRepository.create({ name: "Zed's Tacos", slug: "zeds", category: "popup" });
      const pickle = await eventRepository.create({ name: "Chez Pickle", category: "popup" });
      const gone = await eventRepository.create({ name: "Old Pop-up", category: "popup" });
      await eventRepository.update(gone.id, { deletedAt: "2026-11-01T10:00:00Z" });

      const popups = await listPopupSeries({ eventRepository });
      assert.deepEqual(popups, [
        { id: String(pickle.id), name: "Chez Pickle", slug: "chez-pickle", sanityId: "series-chez-pickle" },
        { id: String(zed.id), name: "Zed's Tacos", slug: "zeds", sanityId: "series-zeds" },
      ]);
      // The document publishing writes for the series is the one the menu's section refers to.
      assert.equal(sanitySeriesDocument({ slug: popups[0].slug, title: popups[0].name })._id, popups[0].sanityId);
    });

    it("is empty when there are none", async () => {
      assert.deepEqual(await listPopupSeries({ eventRepository: make() }), []);
    });
  });
}
