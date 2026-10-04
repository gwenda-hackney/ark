import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isMetricOverridden, metricFigure, resolveMetric, sameMetric } from "./metric-override.js";

describe("metricFigure / sameMetric", () => {
  it("reads the figure with or without its unit", () => {
    assert.equal(metricFigure("12.5%"), 12.5);
    assert.equal(metricFigure("12.5"), 12.5);
    assert.equal(metricFigure("120 ml"), 120);
    assert.equal(metricFigure("120ml"), 120);
    assert.equal(metricFigure(""), null);
    assert.equal(metricFigure("about 12"), null);
  });

  it("treats the same figure to 0.1 as the same, whatever the unit spelling", () => {
    assert.equal(sameMetric("12.5%", "12.5"), true);
    assert.equal(sameMetric("120 ml", "120ml"), true);
    assert.equal(sameMetric("18.3%", "18.31%"), true);
    assert.equal(sameMetric("18.3%", "18.4%"), false);
    assert.equal(sameMetric("about 12", "about 12"), true);
  });
});

describe("isMetricOverridden", () => {
  it("is on when the flag is", () => {
    assert.equal(isMetricOverridden(true, "18.3%", "18.3%"), true);
  });

  it("follows the recipe when the stored figure is the recipe's or blank", () => {
    assert.equal(isMetricOverridden(false, "18.3%", "18.3%"), false);
    assert.equal(isMetricOverridden(undefined, "18.3", "18.3%"), false);
    assert.equal(isMetricOverridden(false, "", "18.3%"), false);
    assert.equal(isMetricOverridden(false, "", ""), false);
  });

  it("counts a stored figure that isn't the recipe's as set by hand (drinks saved before the flags)", () => {
    assert.equal(isMetricOverridden(false, "15%", "18.3%"), true);
    assert.equal(isMetricOverridden(undefined, "100 ml", "86.8 ml"), true);
    assert.equal(isMetricOverridden(undefined, "15%", ""), true);
  });
});

describe("resolveMetric", () => {
  it("trusts a flag the save sent", () => {
    assert.deepEqual(resolveMetric({ given: true, stored: "15%", recipe: "18.3%" }), { value: "15%", override: true });
    assert.deepEqual(resolveMetric({ given: false, stored: "15%", recipe: "18.3%" }), {
      value: "18.3%",
      override: false,
    });
    // Locked with nothing to work out: what the editor sent (blank).
    assert.deepEqual(resolveMetric({ given: false, stored: "", recipe: "" }), { value: "", override: false });
  });

  it("works it out when the save sent no flag", () => {
    assert.deepEqual(resolveMetric({ stored: "18.3%", recipe: "18.3%" }), { value: "18.3%", override: false });
    assert.deepEqual(resolveMetric({ stored: "17%", saved: false, recipe: "18.3%" }), {
      value: "17%",
      override: true,
    });
    assert.deepEqual(resolveMetric({ stored: "17%", saved: true, recipe: "17%" }), { value: "17%", override: true });
    assert.deepEqual(resolveMetric({ stored: "", recipe: "18.3%" }), { value: "18.3%", override: false });
  });

  it("keeps the figure and the saved flag when the recipe can't say (a save without the recipe)", () => {
    assert.deepEqual(resolveMetric({ stored: "18.3%", saved: undefined, recipe: "" }), {
      value: "18.3%",
      override: false,
    });
    assert.deepEqual(resolveMetric({ stored: "15%", saved: true, recipe: null }), { value: "15%", override: true });
  });
});
