/**
 * migrations/2026-11-12-menus.mjs, run as a deploy runs it against a D1
 * with the real schema, on the menu as dev and production have it: six
 * drinks chapters and Chez Pickle's food chapter, which belongs to the Chez
 * Pickle pop-up kitchen. A dry run, for real, again (nothing left to do), a
 * run that stopped halfway, a food chapter with no pop-up kitchen, and a
 * menu in the way.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { loadMenuTree } from "../../ops/site/src/menu/server/menu-store.js";
import { listMenus } from "../../ops/site/src/menu/server/menus.js";
import { menusForPopup } from "../../ops/site/src/menu/server/popup-menus.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as menus from "../../migrations/2026-11-12-menus.mjs";

const TODAY = "2026-11-12";

/** The menu as dev has it, and Chez Pickle cooking on Thursdays until the 26th. */
async function seed(db, { popup = true } = {}) {
  const events = d1EventRepository(db);
  const pickle = await events.create({
    name: "Chez Pickle",
    category: popup ? "popup" : "event",
    startsOn: "2026-11-12",
    endsOn: "2026-11-26",
    repeatUnit: "week",
    repeatEvery: 1,
    weekdays: ["thu"],
  });
  const chapter = (id, name, slug, order) => ({ id, name, slug, order, kind: "bar", sanityId: `sanity-${slug}` });
  await d1MenuRepository(db).importAll({
    menu_sections: [
      chapter(65, "Our Cocktails", "our-formulas", 1),
      chapter(67, "The Classics", "by-the-book", 2),
      { id: 68, name: "Spritz", slug: "spritz", order: 3, parentId: 67, sanityId: "sanity-spritz" },
      chapter(80, "Beer", "beer", 4),
      chapter(73, "Spirits", "the-cabinet", 5),
      chapter(66, "No Booze", "free-of-spirit", 6),
      chapter(79, "Soft Drinks", "soft-drinks", 7),
      {
        id: 90,
        name: "Chez Pickle",
        slug: "chez-pickle",
        order: 8,
        kind: "kitchen",
        popupSeriesId: Number(pickle.id),
        sanityId: "sanity-chez-pickle",
      },
      { id: 91, name: "Burgers", slug: "burgers", order: 9, parentId: 90 },
    ],
    menu_items: [
      { id: 300, name: "Aperol Spritz", sectionId: 68, price: "9" },
      { id: 301, name: "OG Burger", sectionId: 91, price: "14" },
      { id: 302, name: "Liberty Burger", sectionId: 91, price: "15.50" },
    ],
    menu_placements: [
      { id: 1, itemId: 300, channel: "digital", sectionId: 68 },
      { id: 2, itemId: 301, channel: "digital", sectionId: 91 },
      { id: 3, itemId: 302, channel: "digital", sectionId: 91 },
    ],
  });
  return { pickle };
}

const opsEnv = (db) => ({ menuRepository: d1MenuRepository(db), eventRepository: d1EventRepository(db) });

async function run(db, { dryRun = false } = {}) {
  const lines = [];
  const result = await menus.up({ env: "dev", d1: () => db, processEnv: {}, dryRun, log: (line) => lines.push(line) });
  return { lines, text: lines.join("\n"), result };
}

/** What the website gets of each chapter: the same before and after. */
async function chapters(db) {
  const { sections } = await loadMenuTree(opsEnv(db));
  return sections.map(({ slug, title, kind, popupSeriesId, orderRank, sanityId }) => ({
    slug,
    title,
    kind,
    popupSeriesId,
    orderRank,
    sanityId,
  }));
}

const dump = async (db) => JSON.stringify(await d1MenuRepository(db).exportAll());

describe("2026-11-12-menus", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${TODAY}T12:00:00Z`) }));
  afterEach(() => vi.useRealTimers());

  it("a dry run changes nothing, and says what it would do", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await dump(db);
    const { text, result } = await run(db, { dryRun: true });
    assert.deepEqual(result, { made: 2, moved: 7 });
    assert.equal(await dump(db), before);
    assert.match(text, /Dry run: working on a copy/);
    assert.match(text, /would make the menu "Drinks" \(menu \d+\): Drinks, ongoing, every day/);
    assert.match(text, /would make the menu "Chez Pickle" \(menu \d+\): Food, 12–26 Nov, Thu, Chez Pickle's/);
    assert.match(text, /"Soft Drinks" \(section 79\) would go on Drinks/);
    assert.match(text, /"Chez Pickle" \(section 90\) would go on Chez Pickle/);
    assert.match(text, /7 chapters would go on 2 new menus/);
  });

  it("for real: Drinks holds the drinks chapters, Chez Pickle's food is its own menu; the website gets the same", async () => {
    const db = createTestD1("ops");
    const { pickle } = await seed(db);
    const before = await chapters(db);

    const { result, text } = await run(db);
    assert.deepEqual(result, { made: 2, moved: 7 }, text);
    const env = opsEnv(db);
    const { menus: listed } = await listMenus(env, { today: TODAY });
    assert.deepEqual(
      listed.map((menu) => [menu.name, menu.kind, menu.datesLabel, menu.daysLabel, menu.popupName, menu.chapterCount, menu.itemCount, menu.statusLabel]),
      [
        ["Drinks", "bar", "ongoing", "Every day", "", 6, 1, "On now"],
        ["Chez Pickle", "kitchen", "12–26 Nov", "Thu", "Chez Pickle", 1, 2, "On now"],
      ],
    );
    assert.deepEqual(
      (await menusForPopup(env, pickle.id, { today: TODAY })).map((menu) => `${menu.name} · ${menu.daysLabel}`),
      ["Chez Pickle · Thu"],
      "and Events sees it",
    );
    assert.deepEqual(await chapters(db), before, "each chapter keeps its drinks or food, pop-up kitchen, order and Sanity link");
  });

  it("does nothing the second time", async () => {
    const db = createTestD1("ops");
    await seed(db);
    await run(db);
    const before = await dump(db);
    const { text, result } = await run(db);
    assert.deepEqual(result, { made: 0, moved: 0 });
    assert.equal(await dump(db), before);
    assert.match(text, /Nothing to do: every chapter is on a menu/);
  });

  it("finishes a run that stopped halfway, without making a menu twice", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const repo = d1MenuRepository(db);
    const drinks = await repo.create("menus", { name: "Drinks", slug: "drinks", kind: "bar", order: 1 });
    await repo.update("menu_sections", 65, { menuId: drinks.id });
    const { result, text } = await run(db);
    assert.deepEqual(result, { made: 1, moved: 6 }, text);
    assert.match(text, /using the menu "Drinks" \(menu \d+\) that is already there/);
    assert.equal((await repo.list("menus")).length, 2);
    assert.equal((await repo.list("menu_sections", { menuId: drinks.id })).length, 6);
  });

  it("a food chapter of no pop-up kitchen gets a Food menu of its own, ongoing and every day", async () => {
    const db = createTestD1("ops");
    await seed(db, { popup: false });
    const { text } = await run(db);
    assert.match(text, /note: "Chez Pickle" \(section 90\) belonged to a pop-up kitchen that is gone from Events/);
    const { menus: listed } = await listMenus(opsEnv(db), { today: TODAY });
    const food = listed.find((menu) => menu.kind === "kitchen");
    assert.deepEqual([food.name, food.datesLabel, food.daysLabel, food.popupSeriesId], ["Chez Pickle", "ongoing", "Every day", null]);
  });

  it("stops, saying what to do, when a Food menu has the web address Drinks needs", async () => {
    const db = createTestD1("ops");
    await seed(db);
    await d1MenuRepository(db).create("menus", { name: "Drinks", slug: "drinks", kind: "kitchen" });
    await assert.rejects(() => run(db), /already a Food menu called "Drinks" \(\/drinks\).*Rename that menu in ops/s);
  });
});
