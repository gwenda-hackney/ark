import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPlacementDerivedFields,
  ensurePosForGuest,
  normalizePlacements,
  placementsFromLegacyItem,
  resolvePlacementsForWrite,
} from "./menu-placements.js";
import { changedFields, websiteProjection } from "./reconcile.js";

describe("menu placements", () => {
  it("normalizes at most one print and digital row", () => {
    const rows = normalizePlacements([
      { channel: "print", sectionId: "1" },
      { channel: "print", sectionId: "2" },
      { channel: "digital", sectionId: "3" },
      { channel: "pos", posMenuId: "9", posScreen: "Spritz" },
    ]);
    assert.equal(rows.filter((row) => row.channel === "print").length, 1);
    assert.equal(rows.find((row) => row.channel === "print")?.sectionId, "2");
    assert.equal(rows.find((row) => row.channel === "digital")?.sectionId, "3");
    assert.equal(rows.filter((row) => row.channel === "pos").length, 1);
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
