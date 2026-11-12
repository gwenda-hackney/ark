/**
 * What the menu relies on from events (popups.js): the pop-up kitchens a
 * menu can belong to, when each one cooks (a menu for it starts from those
 * dates and days, #305), and the Sanity document each one's section refers
 * to. The menu (menu-store.js, menus.js, publish-sync.js and the menus
 * migration) uses nothing else of events, so a change here that breaks the
 * menu fails in events' own tests.
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

const TODAY = "2026-11-12";

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

      const popups = await listPopupSeries({ eventRepository }, { today: TODAY });
      assert.deepEqual(popups, [
        {
          id: String(pickle.id),
          name: "Chez Pickle",
          slug: "chez-pickle",
          sanityId: "series-chez-pickle",
          startsOn: "",
          endsOn: "",
          days: [],
        },
        { id: String(zed.id), name: "Zed's Tacos", slug: "zeds", sanityId: "series-zeds", startsOn: "", endsOn: "", days: [] },
      ]);
      // The document publishing writes for the series is the one the menu's section refers to.
      assert.equal(sanitySeriesDocument({ slug: popups[0].slug, title: popups[0].name })._id, popups[0].sanityId);
    });

    it("says when each cooks: its first and last nights, and its weekdays, Monday first", async () => {
      const eventRepository = make();
      await eventRepository.create({
        name: "Chez Pickle",
        category: "popup",
        startsOn: "2026-11-12",
        endsOn: "2026-11-28",
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["sat", "thu", "fri"],
      });
      const [run] = await listPopupSeries({ eventRepository }, { today: TODAY });
      assert.deepEqual(
        { startsOn: run.startsOn, endsOn: run.endsOn, days: run.days },
        { startsOn: "2026-11-12", endsOn: "2026-11-28", days: ["thu", "fri", "sat"] },
      );
    });

    it("a run with no end date has no last night; nights added by hand count too", async () => {
      const eventRepository = make();
      await eventRepository.create({
        name: "Rolling Tacos",
        category: "popup",
        startsOn: "2026-11-13",
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["fri"],
      });
      await eventRepository.create({
        name: "Supper Club",
        category: "popup",
        startsOn: "2026-11-19",
        repeatUnit: "none",
        extraDates: ["2026-11-21"],
      });
      const [rolling, supper] = await listPopupSeries({ eventRepository }, { today: TODAY });
      assert.deepEqual(
        { name: rolling.name, startsOn: rolling.startsOn, endsOn: rolling.endsOn, days: rolling.days },
        { name: "Rolling Tacos", startsOn: "2026-11-13", endsOn: "", days: ["fri"] },
      );
      assert.deepEqual(
        { name: supper.name, startsOn: supper.startsOn, endsOn: supper.endsOn, days: supper.days },
        { name: "Supper Club", startsOn: "2026-11-19", endsOn: "2026-11-21", days: ["thu", "sat"] },
      );
    });

    it("is empty when there are none", async () => {
      assert.deepEqual(await listPopupSeries({ eventRepository: make() }), []);
    });
  });
}
