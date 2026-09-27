import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import {
  DEFAULT_LIGHTSPEED_MENU,
  LIGHTSPEED_COMBINED_IMPORT_HEADERS,
  LIGHTSPEED_IMPORT_USED_HEADERS,
  LIGHTSPEED_OPS_SKU_PREFIX,
  accountingGroupForDrink,
  assignedLightspeedSku,
  collectMenuItems,
  classifyLightspeedRow,
  drinkTypeFromLightspeedRow,
  hasItemLibraryHeaders,
  assertLightspeedFormattedExport,
  missingLightspeedItemHeaders,
  isServiceChargeRow,
  lightspeedCombinedImportPreviewRows,
  lightspeedCombinedItemImportCsv,
  expandMenuItemsForLightspeedExport,
  inventoryExclusiveForExport,
  lightspeedInventoryItemCsv,
  lightspeedImportPreviewRow,
  lightspeedItemImportCsv,
  lightspeedItemUpdateCsv,
  lightspeedMenuLayoutCsv,
  maxPrefixedLightspeedSku,
  newlyAllocatedLightspeedSkus,
  withAllocatedLightspeedSkus,
  withInventoryExportIds,
  matchLightspeedCatalog,
  matchLightspeedRows,
  menuItemFromLightspeed,
  menuLayoutScreens,
  menuPatchesFromMatch,
  menuScreenPath,
  menuScreenPathForMenus,
  itemOnPosMenu,
  defaultPosScreenForItem,
  mergeArchiveEntries,
  parseArchiveEntries,
  parseLightspeedCsv,
  parseLightspeedItemCsv,
  partitionLightspeedOnly,
  parsePosScreenInput,
  posScreenPaths,
  serializePosScreens,
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

  it("accepts the official formatted item-library headers", () => {
    assert.deepEqual(missingLightspeedItemHeaders(libraryCsv), []);
    const rows = assertLightspeedFormattedExport(libraryCsv);
    assert.equal(rows.find((row) => row.sku === "114")?.name, "Negroni");
  });

  it("rejects a stock-level file as a formatted item-list export", () => {
    assert.ok(missingLightspeedItemHeaders(stockCsv).includes("Type"));
    assert.throws(
      () => assertLightspeedFormattedExport(stockCsv),
      /missing columns/,
    );
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

  it("treats a pint SKU as the same drink, not a name mismatch", () => {
    const result = matchLightspeedRows(
      [{ _id: "1", name: "Baladin L'Ippa", lightspeedSku: "P" }],
      [{ sku: "P", name: "Baladin L'Ippa (pint)" }],
    );
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.matched.length, 1);
  });
});

describe("menuPatchesFromMatch", () => {
  it("stamps real Lightspeed SKUs onto matches; ops-only stays missing without a fake SKU", () => {
    const patches = menuPatchesFromMatch(
      matchLightspeedRows(menuItems, parseLightspeedItemCsv(libraryCsv)),
    );
    assert.equal(patches.find((row) => row.id === "10")?.lightspeedStatus, "matched");
    assert.equal(patches.find((row) => row.id === "10")?.lightspeedSku, "114");
    assert.equal(
      patches.find((row) => row.id === "10")?.lightspeedMenuScreen,
      "Classic Cocktails/Bitter",
    );
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
    assert.equal(patches[0].lightspeedName, "Jameson");
    assert.equal(
      patches[0].lightspeedMenuScreen,
      "Spirits/Whiskey & Brandy",
    );
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
  it("preview rows match the CSV cell order", () => {
    const item = {
      ...menuItems[0],
      lightspeedMenuScreen: "Classic Cocktails/Bitter",
      posMenus: [{ id: "1", name: "Fall 2026" }],
    };
    const row = lightspeedImportPreviewRow(item, ["Fall 2026"]);
    assert.equal(row.SKU, "114");
    assert.equal(row.Name, "Negroni");
    assert.equal(row.Type, "Item");
    assert.equal(row["Price"], "10");
    assert.equal(row["Accounting group"], "Cocktails");
    assert.equal(row["Menu/Screen"], "Fall 2026/Classic Cocktails/Bitter");
    assert.equal(row["Button name"], "Negroni");
    assert.equal(row["Sharing mode"], "LOCAL");
    assert.equal(row["Parent SKU"], undefined);
    const dataLine = lightspeedItemImportCsv([item], ["Fall 2026"]).trim().split("\n")[1];
    assert.deepEqual(
      LIGHTSPEED_IMPORT_USED_HEADERS.map((header) => row[header]),
      dataLine.split(";"),
    );
  });

  it("emits the official New items import sheet for ops-only drinks", () => {
    const csv = lightspeedItemImportCsv([menuItems[3]], "Gwenda Next");
    const header = csv.split("\n")[0];
    assert.equal(header, LIGHTSPEED_IMPORT_USED_HEADERS.join(";"));
    assert.deepEqual(LIGHTSPEED_IMPORT_USED_HEADERS, [
      "SKU",
      "Name",
      "Type",
      "Price",
      "Accounting group",
      "Menu/Screen",
      "Button name",
      "Button color",
      "Sharing mode",
    ]);
    assert.match(csv, /St-Germain;Item;7;Alcoholic Drinks;/);
    assert.match(csv, /LOCAL/);
    assert.doesNotMatch(csv, /Negroni/);
    assert.doesNotMatch(csv, /Parent SKU/);
    assert.doesNotMatch(csv, /Docket name/);
  });

  it("reuses a stored Lightspeed SKU and does not invent codes without allocation", () => {
    assert.equal(assignedLightspeedSku({ lightspeedSku: "114" }), "114");
    assert.equal(storedLightspeedSku({ lightspeedSku: "114" }), "114");
    assert.equal(storedLightspeedSku({ name: "Gwenda" }), "");
    assert.equal(assignedLightspeedSku({ name: "Tramontana", _id: "8" }), "");
  });

  it("allocates zero-padded G-prefixed SKUs and does not continue Lightspeed numbers", () => {
    assert.equal(LIGHTSPEED_OPS_SKU_PREFIX, "G");
    assert.equal(maxPrefixedLightspeedSku(["114", "189", "G3", "G0012", "TONIC"]), 12);
    const allocated = withAllocatedLightspeedSkus(
      [
        { _id: "20", name: "Zulu", lightspeedSku: "" },
        { _id: "10", name: "Alpha", lightspeedSku: "" },
        { _id: "11", name: "Negroni", lightspeedSku: "114" },
        { _id: "12", name: "Kept", lightspeedSku: "G0002" },
      ],
      { reserved: ["189", "G0001", "869E0JT06"] },
    );
    assert.equal(allocated.find((row) => row._id === "11")?.lightspeedSku, "114");
    assert.equal(allocated.find((row) => row._id === "12")?.lightspeedSku, "G0002");
    // G0001 reserved, G0002 stored → next free is G0003, G0004 (not 190).
    assert.equal(allocated.find((row) => row._id === "10")?.lightspeedSku, "G0003");
    assert.equal(allocated.find((row) => row._id === "20")?.lightspeedSku, "G0004");
    const created = newlyAllocatedLightspeedSkus(
      [
        { _id: "20", name: "Zulu" },
        { _id: "10", name: "Alpha" },
        { _id: "11", name: "Negroni", lightspeedSku: "114" },
        { _id: "12", name: "Kept", lightspeedSku: "G0002" },
      ],
      allocated,
    );
    assert.equal(created.length, 2);
    assert.deepEqual(
      Object.fromEntries(created.map((row) => [row.id, row.lightspeedSku])),
      { "10": "G0003", "20": "G0004" },
    );
  });

  it("emits an in-place item update with the selected menu and ops screens", () => {
    const csv = lightspeedItemUpdateCsv(
      [{ ...menuItems[0], lightspeedMenuScreen: "Gwenda/Classic Cocktails/Bitter" }],
      "Fall 2026",
    );
    assert.equal(csv.split("\n")[0], LIGHTSPEED_IMPORT_USED_HEADERS.join(";"));
    assert.match(csv, /^SKU;Name;Type;Price;Accounting group;Menu\/Screen/);
    assert.match(
      csv,
      /114;Negroni;Item;10;Cocktails;Fall 2026\/Classic Cocktails\/Bitter;Negroni;BLUE;LOCAL/,
    );
  });

  it("writes Fall 2026 and Gwenda Menu/Screen for overlaps", () => {
    const overlap = {
      ...menuItems[0],
      lightspeedMenuScreen: "Classic Cocktails/Bitter",
      posMenus: [
        { id: "1", name: "Fall 2026" },
        { id: "2", name: "Gwenda" },
      ],
    };
    assert.equal(itemOnPosMenu(overlap, "Fall 2026"), true);
    assert.equal(itemOnPosMenu(overlap, "Gwenda"), true);
    assert.equal(
      menuScreenPathForMenus(overlap, ["Fall 2026", "Gwenda"]),
      "Fall 2026/Classic Cocktails/Bitter,Gwenda/Classic Cocktails/Bitter",
    );
    const csv = lightspeedItemImportCsv([overlap], ["Fall 2026", "Gwenda"]);
    assert.match(
      csv,
      /Fall 2026\/Classic Cocktails\/Bitter,Gwenda\/Classic Cocktails\/Bitter/,
    );
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

  it("leaves Menu/Screen blank only when section and drink type have no screen map", () => {
    const bare = { name: "Oddity", lightspeedMenuScreen: "" };
    assert.equal(menuScreenPath(bare, DEFAULT_LIGHTSPEED_MENU), "");
    assert.equal(menuLayoutScreens(bare), "");
    assert.equal(accountingGroupForDrink(menuItems[0]), "Cocktails");
    assert.equal(accountingGroupForDrink(menuItems[3]), "Alcoholic Drinks");
  });

  it("reuses Lightspeed Menu/Screen for layout and remaps it onto a new menu", () => {
    const stored = {
      ...menuItems[3],
      lightspeedMenuScreen: "Gwenda/Spirits/Liqueurs & Amari",
    };
    assert.equal(
      menuScreenPath(stored, "Fall 2026"),
      "Fall 2026/Spirits/Liqueurs & Amari",
    );
    assert.equal(menuLayoutScreens(stored, "Fall 2026"), "Spirits##Liqueurs & Amari");
    const spritz = {
      name: "Aperol Spritz",
      lightspeedMenuScreen: "Gwenda/Spritz",
    };
    assert.equal(menuScreenPath(spritz, "Fall 2026"), "Fall 2026/Spritz");
    assert.equal(menuLayoutScreens(spritz, "Fall 2026"), "Spritz");
    assert.equal(
      defaultPosScreenForItem({ section: { title: "Spritz" } }),
      "Spritz",
    );
    const both = {
      name: "Tonic",
      lightspeedSku: "TONIC",
      lightspeedMenuScreen: "Gwenda/Signature Cocktails,Gwenda/Soft Drinks",
    };
    assert.equal(
      menuScreenPath(both, "Fall 2026"),
      "Fall 2026/Signature Cocktails,Fall 2026/Soft Drinks",
    );
    assert.equal(
      lightspeedMenuLayoutCsv([both], "Fall 2026"),
      "SKU;Screens\nTONIC;Signature Cocktails\nTONIC;Soft Drinks\n",
    );
    const mixed = {
      name: "Overlap",
      lightspeedSku: "OV1",
      lightspeedMenuScreen: "Gwenda/Beers,Fall 2026/Signature Cocktails,Fall 2026/Soft Drinks",
    };
    assert.equal(
      menuScreenPath(mixed, "Fall 2026"),
      "Fall 2026/Beers,Fall 2026/Signature Cocktails,Fall 2026/Soft Drinks",
    );
    assert.equal(
      lightspeedMenuLayoutCsv([mixed], "Fall 2026"),
      "SKU;Screens\nOV1;Beers\nOV1;Signature Cocktails\nOV1;Soft Drinks\n",
    );
    const managed = {
      name: "Negroni",
      lightspeedSku: "114",
      lightspeedMenuScreen: "Classic Cocktails/Bitter,Signature Cocktails",
    };
    assert.equal(
      menuScreenPath(managed, "Fall 2026"),
      "Fall 2026/Classic Cocktails/Bitter,Fall 2026/Signature Cocktails",
    );
    assert.equal(
      lightspeedMenuLayoutCsv([managed], "Fall 2026"),
      "SKU;Screens\n114;Classic Cocktails##Bitter\n114;Signature Cocktails\n",
    );
  });

  it("suggests a POS screen from the print section when none is stored", () => {
    assert.equal(
      defaultPosScreenForItem({ section: { title: "Negroni" } }),
      "Classic Cocktails/Bitter",
    );
    assert.equal(
      defaultPosScreenForItem({ section: { title: "Agave" } }),
      "Spirits/Tequila",
    );
    assert.equal(
      defaultPosScreenForItem({ section: { title: "Free of Spirit" } }),
      "Mocktails",
    );
    assert.deepEqual(
      posScreenPaths({ section: { title: "Our Formulas" } }),
      ["Signature Cocktails"],
    );
    assert.equal(
      menuScreenPath(
        { section: { title: "Bottled Beer" }, lightspeedMenuScreen: "" },
        "Fall 2026",
      ),
      "Fall 2026/Beers",
    );
  });

  it("parses typed POS screens and stores them without a menu prefix", () => {
    assert.equal(parsePosScreenInput("Spirits##Liqueurs & Amari"), "Spirits/Liqueurs & Amari");
    assert.equal(
      parsePosScreenInput("Gwenda/Spirits/Liqueurs & Amari"),
      "Spirits/Liqueurs & Amari",
    );
    assert.equal(
      serializePosScreens(["Soft Drinks", "Spirits/Liqueurs & Amari", "soft drinks"]),
      "Soft Drinks,Spirits/Liqueurs & Amari",
    );
    assert.deepEqual(
      posScreenPaths({ lightspeedMenuScreen: "Classic Cocktails/Bitter,Soft Drinks" }),
      ["Classic Cocktails/Bitter", "Soft Drinks"],
    );
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
    const withScreen = menuItemFromLightspeed({
      sku: "114",
      name: "Negroni",
      menuScreen: "Gwenda/Classic Cocktails/Bitter",
    });
    assert.equal(withScreen.lightspeedMenuScreen, "Classic Cocktails/Bitter");

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

describe("Lightspeed catalog roles", () => {
  it("splits sellable drinks from stock and system rows", () => {
    assert.equal(classifyLightspeedRow({ name: "Negroni", type: "item" }), "sellable");
    assert.equal(
      classifyLightspeedRow({
        name: "Basil",
        type: "item",
        accountingGroup: "Food",
        defaultPrice: 0,
        statisticsGroup: "Drinks/Ingredients",
      }),
      "stock",
    );
    assert.equal(
      classifyLightspeedRow({
        name: "Gwenda Beer Keg",
        type: "item",
        defaultPrice: 0,
        packageContent: "50",
      }),
      "stock",
    );
    assert.equal(
      classifyLightspeedRow({ name: "spritz", type: "modifier group" }),
      "system",
    );
    assert.equal(
      classifyLightspeedRow({ name: "Service charge 12.5%", type: "item" }),
      "system",
    );
    assert.equal(
      classifyLightspeedRow({
        name: "Gwenda Lager (pint)",
        type: "item",
        defaultPrice: 5.5,
        packageContent: "1.2276",
      }),
      "sellable",
    );
  });

  it("keeps pint and half as one ops drink, and stock off the sellable leftover list", () => {
    const catalog = matchLightspeedCatalog(
      {
        menuItems: [{ _id: "1", name: "Baladin L'Ippa", drinkType: "beer" }],
        inventory: [{ _id: "k", name: "Gwenda Beer Keg", kind: "beer" }],
      },
      [
        { sku: "P", name: "Baladin L'Ippa (pint)", type: "item", defaultPrice: 7.5 },
        { sku: "H", name: "Baladin L'Ippa (half)", type: "item", defaultPrice: 4 },
        {
          sku: "K",
          name: "Gwenda Beer Keg",
          type: "item",
          defaultPrice: 0,
          packageContent: "50",
        },
        { sku: "190", name: "spritz", type: "modifier group" },
      ],
    );
    assert.equal(catalog.matched.length, 1);
    assert.equal(catalog.matched[0].via, "serve");
    assert.equal(catalog.altServes.length, 1);
    assert.equal(catalog.altServes[0].lightspeed.sku, "H");
    assert.equal(catalog.lightspeedOnly.length, 0);
    assert.equal(catalog.stockMatched.length, 1);
    assert.equal(catalog.systemOnly.length, 1);
    assert.equal(catalog.unusedInventory.length, 0);
  });

  it("archives unused inventory leftovers, not recipe lines, kegs, or service charge", () => {
    const catalog = matchLightspeedCatalog(
      {
        menuItems: [
          {
            _id: "1",
            name: "Negroni",
            ingredients: [{ name: "Campari", inventoryId: "c" }],
          },
        ],
        inventory: [
          { _id: "c", name: "Campari", kind: "liqueur" },
          { _id: "g", name: "Gordon's Gin", kind: "liquor" },
          { _id: "k", name: "Gwenda Beer Keg", kind: "beer" },
        ],
      },
      [
        { sku: "CAM", name: "Campari", type: "item", defaultPrice: 0 },
        { sku: "123", name: "Gordon's Gin", type: "item", defaultPrice: 0 },
        { sku: "SVC1", name: "Service charge 12.5%", type: "item" },
        { sku: "191", name: "Gwenda Beer Keg", type: "item", defaultPrice: 0, packageContent: "50" },
      ],
    );
    assert.equal(isServiceChargeRow({ sku: "SVC1", name: "Service charge 12.5%" }), true);
    assert.deepEqual(
      catalog.unusedInventory.map((row) => row.name),
      ["Gordon's Gin"],
    );
    const preview = summarizeMatch(catalog);
    assert.equal(
      preview.archive.some((row) => row.sku === "123"),
      true,
    );
    assert.equal(
      preview.lightspeedOnly.some((row) => row.name === "Campari"),
      true,
    );
    assert.equal(
      preview.systemOnly.some((row) => row.sku === "SVC1"),
      true,
    );
    assert.equal(
      preview.archive.some((row) => row.sku === "SVC1"),
      false,
    );
    assert.equal(
      preview.archive.some((row) => /keg/i.test(row.name || "")),
      false,
    );
  });

  it("emits inventory Item rows without a POS screen", () => {
    const csv = lightspeedInventoryItemCsv([
      { name: "Gwenda Beer Keg", kind: "beer", defaultUnit: "L", lightspeedSku: "191" },
    ]);
    assert.match(csv, /^SKU;Name;Type;Price;Accounting group;Button name;Button color;Sharing mode;Package unit/);
    assert.match(csv, /191;Gwenda Beer Keg;Item;0;Beer;Gwenda Beer Keg;GRAY;LOCAL;l/);
    assert.doesNotMatch(csv, /Menu\/Screen/);
  });

  it("omits invalid Lightspeed package units like pinch and dash", () => {
    const csv = lightspeedInventoryItemCsv([
      {
        name: "Angostura Bitters",
        kind: "bitter",
        defaultUnit: "dash",
        lightspeedSku: "869E0JT0W",
      },
      {
        name: "Sea salt",
        kind: "garnish",
        defaultUnit: "pinch",
        lightspeedSku: "869E0JU2N",
      },
    ]);
    assert.match(csv, /869E0JT0W;Angostura Bitters;Item;0;Alcoholic Drinks;Angostura Bitters;GRAY;LOCAL;$/m);
    assert.match(csv, /869E0JU2N;Sea salt;Item;0;Food;Sea salt;GRAY;LOCAL;$/m);
  });

  it("combines menu drinks and inventory stock in one File import", () => {
    const stock = withInventoryExportIds([
      {
        id: "115",
        name: "Rooster Rojo Blanco Tequila",
        kind: "liquor",
        defaultUnit: "ml",
        lightspeedSku: "",
      },
      {
        id: "27",
        name: "Vecchio Amaro del Capo",
        kind: "liqueur",
        defaultUnit: "ml",
        lightspeedSku: "G0065",
      },
      {
        id: "99",
        name: "Tiny Rebel IPA",
        kind: "beer",
        defaultUnit: "ml",
        lightspeedSku: "G0110",
      },
    ]);
    const drinks = [
      {
        ...menuItems[0],
        lightspeedMenuScreen: "Classic Cocktails/Bitter",
      },
      {
        _id: "18",
        name: "Vecchio Amaro del Capo",
        drinkType: "pour",
        price: "5",
        lightspeedSku: "G0009",
        lightspeedMenuScreen: "Spirits/Liqueurs & Amari",
      },
      {
        _id: "40",
        name: "Tiny Rebel IPA",
        drinkType: "beer",
        price: "6.5",
        lightspeedSku: "G0022",
        lightspeedMenuScreen: "Beers",
      },
    ];
    const allocated = withAllocatedLightspeedSkus([...drinks, ...stock]);
    const drink = allocated.find((row) => row._id === "10");
    const bottle = allocated.find((row) => String(row._id) === "inv:115");
    assert.equal(drink?.lightspeedSku, "114");
    assert.match(String(bottle?.lightspeedSku || ""), /^G\d{4}$/);

    const allocatedDrinks = allocated.filter(
      (row) => !String(row._id).startsWith("inv:"),
    );
    const allocatedStock = allocated.filter((row) =>
      String(row._id).startsWith("inv:"),
    );
    assert.equal(inventoryExclusiveForExport(allocatedDrinks, allocatedStock).length, 1);
    assert.equal(
      inventoryExclusiveForExport(allocatedDrinks, allocatedStock)[0]?.name,
      "Rooster Rojo Blanco Tequila",
    );

    const preview = lightspeedCombinedImportPreviewRows(
      allocatedDrinks,
      allocatedStock,
      ["Fall 2026"],
    );
    // 3 drinks + Rooster only (Vecchio / Tiny Rebel stock dropped as same-name).
    assert.equal(preview.filter((row) => row._source === "menu").length, 3);
    assert.equal(preview.filter((row) => row._source === "inventory").length, 1);
    assert.equal(
      preview.filter((row) => row.Name === "Tiny Rebel IPA").length,
      1,
    );
    assert.equal(
      preview.filter((row) => row.Name === "Vecchio Amaro del Capo").length,
      1,
    );

    const csv = lightspeedCombinedItemImportCsv(
      allocatedDrinks,
      allocatedStock,
      ["Fall 2026"],
    );
    assert.equal(csv.split("\n")[0], LIGHTSPEED_COMBINED_IMPORT_HEADERS.join(";"));
    assert.match(csv, /114;Negroni;Item;10;Cocktails;Fall 2026\/Classic Cocktails\/Bitter/);
    assert.match(csv, /G0009;Vecchio Amaro del Capo;Item;5;/);
    assert.match(csv, /G0022;Tiny Rebel IPA;Item;6\.5;/);
    const dataLines = csv.trim().split("\n").slice(1);
    assert.equal(
      dataLines.filter((line) => line.includes(";Tiny Rebel IPA;")).length,
      1,
    );
    assert.equal(
      dataLines.filter((line) => line.includes(";Vecchio Amaro del Capo;")).length,
      1,
    );
    assert.match(
      csv,
      new RegExp(
        `${bottle.lightspeedSku};Rooster Rojo Blanco Tequila;Item;0;Alcoholic Drinks;;Rooster Rojo Blanco Tequila;GRAY;LOCAL;ml`,
      ),
    );
  });
});

describe("expandMenuItemsForLightspeedExport", () => {
  it("splits cocktails and pours with an alt price into single + double buttons", () => {
    const rows = expandMenuItemsForLightspeedExport([
      {
        _id: "50",
        name: "Vodka Energy",
        drinkType: "cocktail",
        price: "8",
        priceAlt: "12",
        lightspeedSku: "G0100",
        lightspeedSkuAlt: "G0101",
        lightspeedMenuScreen: "Highballs",
      },
      {
        _id: "51",
        name: "House gin",
        drinkType: "pour",
        price: "6.5",
        priceAlt: "11",
        lightspeedSku: "HOUSEGIN",
      },
      {
        _id: "52",
        name: "Negroni",
        drinkType: "cocktail",
        price: "10",
        lightspeedSku: "114",
      },
    ]);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].name, "Vodka Energy");
    assert.equal(rows[0].price, "8");
    assert.equal(rows[0].lightspeedSku, "G0100");
    assert.equal(rows[0]._exportServe, "primary");
    assert.equal(rows[1].name, "Vodka Energy (double)");
    assert.equal(rows[1].price, "12");
    assert.equal(rows[1]._id, "alt:50");
    assert.equal(rows[1].lightspeedSku, "G0101");
    assert.equal(rows[1]._exportServe, "alt");
    assert.equal(rows[2].name, "House gin");
    assert.equal(rows[3].name, "House gin (double)");
    assert.equal(rows[3].price, "11");
    assert.equal(rows[3]._id, "alt:51");
    assert.equal(rows[3].lightspeedSku, "");
    assert.equal(rows[4].name, "Negroni");
    assert.equal(rows.filter((row) => row.name === "Negroni").length, 1);
  });

  it("labels beer alt serves as half pint", () => {
    const rows = expandMenuItemsForLightspeedExport([
      {
        _id: "60",
        name: "Tiny Rebel IPA",
        drinkType: "beer",
        price: "6.5",
        priceAlt: "3.5",
        lightspeedSku: "G0022",
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Tiny Rebel IPA");
    assert.equal(rows[1].name, "Tiny Rebel IPA (half pint)");
    assert.equal(rows[1].price, "3.5");
  });

  it("always adds a half-pint button for soft drinks (postmix)", () => {
    const rows = expandMenuItemsForLightspeedExport([
      {
        _id: "80",
        name: "Coca-Cola",
        drinkType: "postmix",
        price: "3.5",
        priceAlt: "2",
        lightspeedName: "Coke",
        lightspeedSku: "157",
        lightspeedSkuAlt: "163",
        section: { title: "Soft Drinks" },
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Coca-Cola (pint)");
    assert.equal(rows[0]["lightspeedSku"], "157");
    assert.equal(rows[1].name, "Coca-Cola (half)");
    assert.equal(rows[1].price, "2");
    assert.equal(rows[1].lightspeedSku, "163");
    const preview = rows.map((item) =>
      lightspeedImportPreviewRow(item, ["Fall 2026"]),
    );
    assert.equal(preview[0]["Button name"], "Coke (Pint)");
    assert.equal(preview[1]["Button name"], "Coke (Half)");
  });

  it("always adds a half-pint button for draught beer, defaulting to half the pint", () => {
    const rows = expandMenuItemsForLightspeedExport([
      {
        _id: "61",
        name: "Gwenda Pilsner",
        drinkType: "beer",
        price: "6.5",
        lightspeedSku: "G0110",
        section: { title: "Draught Beer" },
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Gwenda Pilsner");
    assert.equal(rows[1].name, "Gwenda Pilsner (half pint)");
    assert.equal(rows[1].price, "3.25");
    assert.equal(rows[1]._id, "alt:61");
  });

  it("does not add half-pint buttons for bottled beer", () => {
    const rows = expandMenuItemsForLightspeedExport([
      {
        _id: "62",
        name: "Menabrea Bionda Lager",
        drinkType: "packaged",
        price: "5.5",
        section: { title: "Bottled Beer" },
      },
      {
        _id: "63",
        name: "Baladin L'Ippa",
        drinkType: "beer",
        price: "6",
        section: { title: "Bottled Beer" },
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows.every((row) => row._exportServe === "primary"), true);
  });

  it("marks bottled beer till buttons with (Bottle)", () => {
    const bottle = {
      _id: "36",
      name: "Menabrea Bionda Lager",
      drinkType: "packaged",
      price: "5.5",
      lightspeedSku: "G0036",
      lightspeedMenuScreen: "Beers",
      section: { title: "Bottled Beer" },
    };
    const row = lightspeedImportPreviewRow(bottle, ["Fall 2026"]);
    assert.equal(row.Name, "Menabrea Bionda Lager");
    assert.equal(row["Button name"], "Menabrea Bionda Lager (Bottle)");
    const draught = lightspeedImportPreviewRow(
      {
        _id: "39",
        name: "Gwenda Pilsner",
        drinkType: "beer",
        price: "6.5",
        lightspeedSku: "G0110",
        lightspeedMenuScreen: "Beers",
        section: { title: "Draught Beer" },
        _exportServe: "primary",
      },
      ["Fall 2026"],
    );
    assert.equal(draught["Button name"], "Gwenda Pilsner (Pint)");
  });

  it("uses Lightspeed name as the short POS button base with Half/Pint tags", () => {
    const expanded = expandMenuItemsForLightspeedExport([
      {
        _id: "70",
        name: "Baladin L'Ippa",
        drinkType: "beer",
        price: "7.5",
        priceAlt: "4",
        lightspeedName: "Baladin IPA",
        lightspeedSku: "869E0JTF9",
        lightspeedSkuAlt: "166",
        lightspeedMenuScreen: "Beers",
        section: { title: "Draught Beer" },
      },
    ]);
    const rows = expanded.map((item) =>
      lightspeedImportPreviewRow(item, ["Fall 2026"]),
    );
    assert.equal(rows[0].Name, "Baladin L'Ippa");
    assert.equal(rows[0]["Button name"], "Baladin IPA (Pint)");
    assert.equal(rows[1].Name, "Baladin L'Ippa (half pint)");
    assert.equal(rows[1]["Button name"], "Baladin IPA (Half)");
  });

  it("allocates and reports new SKUs for alt rows under alt: ids", () => {
    const expanded = expandMenuItemsForLightspeedExport([
      {
        _id: "70",
        name: "Vecchio Amaro del Capo",
        drinkType: "pour",
        price: "5",
        priceAlt: "9",
        lightspeedSku: "G0009",
      },
    ]);
    const allocated = withAllocatedLightspeedSkus(expanded, {
      reserved: ["G0009"],
    });
    assert.equal(allocated[0].lightspeedSku, "G0009");
    assert.match(String(allocated[1].lightspeedSku || ""), /^G\d{4}$/);
    const created = newlyAllocatedLightspeedSkus(expanded, allocated);
    assert.equal(created.length, 1);
    assert.equal(created[0].id, "alt:70");
    assert.equal(created[0].lightspeedSku, allocated[1].lightspeedSku);

    const preview = lightspeedCombinedImportPreviewRows(allocated, [], ["Fall 2026"]);
    assert.equal(preview.length, 2);
    assert.equal(preview[1].Name, "Vecchio Amaro del Capo (double)");
    assert.equal(preview[1].Price, "9");
    assert.equal(preview[1]["Button name"], "Vecchio Amaro del Capo (Double)");
  });
});
