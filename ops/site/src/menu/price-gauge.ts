/**
 * The pour target as a price: where a size's menu price sits against the
 * price that hits the house pour-cost target. Under it the drink earns too
 * little; a little over is healthy; well over and it may be too dear.
 */
import { formatGbp } from "../app/money";
import { roundMoney, type ServePourReading } from "./cost";

/** Above the target price by this factor, flag that the drink may be too dear. */
export const PRICEY_FACTOR = 1.3;

export type GaugeTone = "loss" | "low" | "good" | "high" | "muted";

export type GaugeZone = { tone: Exclude<GaugeTone, "muted">; from: number; to: number };

export type PriceGauge = {
	tone: GaugeTone;
	/** Short verdict: "£1.50 over target". */
	headline: string;
	/** What it means: "Healthy margin". */
	detail: string;
	/** Positions on the bar, 0 to 100. Null when the value isn't known. */
	zones: GaugeZone[];
	price: number | null;
	pricePos: number | null;
	target: number | null;
	targetPos: number | null;
	cost: number | null;
};


export function priceGauge(serve: ServePourReading | null, complete: boolean): PriceGauge {
	const empty = (headline: string, detail: string): PriceGauge => ({
		tone: "muted",
		headline,
		detail,
		zones: [],
		price: serve?.price ?? null,
		pricePos: null,
		target: null,
		targetPos: null,
		cost: serve?.drinkCost ?? null,
	});
	if (!serve || serve.drinkCost == null) return empty("No cost yet", "Cost the drink on Build.");
	if (!complete) return empty("Cost incomplete", "Some stock has no trade price.");
	const target = serve.suggestedPrice ?? serve.targetPrice;
	if (target == null || !(target > 0)) return empty("No target", "Set a pour target.");

	const cost = serve.drinkCost;
	const pricey = target * PRICEY_FACTOR;
	const price = serve.price;
	// The bar centres on the target: half of it to a bit past "may be too dear",
	// stretched to take in the price (and the cost, when the price is under it).
	let lo = target * 0.5;
	if (price != null && price < lo) lo = Math.min(price, cost) * 0.85;
	const hi = Math.max(pricey * 1.25, (price ?? 0) * 1.08);
	const pct = (value: number) => Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
	const zones: GaugeZone[] = [
		{ tone: "loss", from: 0, to: pct(cost) },
		{ tone: "low", from: pct(cost), to: pct(target) },
		{ tone: "good", from: pct(target), to: pct(pricey) },
		{ tone: "high", from: pct(pricey), to: 100 },
	].filter((zone) => zone.to > zone.from) as GaugeZone[];

	const base = { zones, target, targetPos: pct(target), cost, price, pricePos: null };
	if (price == null) {
		return { ...base, tone: "muted", headline: "No price", detail: `Aim for ${formatGbp(target)}.` };
	}
	const delta = roundMoney(price - target);
	const reading = { ...base, pricePos: pct(price) };
	if (price < cost) {
		return { ...reading, tone: "loss", headline: "Below cost", detail: `Loses ${formatGbp(roundMoney(cost - price))} a serve.` };
	}
	if (delta < 0) {
		return {
			...reading,
			tone: "low",
			headline: `${formatGbp(-delta)} under target`,
			detail: `Too cheap. Aim for ${formatGbp(target)}.`,
		};
	}
	if (price > pricey) {
		return { ...reading, tone: "high", headline: `${formatGbp(delta)} over target`, detail: "Good margin, but it may be too dear." };
	}
	return {
		...reading,
		tone: "good",
		headline: delta === 0 ? "On target" : `${formatGbp(delta)} over target`,
		detail: "Healthy margin.",
	};
}
