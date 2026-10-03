/**
 * Use cases (#42): every kind of menu edit an editor makes in ops reaches
 * /menu after the menu's Update website. Real API handlers, with Baserow and
 * Sanity faked (testing/fake-world.js); "what /menu shows" is the website's
 * own MENU_QUERY run against the published documents.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { evaluate, parse } from "groq-js";
import { MENU_QUERY } from "../../../../marketing/web/src/lib/sanity/queries.ts";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { onRequestPost as createItem } from "../../functions/api/menu/index.js";
import { onRequestPatch as editItem } from "../../functions/api/menu/[id].js";
import { onRequestPost as createSection } from "../../functions/api/menu/sections.js";
import {
  onRequestDelete as removePhoto,
  onRequestPost as uploadPhoto,
} from "../../functions/api/menu/image.js";
import { onRequestPost as publishMenu } from "../../functions/api/menu/publish.js";
import { onRequestGet as releaseDiff } from "../../functions/api/web/release.js";
import { menuItemPayload } from "./item-payload.ts";

function editor(world) {
  const ok = (res, status = 200) => {
    assert.equal(res.status, status, JSON.stringify(res.data));
    return res.data;
  };
  return {
    async section(title) {
      return ok(await callApi(world, createSection, { method: "POST", path: "/api/menu/sections", body: { title } }), 201)
        .section;
    },
    async create(body) {
      return ok(await callApi(world, createItem, { method: "POST", path: "/api/menu", body }), 201).item;
    },
    async edit(item, body) {
      return ok(
        await callApi(world, editItem, {
          method: "PATCH",
          path: `/api/menu/${item._id}`,
          params: { id: item._id },
          body,
        }),
      ).item;
    },
    async addPhoto(item) {
      const form = new FormData();
      form.set("itemId", item._id);
      form.set("file", new File([new Uint8Array(2048).fill(7)], "negroni.jpg", { type: "image/jpeg" }));
      return ok(await callApi(world, uploadPhoto, { method: "POST", path: "/api/menu/image", body: form })).item;
    },
    async removePhoto(item) {
      return ok(
        await callApi(world, removePhoto, { method: "DELETE", path: `/api/menu/image?itemId=${item._id}` }),
      );
    },
    /** The menu's Update website. */
    async updateWebsite() {
      return ok(await callApi(world, publishMenu, { method: "POST", path: "/api/menu/publish" }));
    },
    /** Menu changes the Website page still lists as not on the website. */
    async waitingOnWebsitePage() {
      const data = ok(await callApi(world, releaseDiff, { path: "/api/web/release" }));
      return data.entries.filter((entry) => ["menuItem", "menuSection"].includes(entry.type));
    },
  };
}

/** What /menu shows: section title → the drinks in it. */
async function websiteMenu(world) {
  const result = await (await evaluate(parse(MENU_QUERY), { dataset: world.sanity.view("published") })).get();
  return Object.fromEntries(
    result.filter((section) => section.items.length).map((section) => [section.title, section.items]),
  );
}

const drink = (menu, section, name) => (menu[section] || []).find((item) => item.name === name);

describe("menu: each edit reaches /menu after Update website", () => {
  let world;
  let ops;
  let cocktails;
  let negroni;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    ops = editor(world);
    cocktails = await ops.section("Cocktails");
    negroni = await ops.create({
      name: "Negroni",
      description: "Gin, Campari, vermouth.",
      price: "11",
      drinkType: "cocktail",
      sectionId: cocktails._id,
      onDigitalMenu: true,
    });
  });
  afterEach(() => world.restore());

  it("a new drink: on /menu in its section, nothing left waiting", async () => {
    assert.equal(drink(await websiteMenu(world), "Cocktails", "Negroni"), undefined, "not before Update website");
    const res = await ops.updateWebsite();
    assert.ok(res.published > 0);
    const shown = drink(await websiteMenu(world), "Cocktails", "Negroni");
    assert.equal(shown?.price, "11");
    assert.equal(shown?.description, "Gin, Campari, vermouth.");
    assert.deepEqual(await ops.waitingOnWebsitePage(), [], "the Website page has nothing left for the menu");
  });

  it("name, price and description changes", async () => {
    await ops.updateWebsite();
    await ops.edit(negroni, { name: "Negroni Sbagliato", price: "12", description: "Prosecco instead of gin." });
    await ops.updateWebsite();
    const menu = await websiteMenu(world);
    assert.equal(drink(menu, "Cocktails", "Negroni"), undefined);
    const shown = drink(menu, "Cocktails", "Negroni Sbagliato");
    assert.equal(shown?.price, "12");
    assert.equal(shown?.description, "Prosecco instead of gin.");
  });

  it("adding and removing a photo", async () => {
    await ops.updateWebsite();
    await ops.addPhoto(negroni);
    await ops.updateWebsite();
    assert.ok(drink(await websiteMenu(world), "Cocktails", "Negroni")?.image?.asset?.url, "photo on /menu");
    await ops.removePhoto(negroni);
    await ops.updateWebsite();
    assert.ok(!drink(await websiteMenu(world), "Cocktails", "Negroni")?.image?.asset, "photo gone from /menu");
  });

  it("moving a drink to another section", async () => {
    const spritzes = await ops.section("Spritzes");
    await ops.updateWebsite();
    await ops.edit(negroni, { sectionId: spritzes._id });
    await ops.updateWebsite();
    const menu = await websiteMenu(world);
    assert.equal(drink(menu, "Cocktails", "Negroni"), undefined, "not under its old section");
    assert.ok(drink(menu, "Spritzes", "Negroni"), "under its new section");
  });

  it("taking a drink off the digital menu, and putting it back", async () => {
    await ops.updateWebsite();
    await ops.edit(negroni, { onDigitalMenu: false });
    await ops.updateWebsite();
    assert.equal(drink(await websiteMenu(world), "Cocktails", "Negroni"), undefined, "off /menu");
    await ops.edit(negroni, { onDigitalMenu: true });
    await ops.updateWebsite();
    assert.ok(drink(await websiteMenu(world), "Cocktails", "Negroni"), "back on /menu");
  });

  it("a different section per channel survives the editor's Save (#151)", async () => {
    const spritzes = await ops.section("Spritzes");
    const split = (negroni.placements || []).map((row) =>
      row.channel === "digital" ? { ...row, sectionId: spritzes._id } : row,
    );
    const placed = await ops.edit(negroni, { placements: split });
    const sectionOf = (item, channel) => item.placements.find((row) => row.channel === channel)?.sectionId;
    assert.equal(sectionOf(placed, "print"), cocktails._id);
    assert.equal(sectionOf(placed, "digital"), spritzes._id);

    // The editor's Save, after changing only the price.
    const saved = await ops.edit(placed, menuItemPayload({ ...placed, price: "12" }));
    assert.equal(saved.price, "12");
    assert.equal(sectionOf(saved, "print"), cocktails._id, "print keeps its section");
    assert.equal(sectionOf(saved, "digital"), spritzes._id, "digital keeps its own section");
    await ops.updateWebsite();
    assert.ok(drink(await websiteMenu(world), "Spritzes", "Negroni"), "/menu shows the digital section");
  });

  it("Update website with nothing changed publishes nothing", async () => {
    await ops.updateWebsite();
    const again = await ops.updateWebsite();
    assert.equal(again.published, 0);
  });
});
