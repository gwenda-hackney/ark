import { describe, expect, it } from "vitest";
import type { ServePourReading } from "./cost";
import { priceGauge } from "./price-gauge";

const serve = (price: number | null, over: Partial<ServePourReading> = {}): ServePourReading => ({
	key: "primary",
	label: "Single",
	costFactor: 1,
	drinkCost: 2,
	price,
	pourCost: price ? (2 / price) * 100 : null,
	targetPrice: 10,
	suggestedPrice: 10,
	variance: null,
	margin: price != null ? price - 2 : null,
	...over,
});

describe("priceGauge", () => {
	it("calls a price under the target too cheap", () => {
		const g = priceGauge(serve(8), true);
		expect(g.tone).toBe("low");
		expect(g.headline).toBe("£2.00 under target");
		expect(g.detail).toContain("£10.00");
	});

	it("calls a little over the target healthy", () => {
		const g = priceGauge(serve(11.5), true);
		expect(g.tone).toBe("good");
		expect(g.headline).toBe("£1.50 over target");
	});

	it("says on target at the target", () => {
		expect(priceGauge(serve(10), true)).toMatchObject({ tone: "good", headline: "On target" });
	});

	it("flags a price well over the target as maybe too dear", () => {
		const g = priceGauge(serve(14), true);
		expect(g.tone).toBe("high");
		expect(g.detail).toMatch(/too dear/);
	});

	it("calls a price under cost a loss", () => {
		expect(priceGauge(serve(1.5), true)).toMatchObject({ tone: "loss", headline: "Below cost" });
	});

	it("centres the scale on the target", () => {
		const pos = priceGauge(serve(11.5), true).targetPos!;
		expect(pos).toBeGreaterThan(35);
		expect(pos).toBeLessThan(55);
	});

	it("places the target and price on the bar in order", () => {
		const g = priceGauge(serve(11.5), true);
		expect(g.targetPos!).toBeLessThan(g.pricePos!);
		expect(g.zones.map((z) => z.tone)).toEqual(["low", "good", "high"]);
		expect(g.zones.at(-1)!.to).toBe(100);
	});

	it("shows the loss zone when the price is near cost", () => {
		const g = priceGauge(serve(1.5), true);
		expect(g.zones[0].tone).toBe("loss");
		expect(g.pricePos!).toBeLessThan(g.zones[0].to);
	});

	it("keeps a very high price on the bar", () => {
		expect(priceGauge(serve(40), true).pricePos).toBeLessThanOrEqual(100);
	});

	it("is muted without a price, cost or complete recipe", () => {
		expect(priceGauge(serve(null), true)).toMatchObject({ tone: "muted", headline: "No price" });
		expect(priceGauge(serve(10, { drinkCost: null }), true).tone).toBe("muted");
		expect(priceGauge(serve(10), false).headline).toBe("Cost incomplete");
	});
});
