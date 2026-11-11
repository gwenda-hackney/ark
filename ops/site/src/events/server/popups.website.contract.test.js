/**
 * What the website's scheduler relies on from events (popups.js): each
 * pop-up kitchen's last night, so it can rebuild the site the morning after
 * one ends (website/server/site-pending.js). It uses nothing else of events,
 * so a change here that breaks it fails in events' own tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1EventRepository } from "./adapters/d1-events.js";
import { memoryEventRepository } from "./adapters/memory-events.js";
import { popupLastNights } from "./popups.js";

const ADAPTERS = {
  memory: () => memoryEventRepository(),
  d1: () => d1EventRepository(createTestD1("ops")),
};

async function series(eventRepository, fields, dates = []) {
  const event = await eventRepository.create(fields);
  await eventRepository.saveNights(
    event.id,
    dates.map((date) => ({ date })),
  );
  return event;
}

for (const [name, make] of Object.entries(ADAPTERS)) {
  describe(`pop-up kitchens' last nights for the website (${name})`, () => {
    it("gives each pop-up kitchen with nights its last one, with its id as text and its name", async () => {
      const eventRepository = make();
      // Nights saved out of order: the last is the latest date, not the last saved.
      const pickle = await series(eventRepository, { name: " Chez Pickle ", category: "popup" }, [
        "2026-11-10",
        "2026-11-08",
        "2026-11-09",
      ]);
      const zed = await series(eventRepository, { name: "Zed's Tacos", category: "popup" }, ["2026-12-01"]);
      // Not pop-ups: a night series and a promotion.
      await series(eventRepository, { name: "Jazz Night" }, ["2026-11-10"]);
      await series(eventRepository, { name: "Happy Hour", category: "promotion" }, ["2026-11-10"]);
      // A pop-up with no nights yet has no last night.
      await series(eventRepository, { name: "Coming Soon", category: "popup" });
      // A deleted pop-up is not on the way to the website.
      const gone = await series(eventRepository, { name: "Old Pop-up", category: "popup" }, ["2026-11-10"]);
      await eventRepository.update(gone.id, { deletedAt: "2026-11-01T10:00:00Z" });

      const popups = await popupLastNights({ eventRepository });
      assert.deepEqual(
        popups.sort((a, b) => a.name.localeCompare(b.name)),
        [
          { id: String(pickle.id), name: "Chez Pickle", lastNight: "2026-11-10" },
          { id: String(zed.id), name: "Zed's Tacos", lastNight: "2026-12-01" },
        ],
      );
    });

    it("is empty when there are none", async () => {
      assert.deepEqual(await popupLastNights({ eventRepository: make() }), []);
    });
  });
}
