import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  drinkMetricsFields,
  mapItem,
  recomputedMetricFields,
  rowHasOverrideColumns,
} from "./menu-store.js";
import { inventoryAbvById } from "./menu.js";

const inventory = inventoryAbvById([{ id: "9", abv: "40" }]);
/** 50 ml gin at 40% and 50 ml tonic: 20%, 100 ml. */
const recipe = [
  { name: "Gin", quantity: 50, unit: "ml", inventoryId: "9" },
  { name: "Tonic", quantity: 50, unit: "ml" },
];

function metrics(input, { saved, overrideColumns = true, drinkType = "cocktail", ingredients = recipe } = {}) {
  return drinkMetricsFields(drinkType, ingredients, inventory, { input, saved, overrideColumns });
}

describe("ABV and Volume overrides on save", () => {
  it("writes the recipe's figures and both flags off when locked", () => {
    assert.deepEqual(metrics({ abv: "12%", volume: "90 ml", abvOverride: false, volumeOverride: false }), {
      ABV: "20%",
      Volume: "100 ml",
      "ABV override": false,
      "Volume override": false,
    });
  });

  it("keeps a figure set by hand and flags it", () => {
    assert.deepEqual(metrics({ abv: "18%", volume: "100 ml", abvOverride: true, volumeOverride: false }), {
      ABV: "18%",
      Volume: "100 ml",
      "ABV override": true,
      "Volume override": false,
    });
  });

  it("leaves the flags out until the table has the columns", () => {
    const fields = metrics({ abv: "18%", abvOverride: true }, { overrideColumns: false });
    assert.equal(fields.ABV, "18%");
    assert.equal("ABV override" in fields, false);
    assert.equal("Volume override" in fields, false);
  });

  it("without flags (an old client, an import), keeps a figure that isn't the recipe's", () => {
    assert.deepEqual(metrics({ abv: "18%", volume: "100 ml" }), {
      ABV: "18%",
      Volume: "100 ml",
      "ABV override": true,
      "Volume override": false,
    });
  });

  it("without flags, keeps what's stored and its flag when the save leaves the figure out", () => {
    const fields = metrics({}, { saved: { abv: "18%", volume: "100 ml", abvOverride: true } });
    assert.equal(fields.ABV, "18%");
    assert.equal(fields["ABV override"], true);
    assert.equal(fields.Volume, "100 ml");
  });

  it("doesn't flag a figure when a save carries no recipe (archiving)", () => {
    const fields = metrics({}, { saved: { abv: "20%", volume: "100 ml" }, ingredients: [] });
    assert.deepEqual(fields, { ABV: "20%", Volume: "100 ml", "ABV override": false, "Volume override": false });
  });

  it("leaves drinks without a recipe alone", () => {
    assert.deepEqual(metrics({ abv: "5%", abvOverride: false }, { drinkType: "beer" }), {});
  });
});

describe("reading the override columns", () => {
  const base = { id: 3, Name: "G&T", "Drink type": { value: "cocktail" }, ABV: "18%", Volume: "100 ml" };

  it("passes only an override that's on", () => {
    const on = mapItem({ ...base, "ABV override": true, "Volume override": false });
    assert.equal(on.abvOverride, true);
    assert.equal(on.volumeOverride, undefined);
    const missing = mapItem(base);
    assert.equal(missing.abvOverride, undefined);
    assert.equal(missing.volumeOverride, undefined);
  });

  it("knows whether the table has both columns", () => {
    assert.equal(rowHasOverrideColumns({ ...base, "ABV override": false, "Volume override": false }), true);
    assert.equal(rowHasOverrideColumns(base), false);
    assert.equal(rowHasOverrideColumns(undefined), false);
  });
});

describe("recomputing after a stock ABV change", () => {
  // Gin went from 40% to 50%: the recipe is now 25%.
  const after = inventoryAbvById([{ id: "9", abv: "50" }]);
  const before = { abv: "20%", volume: "100 ml" };

  it("moves a figure that followed the old recipe", () => {
    const row = { ABV: "20%", Volume: "100 ml", "ABV override": false, "Volume override": false };
    assert.deepEqual(recomputedMetricFields(row, recipe, after, before), { ABV: "25%" });
  });

  it("leaves a flagged figure alone", () => {
    const row = { ABV: "20%", Volume: "100 ml", "ABV override": true };
    assert.deepEqual(recomputedMetricFields(row, recipe, after, before), {});
  });

  it("leaves a figure typed over the old recipe, flag off or column missing", () => {
    assert.deepEqual(recomputedMetricFields({ ABV: "18%", Volume: "100 ml" }, recipe, after, before), {});
    assert.deepEqual(
      recomputedMetricFields({ ABV: "18%", Volume: "100 ml", "ABV override": false }, recipe, after, before),
      {},
    );
  });
});
