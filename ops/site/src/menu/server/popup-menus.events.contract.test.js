/**
 * What Events relies on from the menu (popup-menus.js, #305): a pop-up
 * kitchen's editor lists its menus, each with its name, days and status and
 * an Open menu link to its id. Events use nothing else of the menu, so a
 * change here that breaks them fails in the menu's own tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1MenuRepository } from "./adapters/d1-menu.js";
import { memoryMenuRepository } from "./adapters/memory-menu.js";
import { menusForPopup } from "./popup-menus.js";

const ADAPTERS = {
  memory: () => memoryMenuRepository(),
  d1: () => d1MenuRepository(createTestD1("ops")),
};

const TODAY = "2026-11-12";

for (const [name, make] of Object.entries(ADAPTERS)) {
  describe(`a pop-up kitchen's menus for Events (${name})`, () => {
    it("lists the pop-up's menus in the menus' order, ids as text, with their days, dates and status", async () => {
      const menuRepository = make();
      await menuRepository.create("menus", { name: "Drinks", kind: "bar", order: 1 });
      const brunch = await menuRepository.create("menus", {
        name: "Brunch",
        kind: "kitchen",
        startsOn: "2026-11-14",
        endsOn: "2026-11-28",
        days: "sat",
        popupSeriesId: 7,
        order: 3,
      });
      const dinner = await menuRepository.create("menus", {
        name: "Chez Pickle",
        kind: "kitchen",
        startsOn: "2026-11-12",
        endsOn: "2026-11-28",
        days: "thu,fri,sat",
        popupSeriesId: 7,
        order: 2,
      });
      await menuRepository.create("menus", { name: "Zed's Tacos", kind: "kitchen", popupSeriesId: 8, order: 4 });

      assert.deepEqual(await menusForPopup({ menuRepository }, "7", { today: TODAY }), [
        {
          id: String(dinner.id),
          name: "Chez Pickle",
          kind: "kitchen",
          startsOn: "2026-11-12",
          endsOn: "2026-11-28",
          days: ["thu", "fri", "sat"],
          daysLabel: "Thu–Sat",
          datesLabel: "12–28 Nov",
          status: "on",
          statusLabel: "On now",
        },
        {
          id: String(brunch.id),
          name: "Brunch",
          kind: "kitchen",
          startsOn: "2026-11-14",
          endsOn: "2026-11-28",
          days: ["sat"],
          daysLabel: "Sat",
          datesLabel: "14–28 Nov",
          status: "coming",
          statusLabel: "Coming up",
        },
      ]);
    });

    it("an ongoing menu every day, and one that has ended", async () => {
      const menuRepository = make();
      await menuRepository.create("menus", { name: "Always", kind: "kitchen", popupSeriesId: 7 });
      await menuRepository.create("menus", { name: "Last month", kind: "kitchen", endsOn: "2026-10-31", popupSeriesId: 7 });
      const menus = await menusForPopup({ menuRepository }, 7, { today: TODAY });
      assert.deepEqual(
        menus.map(({ name, days, daysLabel, datesLabel, status }) => ({ name, days, daysLabel, datesLabel, status })),
        [
          { name: "Always", days: [], daysLabel: "Every day", datesLabel: "ongoing", status: "on" },
          { name: "Last month", days: [], daysLabel: "Every day", datesLabel: "until 31 Oct", status: "ended" },
        ],
      );
    });

    it("is empty for a pop-up with no menus, or no pop-up at all", async () => {
      const menuRepository = make();
      await menuRepository.create("menus", { name: "Drinks", kind: "bar" });
      assert.deepEqual(await menusForPopup({ menuRepository }, "7", { today: TODAY }), []);
      assert.deepEqual(await menusForPopup({ menuRepository }, "", { today: TODAY }), []);
    });
  });
}
