/**
 * Use cases for menus (#305): what the owner does on Menu → Menus, on a
 * menu's page and from a pop-up kitchen in Events, through the real API
 * handlers, with the menu on D1 and Baserow, Sanity and Google faked
 * (testing/fake-world.js). "What the website gets" is the published
 * sections, as /bar and /kitchen read them.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { evaluate, parse } from "groq-js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { MENU_QUERY, MENUS_QUERY } from "../../../../marketing/web/src/lib/sanity/queries.ts";
import { mapFlatSection, mapMenuInfo, nestMenuSections } from "../../../../marketing/web/src/lib/sanity/menu.ts";
import { menuShelf } from "../../../../marketing/web/src/lib/menus.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { onRequestPost as createItem } from "../../functions/api/menu/index.js";
import { onRequestPost as createSection } from "../../functions/api/menu/sections.js";
import { onRequestPatch as editSection } from "../../functions/api/menu/sections/[id].js";
import { onRequestPost as publishMenu } from "../../functions/api/menu/publish.js";
import { onRequestGet as listMenus, onRequestPost as addMenu } from "../../functions/api/menus/index.js";
import {
  onRequestDelete as deleteMenu,
  onRequestGet as openMenu,
  onRequestPatch as editMenu,
} from "../../functions/api/menus/[id].js";
import { onRequestPost as copyMenu } from "../../functions/api/menus/[id]/copy.js";
import { onRequestPost as createEvent } from "../../functions/api/events/index.js";
import { onRequestPost as publishEvent } from "../../functions/api/events/[id]/publish.js";
import { onRequestGet as popupMenus } from "../../functions/api/events/[id]/menus.js";

const TODAY = "2026-11-12";

function owner(world) {
  const ok = (res, status = 200) => {
    assert.equal(res.status, status, JSON.stringify(res.data));
    return res.data;
  };
  const refused = (res, status) => {
    assert.equal(res.status, status, JSON.stringify(res.data));
    return res.data.error;
  };
  return {
    /** Menu → Menus. */
    async menus() {
      return ok(await callApi(world, listMenus, { path: "/api/menus" }));
    },
    async addMenu(body, status = 201) {
      const res = await callApi(world, addMenu, { method: "POST", path: "/api/menus", body });
      return status === 201 ? ok(res, 201).menu : refused(res, status);
    },
    /** A menu's page: the menu and its sections. */
    async open(menu) {
      return ok(await callApi(world, openMenu, { path: `/api/menus/${menu.id}`, params: { id: menu.id } }));
    },
    async editMenu(menu, body, status = 200) {
      const res = await callApi(world, editMenu, {
        method: "PATCH",
        path: `/api/menus/${menu.id}`,
        params: { id: menu.id },
        body,
      });
      return status === 200 ? ok(res).menu : refused(res, status);
    },
    async deleteMenu(menu, status = 200) {
      const res = await callApi(world, deleteMenu, { method: "DELETE", path: `/api/menus/${menu.id}`, params: { id: menu.id } });
      return status === 200 ? ok(res) : refused(res, status);
    },
    /** Copy menu, on a menu's page. */
    async copyMenu(menu, status = 201) {
      const res = await callApi(world, copyMenu, {
        method: "POST",
        path: `/api/menus/${menu.id}/copy`,
        params: { id: menu.id },
      });
      return status === 201 ? ok(res, 201).menu : refused(res, status);
    },
    async section(title, more = {}) {
      return ok(
        await callApi(world, createSection, { method: "POST", path: "/api/menu/sections", body: { title, ...more } }),
        201,
      ).section;
    },
    async editSection(section, body, status = 200) {
      const res = await callApi(world, editSection, {
        method: "PATCH",
        path: `/api/menu/sections/${section._id}`,
        params: { id: section._id },
        body,
      });
      return status === 200 ? ok(res).section : refused(res, status);
    },
    async item(body) {
      return ok(await callApi(world, createItem, { method: "POST", path: "/api/menu", body }), 201).item;
    },
    async series(body) {
      return ok(await callApi(world, createEvent, { method: "POST", path: "/api/events", body }), 201).event;
    },
    async publishSeries(series) {
      return ok(
        await callApi(world, publishEvent, {
          method: "POST",
          path: `/api/events/${series.id}/publish`,
          params: { id: String(series.id) },
          body: {},
        }),
      );
    },
    /** A pop-up kitchen's menus, as its editor in Events shows them. */
    async popupMenus(series) {
      return ok(await callApi(world, popupMenus, { path: `/api/events/${series.id}/menus`, params: { id: String(series.id) } }))
        .menus;
    },
    async updateWebsite() {
      return ok(await callApi(world, publishMenu, { method: "POST", path: "/api/menu/publish" }));
    },
  };
}

/** A published section the website shows, by its address. */
function published(world, slug) {
  return world.sanity.view("published").find((doc) => doc._type === "menuSection" && doc.slug?.current === slug);
}

describe("menus: Menu → Menus, a menu's page, and a pop-up's menus in Events", () => {
  let world;
  let ops;
  let pickle;
  let drinks;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${TODAY}T12:00:00Z`) });
    world = await createFakeWorld();
    world.install();
    Object.assign(world.env, { OPS_DB: createTestD1("ops"), DATA_STORE_MENU: "d1" });
    ops = owner(world);
    pickle = await ops.series({
      name: "Chez Pickle",
      category: "popup",
      description: "Smashed burgers.",
      startsOn: "2026-11-12",
      endsOn: "2026-11-28",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["wed", "thu", "fri", "sat"],
    });
    drinks = await ops.addMenu({ name: "Drinks", kind: "bar" });
  });
  afterEach(() => {
    world.restore();
    vi.useRealTimers();
  });

  it("lists every menu with its type, dates, days, pop-up kitchen, items and status", async () => {
    const food = await ops.addMenu({
      name: "Chez Pickle",
      kind: "kitchen",
      startsOn: "2026-11-12",
      endsOn: "2026-11-30",
      days: ["wed", "thu", "fri", "sat"],
      popupSeriesId: String(pickle.id),
    });
    const formulas = await ops.section("Our Formulas", { menuId: drinks.id });
    const burgers = await ops.section("Burgers", { menuId: food.id });
    const smash = await ops.section("Smash", { parentId: burgers._id });
    await ops.item({ name: "Negroni", price: "11", sectionId: formulas._id });
    await ops.item({ name: "OG Burger", price: "14", sectionId: smash._id, placements: [{ channel: "digital", sectionId: smash._id }] });
    await ops.item({ name: "Fries", price: "6", sectionId: burgers._id, placements: [{ channel: "digital", sectionId: burgers._id }] });

    const { menus, popups } = await ops.menus();
    assert.deepEqual(
      menus.map((menu) => [menu.name, menu.kind, menu.datesLabel, menu.daysLabel, menu.popupName, menu.itemCount, menu.statusLabel]),
      [
        ["Drinks", "bar", "ongoing", "Every day", "", 1, "On now"],
        ["Chez Pickle", "kitchen", "12–30 Nov", "Wed–Sat", "Chez Pickle", 2, "On now"],
      ],
    );
    assert.deepEqual(popups, [
      { id: String(pickle.id), name: "Chez Pickle", startsOn: "2026-11-12", endsOn: "2026-11-28", days: ["wed", "thu", "fri", "sat"] },
    ]);
  });

  it("adds a menu: every day and ongoing unless told otherwise; refuses what makes no sense", async () => {
    assert.deepEqual(
      { kind: drinks.kind, startsOn: drinks.startsOn, endsOn: drinks.endsOn, days: drinks.days, status: drinks.status },
      { kind: "bar", startsOn: "", endsOn: "", days: [], status: "on" },
    );
    assert.equal(drinks.slug, "drinks");
    const winter = await ops.addMenu({ name: "Winter specials", startsOn: "2026-12-01", endsOn: "2027-01-31" });
    assert.equal(winter.statusLabel, "Coming up");
    assert.equal(winter.datesLabel, "1 Dec 2026 – 31 Jan 2027");

    assert.match(await ops.addMenu({ name: "  " }, 400), /name/);
    assert.match(await ops.addMenu({ name: "drinks" }, 409), /already a menu called Drinks/);
    assert.match(await ops.addMenu({ name: "Late", startsOn: "2026-12-02", endsOn: "2026-12-01" }, 400), /before the start/);
    assert.match(await ops.addMenu({ name: "Pickle drinks", kind: "bar", popupSeriesId: String(pickle.id) }, 400), /Food menu/);
    const night = await ops.series({ name: "Jazz Night", startsOn: "2027-01-08", repeatUnit: "once" });
    assert.match(await ops.addMenu({ name: "Jazz food", kind: "kitchen", popupSeriesId: String(night.id) }, 400), /pop-up kitchen/);
  });

  it("edits a menu's days and dates; the list shows them", async () => {
    const food = await ops.addMenu({ name: "Chez Pickle", kind: "kitchen", popupSeriesId: String(pickle.id) });
    const edited = await ops.editMenu(food, { days: ["thu", "fri", "sat"], startsOn: "2026-11-12", endsOn: "2026-11-28" });
    assert.equal(edited.daysLabel, "Thu–Sat");
    const listed = (await ops.menus()).menus.find((menu) => menu.id === food.id);
    assert.equal(listed.daysLabel, "Thu–Sat");
    assert.equal(listed.datesLabel, "12–28 Nov");
    assert.equal(listed.slug, "chez-pickle");

    const renamed = await ops.editMenu(food, { name: "Dinner" });
    assert.equal(renamed.name, "Dinner");
    assert.equal(renamed.slug, "chez-pickle", "its web address stays");
    assert.equal(renamed.daysLabel, "Thu–Sat", "what wasn't sent stays");
    assert.match(await ops.editMenu(food, { endsOn: "2026-11-01" }, 400), /before the start/);
    assert.match(await ops.editMenu(food, { name: "Drinks" }, 409), /already a menu called Drinks/);
  });

  it("deletes only a menu with nothing on it", async () => {
    const food = await ops.addMenu({ name: "Chez Pickle", kind: "kitchen" });
    const chapter = await ops.section("Burgers", { menuId: food.id });
    assert.match(await ops.deleteMenu(food, 409), /still has sections/);
    await ops.editSection(chapter, { menuId: drinks.id });
    await ops.deleteMenu(food);
    assert.deepEqual(
      (await ops.menus()).menus.map((menu) => menu.name),
      ["Drinks"],
    );
  });

  it("copies a menu to start the next: its fields and sections, not its dates or items, right after it", async () => {
    const food = await ops.addMenu({
      name: "Chez Pickle",
      kind: "kitchen",
      startsOn: "2026-11-12",
      endsOn: "2026-11-28",
      days: ["wed", "thu", "fri", "sat"],
      popupSeriesId: String(pickle.id),
    });
    const later = await ops.addMenu({ name: "Brunch", kind: "kitchen" });
    const burgers = await ops.section("Burgers", { menuId: food.id, subtitle: "Smashed to order" });
    const sides = await ops.section("Sides", { menuId: food.id });
    const smash = await ops.section("Smash", { parentId: burgers._id });
    await ops.section("Veggie", { parentId: burgers._id, subtitle: "No meat" });
    await ops.item({ name: "OG Burger", price: "14", sectionId: smash._id, placements: [{ channel: "digital", sectionId: smash._id }] });
    await ops.item({ name: "Fries", price: "6", sectionId: sides._id, placements: [{ channel: "digital", sectionId: sides._id }] });
    await ops.publishSeries(pickle);
    await ops.updateWebsite();
    assert.ok((await ops.open(food)).sections[0].sanityId, "the original is on the website");

    const copy = await ops.copyMenu(food);
    assert.deepEqual(
      { name: copy.name, slug: copy.slug, kind: copy.kind, days: copy.days, popupSeriesId: copy.popupSeriesId },
      { name: "Chez Pickle (copy)", slug: "chez-pickle-copy", kind: "kitchen", days: ["wed", "thu", "fri", "sat"], popupSeriesId: String(pickle.id) },
    );
    assert.deepEqual({ startsOn: copy.startsOn, endsOn: copy.endsOn }, { startsOn: "", endsOn: "" }, "its dates are the next run's to set");
    assert.equal(copy.itemCount, 0, "items aren't copied");
    assert.deepEqual(
      (await ops.menus()).menus.map((menu) => menu.name),
      ["Drinks", "Chez Pickle", "Chez Pickle (copy)", "Brunch"],
      "right after the original",
    );
    assert.equal((await ops.menus()).menus.find((menu) => menu.id === later.id).name, "Brunch");

    const { sections } = await ops.open(copy);
    assert.deepEqual(
      sections.map((chapter) => [
        chapter.title,
        chapter.subtitle,
        chapter.subsections.map((group) => [group.title, group.subtitle]),
      ]),
      [
        ["Burgers", "Smashed to order", [["Smash", undefined], ["Veggie", "No meat"]]],
        ["Sides", undefined, []],
      ],
    );
    const copied = sections.flatMap((chapter) => [chapter, ...chapter.subsections]);
    assert.deepEqual(
      copied.map((section) => section.slug),
      ["burgers-2", "smash-2", "veggie-2", "sides-2"],
      "each with its own web address",
    );
    assert.ok(copied.every((section) => !section.sanityId), "none is the original's on the website");
    assert.ok(copied.every((section) => section.items.length === 0));
    assert.deepEqual(
      { kind: sections[0].kind, popupSeriesId: sections[0].popupSeriesId, menuId: sections[0].menuId },
      { kind: "kitchen", popupSeriesId: String(pickle.id), menuId: copy.id },
    );
    const original = await ops.open(food);
    assert.deepEqual(
      original.sections.map((chapter) => chapter.slug),
      ["burgers", "sides"],
      "the original keeps its sections",
    );
    assert.equal(original.menu.itemCount, 2, "and its items");

    assert.equal((await ops.copyMenu(food)).name, "Chez Pickle (copy 2)");
    assert.match(await ops.copyMenu({ id: "999" }, 404), /not found/);
  });

  it("sections move with their menu: a chapter is drinks or food, and a pop-up's, as its menu is", async () => {
    const food = await ops.addMenu({ name: "Chez Pickle", kind: "kitchen", popupSeriesId: String(pickle.id) });
    const burgers = await ops.section("Burgers", { menuId: food.id });
    assert.deepEqual(
      { kind: burgers.kind, popupSeriesId: burgers.popupSeriesId, menuId: burgers.menuId },
      { kind: "kitchen", popupSeriesId: String(pickle.id), menuId: food.id },
    );
    const smash = await ops.section("Smash", { parentId: burgers._id });
    assert.equal(smash.menuId, food.id, "a group is on its chapter's menu");
    assert.equal(smash.kind, "kitchen");

    // The menu's page has its own sections only.
    const page = await ops.open(food);
    assert.deepEqual(
      page.sections.map((chapter) => [chapter.title, chapter.subsections.map((group) => group.title)]),
      [["Burgers", ["Smash"]]],
    );
    assert.deepEqual((await ops.open(drinks)).sections, []);

    // Moved to Drinks, the chapter is drinks with no pop-up kitchen.
    const moved = await ops.editSection(burgers, { menuId: drinks.id });
    assert.deepEqual({ kind: moved.kind, popupSeriesId: moved.popupSeriesId }, { kind: "bar", popupSeriesId: null });
    await ops.editSection(moved, { menuId: food.id });

    // A chapter's drinks or food is its menu's to change.
    assert.match(await ops.editSection(burgers, { kind: "bar" }, 400), /Change it on the menu/);
    await ops.editMenu(food, { popupSeriesId: "" });
    const [chapter] = (await ops.open(food)).sections;
    assert.equal(chapter.popupSeriesId, null, "the pop-up kitchen let go with the menu");
    assert.match(await ops.section("Elsewhere", { menuId: "999" }).catch((error) => error.message), /Pick a menu/);
  });

  it("the website gets the same chapters as before: drinks or food, and the pop-up kitchen, from the menu", async () => {
    const food = await ops.addMenu({ name: "Chez Pickle", kind: "kitchen", popupSeriesId: String(pickle.id) });
    const formulas = await ops.section("Our Formulas", { menuId: drinks.id });
    const burgers = await ops.section("Chez Pickle", { menuId: food.id });
    const smash = await ops.section("Smash", { parentId: burgers._id });
    await ops.item({ name: "Negroni", price: "11", sectionId: formulas._id, placements: [{ channel: "digital", sectionId: formulas._id }] });
    await ops.item({ name: "OG Burger", price: "14", sectionId: smash._id, placements: [{ channel: "digital", sectionId: smash._id }] });
    await ops.publishSeries(pickle);
    await ops.updateWebsite();

    assert.equal(published(world, "our-formulas").kind, "bar");
    assert.equal("popupSeries" in published(world, "our-formulas"), false);
    const kitchen = published(world, "chez-pickle");
    assert.equal(kitchen.kind, "kitchen");
    assert.equal(kitchen.popupSeries._ref, "series-chez-pickle");
    assert.equal("kind" in published(world, "smash"), false, "none on a group");
    assert.equal((await ops.updateWebsite()).published, 0, "nothing left to publish");

    // Food made drinks on the menu: the chapter follows on the next update.
    await ops.editMenu(food, { kind: "bar", popupSeriesId: "" });
    await ops.updateWebsite();
    assert.equal(published(world, "chez-pickle").kind, "bar");
    assert.equal("popupSeries" in published(world, "chez-pickle"), false);
  });

  it("Update website sends each menu with its dates, days and pop-up, and the website shows them by day (#306)", async () => {
    const dinner = await ops.addMenu({
      name: "Dinner",
      kind: "kitchen",
      days: ["thu", "fri"],
      endsOn: "2026-11-28",
      popupSeriesId: String(pickle.id),
    });
    const brunch = await ops.addMenu({ name: "Brunch", kind: "kitchen", days: ["sat"], popupSeriesId: String(pickle.id) });
    const plates = await ops.section("Small plates", { menuId: dinner.id });
    const eggs = await ops.section("Eggs", { menuId: brunch.id });
    const formulas = await ops.section("Our Formulas", { menuId: drinks.id });
    for (const [name, section] of [["Fried pickles", plates], ["Shakshuka", eggs], ["Negroni", formulas]]) {
      await ops.item({ name, price: "9", sectionId: section._id, placements: [{ channel: "digital", sectionId: section._id }] });
    }
    await ops.publishSeries(pickle);
    await ops.updateWebsite();

    const site = world.sanity.view("published");
    const menuDoc = (id) => world.sanity.view("published").find((doc) => doc._id === `menu-${id}`);
    assert.deepEqual(
      [dinner, brunch, drinks].map((menu) => {
        const doc = menuDoc(menu.id);
        return [doc.name, doc.slug.current, doc.kind, doc.days ?? null, doc.endsOn ?? null, doc.popupSeries?._ref ?? null];
      }),
      [
        ["Dinner", "dinner", "kitchen", ["thu", "fri"], "2026-11-28", "series-chez-pickle"],
        ["Brunch", "brunch", "kitchen", ["sat"], null, "series-chez-pickle"],
        ["Drinks", "drinks", "bar", null, null, null],
      ],
    );
    assert.equal(published(world, "small-plates").menu._ref, `menu-${dinner.id}`);
    assert.equal(published(world, "small-plates").menu._weak, true, "a menu can go before its old chapters");
    assert.equal((await ops.updateWebsite()).published, 0, "nothing left to publish");

    // The website, reading what was sent with its own queries
    const read = async (query, params = {}) => (await evaluate(parse(query), { dataset: site, params })).get();
    const sections = nestMenuSections((await read(MENU_QUERY)).map(mapFlatSection));
    const menus = (await read(MENUS_QUERY)).map(mapMenuInfo).filter(Boolean);
    const catalog = {
      series: [{ seriesId: "chez-pickle", title: "Chez Pickle", category: "popup" }],
      occurrences: ["2026-11-19", "2026-11-20", "2026-11-21"].map((date) => ({ seriesId: "chez-pickle", date, category: "popup" })),
    };
    const kitchen = menuShelf("kitchen", { sections, menus }, catalog, "2026-11-21");
    assert.deepEqual(
      kitchen.menus.map((menu) => [menu.label, menu.href, menu.today]),
      [
        ["Dinner · Thu & Fri", "/kitchen#dinner", false],
        ["Brunch · Sat", "/kitchen#brunch", true],
      ],
    );
    assert.deepEqual(menuShelf("bar", { sections, menus }, catalog, "2026-11-21").menus.map((menu) => menu.name), ["Drinks"]);

    // A menu taken out of ops goes from the website on the next update.
    await ops.editSection(eggs, { menuId: dinner.id });
    await ops.deleteMenu(brunch);
    await ops.updateWebsite();
    assert.equal(menuDoc(brunch.id), undefined);
    assert.equal(published(world, "eggs").menu._ref, `menu-${dinner.id}`);
  });

  it("in Events, a pop-up lists its menus with their days; Add menu starts one from its name, dates and days", async () => {
    assert.deepEqual(await ops.popupMenus(pickle), []);
    const { popups } = await ops.menus();
    const run = popups.find((popup) => popup.id === String(pickle.id));
    // What Add menu fills in from the pop-up, before the owner narrows it.
    const dinner = await ops.addMenu({
      name: run.name,
      kind: "kitchen",
      startsOn: run.startsOn,
      endsOn: run.endsOn,
      days: run.days,
      popupSeriesId: run.id,
    });
    const narrowed = await ops.editMenu(dinner, { days: ["thu", "fri", "sat"] });
    const brunch = await ops.addMenu({
      name: "Brunch",
      kind: "kitchen",
      startsOn: run.startsOn,
      endsOn: run.endsOn,
      days: ["sat"],
      popupSeriesId: run.id,
    });

    assert.deepEqual(
      (await ops.popupMenus(pickle)).map((menu) => [menu.id, `${menu.name} · ${menu.daysLabel}`, menu.statusLabel]),
      [
        [narrowed.id, "Chez Pickle · Thu–Sat", "On now"],
        [brunch.id, "Brunch · Sat", "On now"],
      ],
    );
    assert.deepEqual(
      (await ops.menus()).menus.map((menu) => menu.name),
      ["Drinks", "Chez Pickle", "Brunch"],
    );
  });
});
