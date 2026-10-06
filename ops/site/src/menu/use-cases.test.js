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
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
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
import { withPrices } from "./prices.js";

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

// The same edits with the menu on Baserow and on D1 (#127).
for (const store of ["baserow", "d1"]) describe(`menu on ${store}: each edit reaches /menu after Update website`, () => {
  let world;
  let ops;
  let cocktails;
  let negroni;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    if (store === "d1") Object.assign(world.env, { OPS_DB: createTestD1("ops"), DATA_STORE_MENU: "d1" });
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
    if (store === "d1") assert.deepEqual(world.baserow.rows("Menu Items"), [], "on D1, Baserow isn't touched");
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

  it("a price table: every size on /menu, the first two still in price and priceAlt", async () => {
    await ops.updateWebsite();
    const prices = [
      { name: "125 ml", size: "125 ml", price: "7", sku: "G0101" },
      { name: "175 ml", size: "175 ml", price: "9" },
      { name: "Bottle", price: "32", sku: "G0103" },
    ];
    // As the editor does: the table and its mirrored fields change together.
    const saved = await ops.edit(negroni, menuItemPayload(withPrices({ ...negroni, drinkType: "pour" }, prices)));
    assert.deepEqual(saved.prices, prices);
    assert.equal(saved.price, "7");
    assert.equal(saved.priceAlt, "9");
    assert.equal(saved.lightspeedSku, "G0101");
    assert.deepEqual(saved.publish.preview.changed, ["price", "priceAlt", "drinkType"]);
    await ops.updateWebsite();
    const shown = drink(await websiteMenu(world), "Cocktails", "Negroni");
    assert.equal(shown?.price, "7");
    assert.equal(shown?.priceAlt, "9");
    assert.deepEqual(shown?.prices, [
      { name: "125 ml", size: "125 ml", price: "7" },
      { name: "175 ml", size: "175 ml", price: "9" },
      { name: "Bottle", size: null, price: "32" },
    ]);

    // Dropping back to one price leaves one on /menu.
    const single = await ops.edit(saved, menuItemPayload(withPrices(saved, prices.slice(0, 1))));
    assert.equal(single.priceAlt, undefined);
    assert.deepEqual(single.publish.preview.changed, ["priceAlt"]);
    await ops.updateWebsite();
    const after = drink(await websiteMenu(world), "Cocktails", "Negroni");
    assert.equal(after?.priceAlt, null);
    assert.deepEqual(after?.prices, [{ name: "125 ml", size: "125 ml", price: "7" }]);
  });

  it("ABV and volume follow the recipe until overridden, and go back with Use recipe value", async () => {
    const ingredients = [
      { name: "Gin", quantity: 50, unit: "ml", abv: "40" },
      { name: "Tonic", quantity: 50, unit: "ml" },
    ];
    const built = await ops.edit(negroni, menuItemPayload({ ...negroni, ingredients }));
    assert.equal(built.abv, "20%");
    assert.equal(built.volume, "100 ml");
    assert.equal(built.abvOverride, undefined, "locked");

    // Override: the editor sends the flag with the typed figure; a recipe change keeps it.
    const typed = await ops.edit(built, menuItemPayload({ ...built, abv: "18%", abvOverride: true, volumeOverride: false }));
    assert.equal(typed.abv, "18%");
    assert.equal(typed.abvOverride, true);
    const longer = [...ingredients, { name: "Soda", quantity: 50, unit: "ml" }];
    const grown = await ops.edit(typed, menuItemPayload({ ...typed, ingredients: longer, volume: "150 ml", volumeOverride: false }));
    assert.equal(grown.abv, "18%", "set by hand, so the recipe doesn't move it");
    assert.equal(grown.volume, "150 ml");

    // Use recipe value.
    const back = await ops.edit(grown, menuItemPayload({ ...grown, abv: "13.3%", abvOverride: false }));
    assert.equal(back.abv, "13.3%");
    assert.equal(back.abvOverride, undefined);

    // A save without the flags (an old tab) keeps a figure that isn't the recipe's.
    const old = await ops.edit(back, { ingredients: longer, abv: "15%" });
    assert.equal(old.abv, "15%");
    assert.equal(old.abvOverride, true);
  });

  it("adding and removing a photo", async () => {
    await ops.updateWebsite();
    const withPhoto = await ops.addPhoto(negroni);
    const assets = world.sanity.view("raw").filter((doc) => doc._type === "sanity.imageAsset");
    assert.equal(assets.length, 1, "the photo went straight to Sanity (#183)");
    assert.equal(withPhoto.image.asset._id, assets[0]._id);
    assert.match(withPhoto.image.asset.url, /^https:\/\/cdn\.sanity\.io\//);
    if (store === "baserow") assert.deepEqual(world.baserow.rows("Menu Items")[0].Photo, [], "no Baserow file");
    await ops.updateWebsite();
    assert.ok(drink(await websiteMenu(world), "Cocktails", "Negroni")?.image?.asset?.url, "photo on /menu");
    assert.equal(
      world.sanity.view("raw").filter((doc) => doc._type === "sanity.imageAsset").length,
      1,
      "Update website referenced the asset, it didn't copy it",
    );
    await ops.removePhoto(negroni);
    await ops.updateWebsite();
    assert.ok(!drink(await websiteMenu(world), "Cocktails", "Negroni")?.image?.asset, "photo gone from /menu");
  });

  // Storage-specific on purpose: only Baserow has photos from before #183.
  it.skipIf(store !== "baserow")("a photo from before (a Baserow file) still reaches /menu", async () => {
    const file = world.baserow.addFile("old.jpg", new Uint8Array(1024).fill(9));
    const [row] = world.baserow.rows("Menu Items");
    world.baserow.update("Menu Items", row.id, { Photo: [file] });
    await ops.updateWebsite();
    assert.ok(drink(await websiteMenu(world), "Cocktails", "Negroni")?.image?.asset?.url, "copied in at publish");
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
