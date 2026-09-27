import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  computeRecipeAbv,
  deployTargetForEnv,
  flattenIngredientsForMenu,
  groupImportRows,
  ingredientsFromDescription,
  normalizeIngredients,
  parseImportText,
  parseIngredientLine,
  resolveIngredientAbv,
} from "./menu.js";

describe("deployTargetForEnv", () => {
  it("maps production, preview, development, and local default", () => {
    assert.equal(deployTargetForEnv("production"), "production");
    assert.equal(deployTargetForEnv("preview"), "preview");
    assert.equal(deployTargetForEnv("development"), "development");
    assert.equal(deployTargetForEnv(""), "preview");
    assert.equal(deployTargetForEnv("", "local"), "development");
  });
});

describe("parseIngredientLine", () => {
  it("reads qty unit name", () => {
    assert.deepEqual(parseIngredientLine("25 ml Bombay gin"), {
      quantity: 25,
      unit: "ml",
      name: "Bombay gin",
    });
  });

  it("reads name then qty unit", () => {
    assert.deepEqual(parseIngredientLine("Angostura 2 dashes"), {
      quantity: 2,
      unit: "dash",
      name: "Angostura",
    });
  });

  it("keeps a bare name", () => {
    assert.deepEqual(parseIngredientLine("basil"), { name: "basil" });
  });
});

describe("flattenIngredientsForMenu", () => {
  it("joins names without quantities", () => {
    assert.equal(
      flattenIngredientsForMenu([
        { name: "Bombay gin", quantity: 25, unit: "ml" },
        { name: "Italicus" },
        { name: "  " },
      ]),
      "Bombay gin, Italicus",
    );
  });
});

describe("ingredientsFromDescription", () => {
  it("splits a guest menu line into ingredient names", () => {
    const rows = ingredientsFromDescription(
      "Bombay gin, Italicus, elderflower liqueur, lime, soda, basil",
    );
    assert.equal(rows.length, 6);
    assert.equal(rows[0].name, "Bombay gin");
  });
});

describe("resolveIngredientAbv", () => {
  it("prefers inventory ABV for linked lines", () => {
    const map = new Map([["9", "40"]]);
    assert.equal(
      resolveIngredientAbv({ inventoryId: "9", abv: "12" }, map),
      "40",
    );
  });

  it("ignores stale line ABV when linked inventory has none", () => {
    const map = new Map([["9", undefined]]);
    assert.equal(
      resolveIngredientAbv({ inventoryId: "9", abv: "40" }, map),
      undefined,
    );
  });

  it("uses line ABV when unlinked", () => {
    assert.equal(resolveIngredientAbv({ abv: "18%" }, new Map()), "18%");
  });
});

describe("computeRecipeAbv", () => {
  it("weights linked inventory ABV over denormalized line values", () => {
    const map = new Map([["1", "40"]]);
    const abv = computeRecipeAbv(
      [
        { name: "gin", quantity: 50, unit: "ml", inventoryId: "1", abv: "10" },
        { name: "soda", quantity: 50, unit: "ml" },
      ],
      map,
    );
    assert.equal(abv, 20);
  });
});

describe("normalizeIngredients", () => {
  it("drops empty names and normalises units", () => {
    const rows = normalizeIngredients([
      { name: "gin", quantity: "25", unit: "ML", abv: "40%" },
      { name: "" },
      { name: "soda", unit: "top", note: "to fill" },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].quantity, 25);
    assert.equal(rows[0].unit, "ml");
    assert.equal(rows[0].abv, "40");
    assert.equal(rows[1].note, "to fill");
  });
});

describe("parseImportText", () => {
  it("parses a headered CSV of cocktail ingredient rows", () => {
    const rows = parseImportText(
      "Cocktail,Qty,Unit,Ingredient,Note\nGwenda,25,ml,Bombay gin,\nGwenda,20,ml,Italicus,chilled",
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].cocktail, "Gwenda");
    assert.equal(rows[0].name, "Bombay gin");
    assert.equal(rows[0].quantity, 25);
    assert.equal(rows[1].note, "chilled");
    assert.equal(groupImportRows(rows).get("Gwenda").length, 2);
  });
});

