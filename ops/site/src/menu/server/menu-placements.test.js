import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyPlacementDerivedFields,
  ensurePosForGuest,
  normalizePlacements,
  placementsFromLegacyItem,
  resolvePlacementsForWrite,
} from "./menu-placements.js";
import { changedFields, websiteProjection } from "../../inventory/server/reconcile.js";

describe("menu placements", () => {
  it("keeps every row per channel, dropping only exact repeats", () => {
    const rows = normalizePlacements([
      { channel: "print", sectionId: "1" },
      { channel: "print", sectionId: "2" },
      { channel: "print", sectionId: "2" },
      { channel: "digital", sectionId: "3" },
      { channel: "pos", posMenuId: "9", posScreen: "Spritz" },
      { channel: "pos", posMenuId: "9", posScreen: "Mocktails" },
      { channel: "pos", posMenuId: "9", posScreen: "spritz" },
    ]);
    assert.deepEqual(
      rows.filter((row) => row.channel === "print").map((row) => row.sectionId),
      ["1", "2"],
    );
    assert.equal(rows.find((row) => row.channel === "digital")?.sectionId, "3");
    assert.deepEqual(
      rows.filter((row) => row.channel === "pos").map((row) => row.posScreen),
      ["Spritz", "Mocktails"],
    );
  });

  it("derives the legacy flags and section from the first row of each channel", () => {
    const item = applyPlacementDerivedFields({
      placements: [
        { channel: "digital", sectionId: "7" },
        { channel: "print", sectionId: "5" },
        { channel: "print", sectionId: "6" },
        { channel: "pos", posMenuId: "9", posScreen: "Spritz" },
        { channel: "pos", posMenuId: "9", posScreen: "Mocktails" },
      ],
    });
    assert.equal(item.sectionId, "5");
    assert.equal(item.onPrintMenu, true);
    assert.equal(item.lightspeedMenuScreen, "Spritz,Mocktails");
    assert.equal(item.placements.length, 5);
    assert.deepEqual(item.posMenus, [{ id: "9", name: "" }]);
  });

  it("builds legacy placements and derives flags", () => {
    const placements = placementsFromLegacyItem(
      {
        sectionId: "10",
        onPrintMenu: true,
        onDigitalMenu: false,
        lightspeedMenuScreen: "Soft Drinks",
        posMenus: [{ id: "5", name: "Fall 2026" }],
      },
      { defaultPosMenuIds: ["5"] },
    );
    const item = applyPlacementDerivedFields({
      name: "Coca-Cola",
      placements,
    });
    assert.equal(item.onPrintMenu, true);
    assert.equal(item.onDigitalMenu, false);
    assert.equal(item.sectionId, "10");
    assert.equal(item.posMenus?.[0]?.id, "5");
    assert.equal(item.lightspeedMenuScreen, "Soft Drinks");
  });

  it("adds a default POS row when guest is enabled", () => {
    const rows = ensurePosForGuest(
      [{ channel: "digital", sectionId: "1" }],
      {
        defaultPosMenuIds: ["7"],
        item: { section: { title: "Spritz" } },
      },
    );
    assert.ok(rows.some((row) => row.channel === "pos"));
    assert.equal(
      rows.find((row) => row.channel === "pos")?.posScreen,
      "Spritz",
    );
  });

  it("clears placements when archived", () => {
    const rows = resolvePlacementsForWrite(
      { archived: true },
      {
        existingItem: {
          placements: [{ channel: "pos", posMenuId: "1", posScreen: "Beers" }],
        },
      },
    );
    assert.deepEqual(rows, []);
  });
});

describe("website projection vs placements", () => {
  it("uses digital placement section and ignores cocktail ABV noise", () => {
    const item = {
      name: "Negroni",
      drinkType: "cocktail",
      abv: "25.8%",
      volume: "90 ml",
      sectionId: "1",
      placements: [
        { channel: "digital", sectionId: "22" },
        { channel: "pos", posMenuId: "3", posScreen: "Classic Cocktails/Bitter" },
      ],
      onDigitalMenu: true,
    };
    const payload = websiteProjection(item);
    assert.equal(payload.sectionId, "22");
    assert.equal(payload.abv, "");
    assert.equal(payload.volume, "");
    assert.deepEqual(
      changedFields(payload, {
        ...payload,
        abv: "25.8%",
        volume: "90 ml",
      }),
      [],
    );
  });
});
