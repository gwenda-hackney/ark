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
import { onRequestPatch as editSection } from "../../functions/api/menu/sections/[id].js";
import { onRequestGet as getMenu } from "../../functions/api/menu/index.js";
import { onRequestPost as createEvent } from "../../functions/api/events/index.js";
import { onRequestPatch as editEvent } from "../../functions/api/events/[id].js";
import { onRequestPost as publishEvent } from "../../functions/api/events/[id]/publish.js";
import { onRequestPost as createPosMenu } from "../../functions/api/pos-menus/index.js";
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
      return status === 200 ? ok(res).section : (assert.equal(res.status, status, JSON.stringify(res.data)), res.data);
    },
    /** A series in Events: a night, a promotion or a pop-up kitchen. */
    async series(body) {
      return ok(await callApi(world, createEvent, { method: "POST", path: "/api/events", body }), 201).event;
    },
    async editSeries(series, body) {
      return ok(
        await callApi(world, editEvent, {
          method: "PATCH",
          path: `/api/events/${series.id}`,
          params: { id: String(series.id) },
          body,
        }),
      ).event;
    },
    /** The series' own Update website. */
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
    /** What the menu pages load: the sections, and the pop-up kitchens a chapter can pick. */
    async menu() {
      return ok(await callApi(world, getMenu, { path: "/api/menu" }));
    },
    async posMenu(name) {
      return ok(
        await callApi(world, createPosMenu, { method: "POST", path: "/api/pos-menus", body: { name, isDefault: true } }),
        201,
      ).posMenu;
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

/** A document the website shows (published), by type and a field's value. */
function published(world, type, field, value) {
  const get = (doc) => (field === "slug" ? doc.slug?.current : doc[field]);
  return world.sanity.view("published").find((doc) => doc._type === type && get(doc) === value);
}

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

  it("a chapter is drinks unless it is made food; a group follows its chapter", async () => {
    assert.equal(cocktails.kind, "bar");
    const food = await ops.section("Kitchen", { kind: "kitchen" });
    assert.equal(food.kind, "kitchen");
    const burgers = await ops.section("Burgers", { parentId: food._id, kind: "bar" });
    assert.equal(burgers.kind, "kitchen", "a group answers with its chapter's");
    await ops.create({ name: "Burger", price: "12", sectionId: burgers._id, placements: [{ channel: "digital", sectionId: burgers._id }] });
    await ops.updateWebsite();
    assert.equal(published(world, "menuSection", "slug", "kitchen").kind, "kitchen");
    assert.equal("kind" in published(world, "menuSection", "slug", "burgers"), false, "none on a group");
    assert.equal(published(world, "menuSection", "slug", "cocktails").kind, "bar");

    assert.equal((await ops.editSection(food, { kind: "bar" })).kind, "bar");
    await ops.updateWebsite();
    assert.equal(published(world, "menuSection", "slug", "kitchen").kind, "bar", "a chapter already on the website follows");
    await ops.editSection(food, { kind: "pizza" }, 400);
  });

  it("food stays off the till; a drink still gets its POS menu", async () => {
    await ops.posMenu("Bar till");
    const food = await ops.section("Kitchen", { kind: "kitchen" });
    const fries = await ops.create({
      name: "Fries",
      price: "6",
      sectionId: food._id,
      placements: [{ channel: "digital", sectionId: food._id }],
    });
    assert.deepEqual(fries.placements.map((row) => row.channel), ["digital"]);
    assert.deepEqual(fries.posMenus, []);
    const edited = await ops.edit(fries, { price: "6.5" });
    assert.deepEqual(edited.placements.map((row) => row.channel), ["digital"], "still none after an edit");
    const chips = await ops.create({ name: "Chips", price: "5", sectionId: food._id, onPrintMenu: false });
    assert.equal(chips.placements.some((row) => row.channel === "pos"), false, "nor from the section alone");

    const spritz = await ops.create({ name: "Spritz", price: "9", sectionId: cocktails._id });
    assert.ok(spritz.placements.some((row) => row.channel === "pos"), "a drink is on the till");
  });

  it("a section already on the website follows ops: name, line, order and where it sits", async () => {
    const beer = await ops.section("Draught Beer", { parentId: cocktails._id });
    await ops.create({ name: "Pilsner", price: "6", sectionId: beer._id });
    await ops.updateWebsite();
    const before = published(world, "menuSection", "slug", "draught-beer");
    assert.equal(before.title, "Draught Beer");
    assert.equal(before.parent._ref, published(world, "menuSection", "slug", "cocktails")._id);

    const chapter = await ops.section("Beer", { subtitle: "On draught and in bottles." });
    await ops.editSection(beer, { title: "On Draught", parentId: chapter._id, orderRank: 40 });
    await ops.editSection(cocktails, { title: "Our Cocktails", subtitle: "Made up here." });
    await ops.updateWebsite();
    const after = published(world, "menuSection", "slug", "draught-beer");
    assert.equal(after._id, before._id, "the same document");
    assert.equal(after.title, "On Draught");
    assert.equal(after.slug.current, "draught-beer", "its address stays");
    assert.equal(after.orderRank, "0|i00000040s:");
    const parent = published(world, "menuSection", "slug", "beer");
    assert.equal(after.parent._ref, parent._id);
    assert.equal(parent.subtitle, "On draught and in bottles.");
    const renamed = published(world, "menuSection", "slug", "cocktails");
    assert.equal(renamed.title, "Our Cocktails");
    assert.equal(renamed.subtitle, "Made up here.");
    assert.ok(drink(await websiteMenu(world), "On Draught", "Pilsner"));
    assert.equal((await ops.updateWebsite()).published, 0, "and then nothing is left to publish");
  });

  it("a food chapter can belong to a pop-up kitchen, and the website's section points at its series", async () => {
    const night = await ops.series({ name: "Jazz Night", startsOn: "2027-01-08", repeatUnit: "once" });
    const pickle = await ops.series({ name: "Chez Pickle", description: "Smashed burgers.", category: "popup" });
    assert.deepEqual((await ops.menu()).popups, [{ id: String(pickle.id), name: "Chez Pickle" }], "only pop-up kitchens");

    await ops.section("Not a pop-up", { kind: "kitchen", popupSeriesId: String(night.id) }).then(
      () => assert.fail("a night is not a pop-up kitchen"),
      () => {},
    );
    await ops.section("Drinks pop-up", { kind: "bar", popupSeriesId: String(pickle.id) }).then(
      () => assert.fail("drinks can't belong to a pop-up kitchen"),
      () => {},
    );
    const food = await ops.section("Chez Pickle", { kind: "kitchen", popupSeriesId: String(pickle.id) });
    assert.equal(food.popupSeriesId, String(pickle.id));
    const burgers = await ops.section("Burgers", { parentId: food._id });
    assert.equal(burgers.popupSeriesId, String(pickle.id), "a group answers with its chapter's");
    assert.equal((await ops.editSection(food, { title: "Chez Pickle" })).popupSeriesId, String(pickle.id), "kept when not sent");
    await ops.create({ name: "OG Burger", price: "14", sectionId: burgers._id, placements: [{ channel: "digital", sectionId: burgers._id }] });

    // Not on the website yet: the section goes up without pointing at it.
    await ops.updateWebsite();
    assert.equal("popupSeries" in published(world, "menuSection", "slug", "chez-pickle"), false);

    await ops.publishSeries(pickle);
    await ops.updateWebsite();
    const section = published(world, "menuSection", "slug", "chez-pickle");
    assert.equal(section.popupSeries._ref, "series-chez-pickle");
    assert.equal(section.kind, "kitchen");
    assert.equal("popupSeries" in published(world, "menuSection", "slug", "burgers"), false, "none on a group");
    assert.equal((await ops.updateWebsite()).published, 0, "nothing left to publish");

    // No longer a pop-up kitchen: the chapter lets go on the next update.
    await ops.editSeries(pickle, { category: "event" });
    assert.deepEqual((await ops.menu()).popups, []);
    await ops.updateWebsite();
    assert.equal("popupSeries" in published(world, "menuSection", "slug", "chez-pickle"), false);

    assert.equal((await ops.editSection(food, { kind: "bar" })).popupSeriesId, null, "drinks carry none");
  });

  it("Update website with nothing changed publishes nothing", async () => {
    await ops.updateWebsite();
    const again = await ops.updateWebsite();
    assert.equal(again.published, 0);
  });
});
