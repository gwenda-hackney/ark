/**
 * The menu's Update website on Cloudflare's free plan, which allows a request
 * 50 outside calls. A big change in one press (sections renamed, a new Beer
 * chapter with drinks moved in and renamed, a new food chapter) has to reach
 * the website in a handful of Sanity calls, not one or more per drink.
 *
 * Real API handlers on the fake world (testing/fake-world.js), the menu and
 * events on D1 as in production; every Sanity call goes through its fetch.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { evaluate, parse } from "groq-js";
import { MENU_QUERY } from "../../../../marketing/web/src/lib/sanity/queries.ts";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { onRequestPost as createItem } from "../../functions/api/menu/index.js";
import { onRequestPatch as patchItem } from "../../functions/api/menu/[id].js";
import { onRequestPost as createSection } from "../../functions/api/menu/sections.js";
import { onRequestPatch as editSection } from "../../functions/api/menu/sections/[id].js";
import { onRequestPost as publishMenu } from "../../functions/api/menu/publish.js";

/** Cloudflare's per-request cap on outside calls (the free plan's). */
const SUBREQUEST_CAP = 50;

function editor(world) {
  const ok = (res, status = 200) => {
    assert.equal(res.status, status, JSON.stringify(res.data));
    return res.data;
  };
  return {
    async section(title, more = {}) {
      const body = { title, ...more };
      return ok(await callApi(world, createSection, { method: "POST", path: "/api/menu/sections", body }), 201).section;
    },
    async editSection(section, body) {
      const res = await callApi(world, editSection, {
        method: "PATCH",
        path: `/api/menu/sections/${section._id}`,
        params: { id: section._id },
        body,
      });
      return ok(res).section;
    },
    async create(body) {
      return ok(await callApi(world, createItem, { method: "POST", path: "/api/menu", body }), 201).item;
    },
    async edit(item, body) {
      const res = await callApi(world, patchItem, {
        method: "PATCH",
        path: `/api/menu/${item._id}`,
        params: { id: item._id },
        body,
      });
      return ok(res).item;
    },
    async updateWebsite() {
      return ok(await callApi(world, publishMenu, { method: "POST", path: "/api/menu/publish" }));
    },
  };
}

/** What /menu shows: section title → the names in it. */
async function websiteMenu(world) {
  const result = await (await evaluate(parse(MENU_QUERY), { dataset: world.sanity.view("published") })).get();
  return Object.fromEntries(result.map((section) => [section.title, section.items.map((item) => item.name)]));
}

/** 7 chapters, most with groups, about 110 drinks: the menu as it was before tonight. */
const MENU = [
  ["Cocktails", [["Signatures", 12], ["Classics", 14], ["Spritzes", 8]]],
  ["Wine", [["Red", 8], ["White", 8], ["Rosé & Sparkling", 6]]],
  ["Spirits", [["Gin", 8], ["Whisky", 8], ["Rum", 6], ["Agave", 6]]],
  ["Bottles & Cans", [["Lager", 6], ["Ale", 6]]],
  ["Low & No", [["Alcohol free", 6]]],
  ["Soft Drinks", [["Sodas", 5]]],
  ["Hot Drinks", [["Coffee", 3]]],
];

describe("the menu's Update website after a big change", () => {
  let world;
  let ops;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    Object.assign(world.env, { OPS_DB: createTestD1("ops"), DATA_STORE_MENU: "d1", DATA_STORE_EVENTS: "d1" });
    ops = editor(world);
  });
  afterEach(() => world.restore());

  it("stays well under Cloudflare's call cap, and every change reaches /menu", async () => {
    const sections = {};
    const drinks = {};
    let order = 0;
    for (const [chapterTitle, groups] of MENU) {
      const chapter = await ops.section(chapterTitle, { orderRank: (order += 10) });
      sections[chapterTitle] = chapter;
      for (const [groupTitle, count] of groups) {
        const group = await ops.section(groupTitle, { parentId: chapter._id, orderRank: (order += 10) });
        sections[groupTitle] = group;
        drinks[groupTitle] = [];
        for (let n = 1; n <= count; n += 1) {
          drinks[groupTitle].push(
            await ops.create({
              name: `${groupTitle} ${n}`,
              description: `The ${groupTitle.toLowerCase()} number ${n}.`,
              price: String(5 + n),
              drinkType: "cocktail",
              sectionId: group._id,
              onDigitalMenu: true,
            }),
          );
        }
      }
    }
    const total = Object.values(drinks).flat().length;
    assert.ok(total >= 100, `a realistic menu (${total} drinks)`);
    const first = await ops.updateWebsite();
    assert.deepEqual(first.sync.missing, []);
    assert.equal(first.warnings.length, 1, "only the build, which the fake world can't start");

    // Tonight's migrations: sections renamed ...
    const renames = {
      Cocktails: "Our Cocktails",
      Classics: "The Classics",
      "Low & No": "Low & No Alcohol",
      "Soft Drinks": "Softs",
      Whisky: "Whisk(e)y",
    };
    for (const [from, to] of Object.entries(renames)) await ops.editSection(sections[from], { title: to });
    // ... a Beer chapter, with the beers moved in and renamed ...
    const beer = await ops.section("Beer", { orderRank: (order += 10) });
    const draught = await ops.section("On Draught", { parentId: beer._id, orderRank: (order += 10) });
    const cans = await ops.section("Cans", { parentId: beer._id, orderRank: (order += 10) });
    const moved = [
      ...drinks.Lager.slice(0, 5).map((item) => [item, draught, `Draught ${item.name}`]),
      ...drinks.Ale.slice(0, 5).map((item) => [item, cans, `Canned ${item.name}`]),
    ];
    for (const [item, section, name] of moved) await ops.edit(item, { name, sectionId: section._id });
    // ... the hot drinks off the digital menu ...
    for (const item of drinks.Coffee) await ops.edit(item, { onDigitalMenu: false });
    // ... and a new food chapter with 8 dishes.
    const food = await ops.section("Chez Pickle Food", { kind: "kitchen", orderRank: (order += 10) });
    const dishes = [];
    for (let n = 1; n <= 8; n += 1) {
      dishes.push(`Pickle dish ${n}`);
      await ops.create({
        name: `Pickle dish ${n}`,
        price: String(8 + n),
        sectionId: food._id,
        placements: [{ channel: "digital", sectionId: food._id }],
      });
    }

    const before = world.calls.length;
    const res = await ops.updateWebsite();
    const calls = world.calls.slice(before);
    const sanityCalls = calls.filter((call) => /\.api\.sanity\.io\//.test(call));

    // Everything reached /menu: renamed sections, moved and renamed beers,
    // the hot drinks gone, the new dishes.
    assert.deepEqual(res.sync.missing, []);
    assert.equal(res.warnings.length, 1, "only the build, which the fake world can't start");
    assert.match(res.warnings[0], /^The menu page will update with the next website update/);
    assert.equal(res.sync.created.length, 8, "the dishes");
    assert.equal(res.sync.synced.length, 10, "the moved beers");
    assert.equal(res.sync.removed.length, 3, "the hot drinks");
    const menu = await websiteMenu(world);
    for (const [from, to] of Object.entries(renames)) {
      assert.ok(menu[to], `${from} is ${to} on /menu`);
      assert.equal(menu[from], undefined, `no ${from} left on /menu`);
    }
    assert.deepEqual(menu["On Draught"], drinks.Lager.slice(0, 5).map((item) => `Draught ${item.name}`));
    assert.deepEqual(menu.Cans, drinks.Ale.slice(0, 5).map((item) => `Canned ${item.name}`));
    assert.deepEqual(menu.Lager, [drinks.Lager[5].name], "what stayed behind");
    assert.deepEqual(menu.Coffee, [], "off the digital menu");
    assert.equal(world.sanity.published("menuItem").some((doc) => doc.name.startsWith("Coffee")), false);
    assert.deepEqual(menu["Chez Pickle Food"], dishes);
    assert.equal(menu.Signatures.length, 12, "the drinks that didn't change are still there");
    assert.equal(world.sanity.drafts().length, 0, "nothing left waiting on the preview");
    assert.equal((await ops.updateWebsite()).published, 0, "and then nothing is left to publish");

    // In a handful of calls, whatever the size of the menu: one read of the
    // menu, a transaction per 50 writes, then the release's reads and writes.
    const list = `\n${calls.join("\n")}`;
    assert.ok(sanityCalls.length < SUBREQUEST_CAP, `${sanityCalls.length} Sanity calls in one press (cap ${SUBREQUEST_CAP}):${list}`);
    assert.ok(sanityCalls.length <= 15, `${sanityCalls.length} Sanity calls in one press, not a handful:${list}`);
    assert.ok(calls.length < SUBREQUEST_CAP, `${calls.length} outside calls in one press:${list}`);
  }, 60_000);
});
