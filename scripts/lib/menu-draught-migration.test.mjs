/**
 * migrations/2026-11-11-menu-draught.mjs, run as a deploy runs it against a
 * D1 with the real schema: for real, again (nothing to do), with a name the
 * owner chose, without the group, and as a dry run. Then the menu's Update
 * website (ops' own handler, Sanity faked) and what the drinks page reads
 * (the website's MENU_QUERY): "Draught", at the same address.
 */
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { afterEach, beforeEach, describe, it } from "vitest";
import { MENU_QUERY } from "../../marketing/web/src/lib/sanity/queries.ts";
import { onRequestPost as publishMenu } from "../../ops/site/functions/api/menu/publish.js";
import { flattenMenuSections } from "../../ops/site/src/menu/menu-sections.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { loadMenuTree } from "../../ops/site/src/menu/server/menu-store.js";
import { callApi, createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as draught from "../../migrations/2026-11-11-menu-draught.mjs";

/** The drinks menu as 2026-11-10-menu-plain-sections left it: Beer, its two groups, a drink in each. */
async function seed(db, { draughtName = "On Draught" } = {}) {
  const section = (id, name, slug, order, parentId = null) => ({ id, name, slug, order, parentId, kind: parentId ? "" : "bar" });
  await d1MenuRepository(db).importAll({
    menu_sections: [
      section(65, "Our Cocktails", "our-formulas", 1),
      section(80, "Beer", "beer", 2),
      section(75, draughtName, "draught-beer", 3, 80),
      section(72, "In Bottles", "bottled-beer", 4, 80),
    ],
    pos_menus: [{ id: 7, name: "Fall 2026", order: 1, isDefault: true }],
    menu_items: [
      { id: 300, name: "Menabrea", sectionId: 72, price: "4", posMenuIds: [7] },
      { id: 301, name: "Gwenda Pilsner", sectionId: 75, price: "6.5", posMenuIds: [7] },
    ],
    menu_placements: [
      { id: 1, itemId: 300, channel: "digital", sectionId: 72 },
      { id: 2, itemId: 300, channel: "pos", posMenuId: 7, posScreen: "Beers" },
      { id: 3, itemId: 301, channel: "digital", sectionId: 75 },
      { id: 4, itemId: 301, channel: "pos", posMenuId: 7, posScreen: "Beers" },
    ],
  });
}

async function run(db, { dryRun = false } = {}) {
  const lines = [];
  await draught.up({ env: "dev", d1: () => db, processEnv: {}, dryRun, log: (line) => lines.push(line) });
  return lines;
}

async function group(db) {
  const { sections } = await loadMenuTree({ menuRepository: d1MenuRepository(db) });
  return flattenMenuSections(sections).find((row) => row._id === "75");
}

const dump = async (db) => JSON.stringify(await d1MenuRepository(db).exportAll());

describe("2026-11-11-menu-draught", () => {
  it('renames "On Draught" to "Draught", keeping its slug, id, place and drinks; then has nothing to do', async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await group(db);
    const lines = await run(db);

    const after = await group(db);
    assert.equal(after.title, "Draught");
    assert.deepEqual(
      [after.slug, after.parentId, after.orderRank, after.items.map((item) => item.name)],
      [before.slug, before.parentId, before.orderRank, ["Gwenda Pilsner"]],
      "the same group in the same place: only its name changed",
    );
    const pilsner = (await d1MenuRepository(db).list("menu_placements")).filter((row) => String(row.itemId) === "301");
    assert.deepEqual(pilsner.map((row) => row.channel).sort(), ["digital", "pos"], "still on the till");
    const text = lines.join("\n");
    assert.match(text, /change menu_sections 75 "On Draught": name "On Draught" → "Draught"/);
    assert.match(text, /1 section renamed; its web address stays/);

    const settled = await dump(db);
    const again = await run(db);
    assert.equal(await dump(db), settled, "a second run writes nothing");
    assert.deepEqual(again, ['Nothing to do: draught-beer is already "Draught".']);
  });

  it("leaves a name the owner has since chosen in ops, and says so", async () => {
    const db = createTestD1("ops");
    await seed(db, { draughtName: "On Tap" });
    const before = await dump(db);
    const lines = await run(db);
    assert.equal(await dump(db), before);
    assert.deepEqual(lines, ['left alone: draught-beer\'s name is "On Tap", neither "On Draught" nor "Draught" (edited in ops since?)']);
  });

  it("does nothing, and says so, when there is no draught group", async () => {
    const db = createTestD1("ops");
    await seed(db);
    await d1MenuRepository(db).remove("menu_placements", 3);
    await d1MenuRepository(db).remove("menu_placements", 4);
    await d1MenuRepository(db).remove("menu_items", 301);
    await d1MenuRepository(db).remove("menu_sections", 75);
    const before = await dump(db);
    const lines = await run(db);
    assert.equal(await dump(db), before);
    assert.deepEqual(lines, ["not found: no menu section with the slug draught-beer; nothing to rename."]);
  });

  it("a dry run says what it would do and writes nothing", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await dump(db);
    const lines = await run(db, { dryRun: true });
    assert.equal(await dump(db), before);
    const text = lines.join("\n");
    assert.match(text, /Dry run: working on a copy/);
    assert.match(text, /would change menu_sections 75 "On Draught": name "On Draught" → "Draught"/);
    assert.match(text, /1 section to rename/);
  });

  describe("on the website", () => {
    let world;
    beforeEach(async () => {
      world = await createFakeWorld();
      world.install();
      Object.assign(world.env, { OPS_DB: createTestD1("ops"), DATA_STORE_MENU: "d1" });
    });
    afterEach(() => world.restore());

    /** The menu's Update website in ops. */
    async function updateWebsite() {
      const res = await callApi(world, publishMenu, { method: "POST", path: "/api/menu/publish" });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    }

    /** What the drinks page shows under Beer: each group's name, its address and its drinks. */
    async function beerOnWebsite() {
      const sections = await (await evaluate(parse(MENU_QUERY), { dataset: world.sanity.view("published") })).get();
      return sections
        .filter((section) => section.parentId && sections.find((row) => row.id === section.parentId)?.title === "Beer")
        .map((section) => [section.title, section.id, section.items.map((item) => item.name)]);
    }

    it('shows "Draught" on the drinks page after the menu\'s Update website, at the same address', async () => {
      await seed(world.env.OPS_DB);
      await updateWebsite();
      assert.deepEqual(await beerOnWebsite(), [
        ["On Draught", "draught-beer", ["Gwenda Pilsner"]],
        ["In Bottles", "bottled-beer", ["Menabrea"]],
      ]);

      await run(world.env.OPS_DB);
      await updateWebsite();
      assert.deepEqual(await beerOnWebsite(), [
        ["Draught", "draught-beer", ["Gwenda Pilsner"]],
        ["In Bottles", "bottled-beer", ["Menabrea"]],
      ]);
    });
  });
});
