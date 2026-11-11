/**
 * migrations/2026-11-11-menu-beer-names.mjs, run as a deploy runs it against
 * a D1 with the real schema: for real, again (nothing to do), with a name the
 * owner chose, without a group, and as a dry run. Then the menu's Update
 * website (ops' own handler, Sanity faked) and what the drinks page reads
 * (the website's MENU_QUERY): "Draught" and "Bottles", at the same addresses.
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
import * as beerNames from "../../migrations/2026-11-11-menu-beer-names.mjs";

/** The drinks menu as 2026-11-10-menu-plain-sections left it: Beer, its two groups, a drink in each. */
async function seed(db, { draught = "On Draught", bottles = "In Bottles" } = {}) {
  const section = (id, name, slug, order, parentId = null) => ({ id, name, slug, order, parentId, kind: parentId ? "" : "bar" });
  await d1MenuRepository(db).importAll({
    menu_sections: [
      section(65, "Our Cocktails", "our-formulas", 1),
      section(80, "Beer", "beer", 2),
      section(75, draught, "draught-beer", 3, 80),
      section(72, bottles, "bottled-beer", 4, 80),
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
  await beerNames.up({ env: "dev", d1: () => db, processEnv: {}, dryRun, log: (line) => lines.push(line) });
  return lines;
}

/** The beer groups by id: 75 draught, 72 bottles. */
async function groups(db) {
  const { sections } = await loadMenuTree({ menuRepository: d1MenuRepository(db) });
  const flat = flattenMenuSections(sections);
  return { draught: flat.find((row) => row._id === "75"), bottles: flat.find((row) => row._id === "72") };
}

const dump = async (db) => JSON.stringify(await d1MenuRepository(db).exportAll());

/** Everything about a group but its name. */
const place = (group) => [group.slug, group.parentId, group.orderRank, group.items.map((item) => item.name)];

describe("2026-11-11-menu-beer-names", () => {
  it('renames "On Draught" to "Draught" and "In Bottles" to "Bottles", keeping each slug, id, place and drinks; then has nothing to do', async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await groups(db);
    const lines = await run(db);

    const after = await groups(db);
    assert.equal(after.draught.title, "Draught");
    assert.equal(after.bottles.title, "Bottles");
    assert.deepEqual(place(after.draught), place(before.draught), "the same draught group in the same place");
    assert.deepEqual(place(after.bottles), place(before.bottles), "the same bottles group in the same place");
    assert.deepEqual(place(after.draught), ["draught-beer", "80", place(before.draught)[2], ["Gwenda Pilsner"]]);
    assert.deepEqual(place(after.bottles)[0], "bottled-beer");
    const placements = await d1MenuRepository(db).list("menu_placements");
    for (const itemId of ["300", "301"]) {
      assert.deepEqual(
        placements.filter((row) => String(row.itemId) === itemId).map((row) => row.channel).sort(),
        ["digital", "pos"],
        `item ${itemId} still on the till`,
      );
    }
    const text = lines.join("\n");
    assert.match(text, /change menu_sections 75 "On Draught": name "On Draught" → "Draught"/);
    assert.match(text, /change menu_sections 72 "In Bottles": name "In Bottles" → "Bottles"/);
    assert.match(text, /2 sections renamed; their web addresses stay/);

    const settled = await dump(db);
    const again = await run(db);
    assert.equal(await dump(db), settled, "a second run writes nothing");
    assert.deepEqual(again, ['Nothing to do: draught-beer is already "Draught".', 'Nothing to do: bottled-beer is already "Bottles".']);
  });

  it("leaves a name the owner has since chosen in ops, says so, and still renames the other", async () => {
    const db = createTestD1("ops");
    await seed(db, { bottles: "Bottled" });
    const lines = await run(db);
    const after = await groups(db);
    assert.equal(after.draught.title, "Draught");
    assert.equal(after.bottles.title, "Bottled");
    assert.ok(lines.includes('left alone: bottled-beer\'s name is "Bottled", neither "In Bottles" nor "Bottles" (edited in ops since?)'), lines.join("\n"));
    assert.ok(lines.some((line) => line.startsWith("1 section renamed")), lines.join("\n"));

    const both = createTestD1("ops");
    await seed(both, { draught: "On Tap", bottles: "Bottled" });
    const before = await dump(both);
    const untouched = await run(both);
    assert.equal(await dump(both), before);
    assert.equal(untouched.filter((line) => line.startsWith("left alone")).length, 2, untouched.join("\n"));
  });

  it("says when a group isn't there, and still renames the other", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const repo = d1MenuRepository(db);
    await repo.remove("menu_placements", 3);
    await repo.remove("menu_placements", 4);
    await repo.remove("menu_items", 301);
    await repo.remove("menu_sections", 75);
    const lines = await run(db);
    assert.ok(lines.includes("not found: no menu section with the slug draught-beer; nothing to rename."), lines.join("\n"));
    assert.equal((await groups(db)).bottles.title, "Bottles");
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
    assert.match(text, /would change menu_sections 72 "In Bottles": name "In Bottles" → "Bottles"/);
    assert.match(text, /2 sections to rename/);
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

    it('shows "Draught" and "Bottles" on the drinks page after the menu\'s Update website, at the same addresses', async () => {
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
        ["Bottles", "bottled-beer", ["Menabrea"]],
      ]);
    });
  });
});
