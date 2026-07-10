import { describe, expect, it } from "vitest";
import { computeExtendedLineCost, quantityInMl, resolveUnitName } from "../src/units";

describe("resolveUnitName", () => {
  it("maps clickup unit orderindex", () => {
    expect(resolveUnitName(2)).toBe("dash");
    expect(resolveUnitName(0)).toBe("ml");
  });
});

describe("quantityInMl", () => {
  it("converts dashes and centilitres to ml", () => {
    expect(quantityInMl(1, "dash", { dashMl: 1.75 })).toBe(1.75);
    expect(quantityInMl(2, "cl", { clMl: 10 })).toBe(20);
  });
});

describe("computeExtendedLineCost", () => {
  const cpm = 0.005714;

  it("costs 1 dash using dash volume", () => {
    expect(computeExtendedLineCost(1, "dash", cpm, { dashMl: 1.75 })).toBe(0.01);
  });

  it("costs 20 ml volumetrically", () => {
    expect(computeExtendedLineCost(20, "ml", cpm)).toBe(0.11);
  });

  it("shows dash vs 20ml difference for coconut wash scenario", () => {
    const dashCost = computeExtendedLineCost(1, "dash", cpm, { dashMl: 1.75 });
    const mlCost = computeExtendedLineCost(20, "ml", cpm);
    expect(dashCost).toBeLessThan(mlCost);
    expect(mlCost).toBeCloseTo(0.11, 2);
  });
});
