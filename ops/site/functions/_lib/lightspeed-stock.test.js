import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  DEFAULT_LIGHTSPEED_MENU,
  LIGHTSPEED_ITEM_HEADERS,
  LIGHTSPEED_UPDATE_HEADERS,
  accountingGroupForDrink,
  assignedLightspeedSku,
  collectMenuItems,
  drinkTypeFromLightspeedRow,
  hasItemLibraryHeaders,
  lightspeedItemImportCsv,
  lightspeedItemUpdateCsv,
  lightspeedMenuLayoutCsv,
  matchLightspeedRows,
  menuItemFromLightspeed,
  menuLayoutScreens,
  menuPatchesFromMatch,
  menuScreenPath,
  mergeArchiveEntries,
  parseArchiveEntries,
  parseLightspeedCsv,
  parseLightspeedItemCsv,
  partitionLightspeedOnly,
  rankByName,
  removeArchiveSkus,
  resolveManualLinks,
  storedLightspeedSku,
  summarizeMatch,
} from "./lightspeed-stock.js";

const fixtures = dirname(fileURLToPath(import.meta.url));
const itemCsv = readFileSync(
  join(fixtures, "fixtures/lightspeed-items.csv"),
  "utf8",
);
const libraryCsv = readFileSync(
  join(fixtures, "fixtures/lightspeed-item-library.csv"),
  "utf8",
);
const stockCsv = readFileSync(
  join(fixtures, "fixtures/lightspeed-stock-levels.csv"),
  "utf8",
);

const menuItems = [
  {
    _id: "10",
    id: "10",
    name: "Negroni",
    drinkType: "cocktail",
    price: "10",
    lightspeedSku: "114",
    section: { title: "Bitter", parentTitle: "Classic Cocktails" },
  },
  {
    _id: "11",
    id: "11",
    name: "Gwenda",
    drinkType: "cocktail",
    price: "13",
    section: { title: "Signature Cocktails" },
  },
  {
    _id: "12",
    id: "12",
    name: "House gin",
    drinkType: "pour",
    price: "6.5",
    lightspeedSku: "HOUSEGIN",
    section: { title: "Gins", parentTitle: "Spirits" },
  },
  {
    _id: "13",
    id: "13",
    name: "St-Germain",
    drinkType: "pour",
    price: "7",
    section: { title: "Liqueurs & Amari", parentTitle: "Spirits" },
  },
];

describe("parseLightspeedCsv", () => {
  it("reads a K-Series item export", () => {
    const rows = parseLightspeedCsv(itemCsv);
    assert.equal(rows.length, 4);
    assert.equal(rows.find((row) => row.sku === "CAMPARI")?.name, "Campari");
    assert.equal(rows.find((row) => row.sku === "NEGRONI")?.type, "Combo");
  });

  it("reads the official semicolon item-library export", () => {
    const rows = parseLightspeedItemCsv(libraryCsv);
    assert.equal(rows.find((row) => row.sku === "114")?.name, "Negroni");
    assert.equal(rows.find((row) => row.sku === "114")?.defaultPrice, 10);
    assert.equal(
      rows.find((row) => row.sku === "114")?.menuScreen,
      "Gwenda/Classic Cocktails/Bitter",
    );
    assert.equal(rows.find((row) => row.sku === "190")?.type, "modifier group");
    assert.equal(
      rows.find((row) => row.sku === "869E0JT3N")?.statisticsGroup,
      "Drinks/Ingredients",
    );
  });

  it("reads a stock-levels export with counted quantity", () => {
    const rows = parseLightspeedCsv(stockCsv);
    assert.equal(rows.find((row) => row.sku === "CAMPARI")?.quantity, 6);
  });

  it("rejects a stock-level file as a menu-item import", () => {
    assert.equal(hasItemLibraryHeaders(stockCsv), false);
    assert.throws(() => parseLightspeedItemCsv(stockCsv), /POS menu items/);
  });

  it("accepts BOM, aliases, and quoted commas", () => {
    const rows = parseLightspeedCsv(
      "\uFEFFsku,Product,Total quantity,uom\n" +
        '"A1","Vecchio Amaro, del Capo",3,"bottle"\n',
    );
    assert.equal(rows[0].sku, "A1");
    assert.equal(rows[0].name, "Vecchio Amaro, del Capo");
    assert.equal(rows[0].quantity, 3);
    assert.equal(rows[0].unit, "bottle");
  });

  it("rejects a file with no SKU or name column", () => {
    assert.throws(
      () => parseLightspeedCsv("Price,Qty\n1,2\n"),
      /SKU or Name/,
    );
  });
});

describe("matchLightspeedRows", () => {
  it("matches menu items by SKU then name, and leaves POS leftovers unmatched", () => {
    const result = matchLightspeedRows(
      menuItems,
      parseLightspeedItemCsv(libraryCsv),
    );
    assert.equal(
      result.matched.find((row) => row.via === "sku")?.ops.name,
      "Negroni",
    );
    assert.equal(
      result.matched.find((row) => row.via === "name")?.ops.name,
      "Gwenda",
    );
    assert.equal(result.opsOnly.map((row) => row.name).join(","), "St-Germain");
    assert.ok(result.lightspeedOnly.some((row) => row.sku === "869E0JT3N"));
    assert.ok(result.lightspeedOnly.some((row) => row.name === "Basil"));
    assert.ok(!result.lightspeedOnly.some((row) => row.name === "Negroni"));
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].ops.name, "House gin");
    assert.equal(result.conflicts[0].lightspeed.name, "Tanqueray");
  });

  it("matches close names by slug so a SKU stamp can align them", () => {
    const result = matchLightspeedRows(
      [{ _id: "13", id: "13", name: "St-Germain" }],
      [{ sku: "SG1", name: "St Germain" }],
    );
    assert.equal(result.matched.length, 1);
    assert.equal(result.matched[0].via, "slug");
    assert.equal(result.matched[0].lightspeed.sku, "SG1");
    assert.equal(result.conflicts.length, 0);
  });

  it("matches a Lightspeed button name to an ops drink", () => {
    const result = matchLightspeedRows(
      [{ _id: "20", name: "Amaro del Capo" }],
      [
        {
          sku: "869E0JRZM",
          name: "Amaro Del Capo Extra",
          buttonName: "Amaro del Capo",
        },
      ],
    );
    assert.equal(result.matched.length, 1);
    assert.equal(result.matched[0].via, "button");
    assert.equal(result.matched[0].ops.name, "Amaro del Capo");
  });

  it("does not treat hyphen vs space as a SKU name mismatch", () => {
    const result = matchLightspeedRows(
      [{ _id: "13", name: "St-Germain", lightspeedSku: "SG1" }],
      [{ sku: "SG1", name: "St Germain" }],
    );
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.matched[0].via, "sku");
  });
});

describe("menuPatchesFromMatch", () => {
  it("stamps real Lightspeed SKUs onto matches; ops-only stays missing without a fake SKU", () => {
    const patches = menuPatchesFromMatch(
      matchLightspeedRows(menuItems, parseLightspeedItemCsv(libraryCsv)),
    );
    assert.equal(patches.find((row) => row.id === "10")?.lightspeedStatus, "matched");
    assert.equal(patches.find((row) => row.id === "10")?.lightspeedSku, "114");
    assert.equal(patches.find((row) => row.id === "12")?.lightspeedStatus, "mismatch");
    assert.equal(patches.find((row) => row.id === "13")?.lightspeedStatus, "missing");
    assert.equal(patches.find((row) => row.id === "13")?.lightspeedSku, undefined);
  });
});

describe("resolveManualLinks", () => {
  it("pairs a leftover SKU with an unmatched ops drink", () => {
    const patches = resolveManualLinks(
      menuItems,
      parseLightspeedItemCsv(libraryCsv),
      [{ itemId: "13", sku: "869e0jtfx", adoptName: true }],
    );
    assert.equal(patches.length, 1);
    assert.equal(patches[0].id, "13");
    assert.equal(patches[0].lightspeedSku, "869E0JTFX");
    assert.equal(patches[0].lightspeedName, "Jameson Irish Whiskey");
    assert.equal(patches[0].lightspeedStatus, "matched");
    assert.equal(patches[0].name, "Jameson Irish Whiskey");
    assert.equal(patches[0].adoptName, true);
  });

  it("rejects a SKU that already belongs to another drink", () => {
    assert.throws(
      () =>
        resolveManualLinks(menuItems, parseLightspeedItemCsv(libraryCsv), [
          { itemId: "13", sku: "114" },
        ]),
      /already on Negroni/,
    );
  });

  it("ranks close names first for the match picker", () => {
    const ranked = rankByName("Amaro Del Capo", [
      { name: "Negroni" },
      { name: "Amaro del Capo" },
      { name: "Basil" },
    ]);
    assert.equal(ranked[0].name, "Amaro del Capo");
  });
});

describe("lightspeed item import", () => {
  it("emits the official semicolon header for ops-only drinks", () => {
    const csv = lightspeedItemImportCsv([menuItems[3]], "Gwenda Next");
    const header = csv.split("\n")[0];
    assert.equal(header, LIGHTSPEED_ITEM_HEADERS.join(";"));
    assert.match(csv, /Item;7;;Alcoholic Drinks;Gwenda Next\/Spirits\/Liqueurs & Amari/);
    assert.match(csv, /LOCAL/);
    assert.doesNotMatch(csv, /Negroni/);
  });

  it("reuses a stored Lightspeed SKU", () => {
    assert.equal(assignedLightspeedSku({ lightspeedSku: "114" }), "114");
    assert.equal(storedLightspeedSku({ lightspeedSku: "114" }), "114");
    assert.equal(storedLightspeedSku({ name: "Gwenda" }), "");
  });

  it("emits an in-place item update without Menu/Screen", () => {
    const csv = lightspeedItemUpdateCsv([menuItems[0]]);
    assert.equal(csv.split("\n")[0], LIGHTSPEED_UPDATE_HEADERS.join(";"));
    assert.match(csv, /^SKU;Name;Type;Default price/);
    assert.match(csv, /114;Negroni;Item;10;Cocktails;Negroni;LOCAL/);
    assert.doesNotMatch(csv, /Menu\/Screen/);
    assert.doesNotMatch(csv, /Classic Cocktails/);
  });

  it("flattens nested sections for export", () => {
    const items = collectMenuItems([
      {
        title: "Classic Cocktails",
        items: [],
        subsections: [
          {
            title: "Bitter",
            parentTitle: "Classic Cocktails",
            items: [menuItems[0]],
          },
        ],
      },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "Negroni");
    assert.equal(items[0].section.title, "Bitter");
  });

  it("builds Menu/Screen and layout Screens from ops sections", () => {
    assert.equal(
      menuScreenPath(menuItems[0], DEFAULT_LIGHTSPEED_MENU),
      "Gwenda Next/Classic Cocktails/Bitter",
    );
    assert.equal(menuLayoutScreens(menuItems[0]), "Classic Cocktails##Bitter");
    assert.equal(menuLayoutScreens(menuItems[1]), "Signature Cocktails");
    assert.equal(accountingGroupForDrink(menuItems[0]), "Cocktails");
    assert.equal(accountingGroupForDrink(menuItems[3]), "Alcoholic Drinks");
  });

  it("emits a menu layout for every ops drink; archive CSV is only marked leftovers", () => {
    const match = matchLightspeedRows(menuItems, parseLightspeedItemCsv(libraryCsv));
    const preview = summarizeMatch(match, "Gwenda Next");
    assert.match(preview.menuLayoutCsv, /^SKU;Screens\n/);
    assert.match(preview.menuLayoutCsv, /114;Classic Cocktails##Bitter/);
    assert.match(preview.itemImportCsv, /St-Germain/);
    assert.doesNotMatch(preview.itemImportCsv, /;Negroni;/);
    assert.ok(preview.lightspeedOnly.some((row) => row.name === "Basil"));
    assert.equal(preview.archive.length, 0);
    assert.doesNotMatch(preview.archiveSkuCsv, /Basil/);

    const marked = summarizeMatch(match, "Gwenda Next", {
      archiveEntries: [{ sku: "869E0JT3N", name: "Basil" }],
    });
    assert.match(marked.archiveSkuCsv, /869E0JT3N;Basil/);
    assert.ok(marked.archive.some((row) => row.sku === "869E0JT3N"));
    assert.equal(
      marked.lightspeedOnly.some((row) => row.sku === "869E0JT3N"),
      false,
    );
  });
});

describe("Lightspeed leftover decisions", () => {
  it("guesses drink type from accounting group", () => {
    assert.equal(
      drinkTypeFromLightspeedRow({ accountingGroup: "Cocktails" }),
      "cocktail",
    );
    assert.equal(drinkTypeFromLightspeedRow({ accountingGroup: "Beer" }), "beer");
    assert.equal(
      drinkTypeFromLightspeedRow({ accountingGroup: "Non-Alcoholic Drinks" }),
      "packaged",
    );
    assert.equal(
      drinkTypeFromLightspeedRow({ accountingGroup: "Alcoholic Drinks" }),
      "pour",
    );
    assert.equal(drinkTypeFromLightspeedRow({ accountingGroup: "Food" }), "packaged");
  });

  it("builds a menu item payload from a POS leftover", () => {
    const item = menuItemFromLightspeed({
      sku: "869e0jtfx",
      name: "Jameson Irish Whiskey",
      sectionId: "22",
      accountingGroup: "Alcoholic Drinks",
      defaultPrice: 5.5,
    });
    assert.equal(item.name, "Jameson Irish Whiskey");
    assert.equal(item.sectionId, "22");
    assert.equal(item.drinkType, "pour");
    assert.equal(item.price, "5.5");
    assert.equal(item.lightspeedSku, "869E0JTFX");
    assert.equal(item.lightspeedStatus, "matched");
    assert.equal(item.onPrintMenu, false);
    assert.equal(item.onDigitalMenu, false);

    const both = menuItemFromLightspeed({
      sku: "114",
      name: "Negroni",
      sectionId: "10",
      onPrintMenu: true,
      onDigitalMenu: true,
    });
    assert.equal(both.onPrintMenu, true);
    assert.equal(both.onDigitalMenu, true);
  });

  it("parses, merges, and removes archive SKUs", () => {
    const parsed = parseArchiveEntries('[{"sku":"svc1","name":"Service charge"}]');
    assert.deepEqual(parsed, [{ sku: "SVC1", name: "Service charge" }]);
    const merged = mergeArchiveEntries(parsed, [
      { sku: "869e0jt3n", name: "Basil" },
      { sku: "SVC1", name: "dup" },
    ]);
    assert.equal(merged.length, 2);
    assert.deepEqual(removeArchiveSkus(merged, ["svc1"]).map((row) => row.sku), [
      "869E0JT3N",
    ]);
  });

  it("splits POS-only rows into decide vs archive", () => {
    const rows = parseLightspeedItemCsv(libraryCsv).filter(
      (row) => row.sku === "869E0JT3N" || row.sku === "SVC1",
    );
    const split = partitionLightspeedOnly(rows, [{ sku: "SVC1" }]);
    assert.deepEqual(
      split.archive.map((row) => row.sku),
      ["SVC1"],
    );
    assert.deepEqual(
      split.pending.map((row) => row.sku),
      ["869E0JT3N"],
    );
  });
});
