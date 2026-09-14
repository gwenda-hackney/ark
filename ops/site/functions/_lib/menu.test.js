import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDescriptionFromRecipe,
  deployTargetForEnv,
  flattenIngredientsForMenu,
  groupImportRows,
  ingredientsFromDescription,
  normalizeIngredients,
  parseImportText,
  parseIngredientLine,
} from "./menu.js";

describe("deployTargetForEnv", () => {
  it("maps production vs staging", () => {
    assert.equal(deployTargetForEnv("production"), "production");
    assert.equal(deployTargetForEnv("staging"), "staging");
    assert.equal(deployTargetForEnv(""), "staging");
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

describe("normalizeIngredients", () => {
  it("drops empty names and normalises units", () => {
    const rows = normalizeIngredients([
      { name: "gin", quantity: "25", unit: "ML" },
      { name: "" },
      { name: "soda", unit: "top", note: "to fill" },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].quantity, 25);
    assert.equal(rows[0].unit, "ml");
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

describe("applyDescriptionFromRecipe", () => {
  it("fills the guest line from ingredient names", () => {
    const fields = applyDescriptionFromRecipe(
      {},
      {
        lockDescription: false,
        ingredients: [{ name: "gin" }, { name: "vermouth" }],
      },
    );
    assert.equal(fields.description, "gin, vermouth");
  });

  it("leaves a locked line alone", () => {
    const fields = applyDescriptionFromRecipe(
      { description: "Floral gin fizz" },
      {
        lockDescription: true,
        ingredients: [{ name: "gin" }],
      },
    );
    assert.equal(fields.description, "Floral gin fizz");
  });
});
