import { describe, expect, it } from "vitest";
import { cubicBezier, ease, lerpBox } from "./nav-mark";

describe("nav mark", () => {
	it("eases like CSS: starts at 0, ends at 1, linear stays linear", () => {
		expect(ease(0)).toBe(0);
		expect(ease(1)).toBe(1);
		expect(ease(0.5)).toBeGreaterThan(0.8);
		expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 3);
	});

	it("morphs the row into the halo", () => {
		const row = { x: 0, y: 100, w: 220, h: 44, r: 8 };
		const halo = { x: 4, y: 102, w: 40, h: 40, r: 20 };
		expect(lerpBox(row, halo, 0)).toEqual(row);
		expect(lerpBox(row, halo, 1)).toEqual(halo);
		expect(lerpBox(row, halo, 0.5)).toEqual({ x: 2, y: 101, w: 130, h: 42, r: 14 });
	});
});
