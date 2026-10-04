/**
 * The editor's side of ABV / Volume overrides (metric-override.js has the
 * rule). A cocktail's two figures are locked on what the recipe works out
 * until Override; Use recipe value locks them again.
 */
import { computeRecipeAbv, computeRecipeVolumeMl, formatAbv, inventoryAbvById } from "./abv";
import { hasRecipe, type Ingredient, type MenuItem } from "./types";
import { METRICS, OVERRIDE_KEYS, isMetricOverridden } from "./metric-override.js";

export type Metric = "abv" | "volume";
/** The recipe's figures as stored ("12.5%", "120 ml"); "" when it can't say. */
export type RecipeFigures = Record<Metric, string>;

type AbvSource = { _id?: string; id?: string; abv?: string }[] | null | undefined;

export function recipeFigures(
	drinkType: MenuItem["drinkType"],
	ingredients: Ingredient[] | null | undefined,
	inventory: AbvSource,
): RecipeFigures {
	if (!hasRecipe(drinkType)) return { abv: "", volume: "" };
	const abv = computeRecipeAbv(ingredients, inventoryAbvById(inventory));
	const volumeMl = computeRecipeVolumeMl(ingredients);
	return {
		abv: abv != null ? formatAbv(abv) : "",
		volume: volumeMl != null ? `${volumeMl} ml` : "",
	};
}

/**
 * Set by hand? Once settled (or after Override / Use recipe value) the flag
 * says; until then the rule does. Other drinks have no recipe, so theirs
 * always are.
 */
export function metricOverridden(item: MenuItem, metric: Metric, figures: RecipeFigures): boolean {
	if (!hasRecipe(item.drinkType)) return true;
	const flag = item[OVERRIDE_KEYS[metric]];
	if (typeof flag === "boolean") return flag;
	return isMetricOverridden(flag, item[metric], figures[metric]);
}

/**
 * A cocktail as it opens: both flags settled from the rule, so a figure
 * stored before the flags existed, and not the recipe's, opens set by hand.
 * Other drinks are left alone. Returns the same object when nothing changes.
 */
export function settleOverrides(item: MenuItem, inventory: AbvSource): MenuItem {
	if (!hasRecipe(item.drinkType)) return item;
	const figures = recipeFigures(item.drinkType, item.ingredients, inventory);
	let next = item;
	for (const metric of METRICS) {
		const key = OVERRIDE_KEYS[metric];
		const on = isMetricOverridden(item[key], item[metric], figures[metric]);
		if (item[key] !== on) next = { ...next, [key]: on };
	}
	return next;
}

/**
 * The figures a recipe change brings: locked fields take the new recipe's
 * ("" when it can't say). `before` is the recipe as it was, for a flag not
 * settled yet.
 */
export function followRecipe(
	item: MenuItem,
	before: RecipeFigures,
	after: RecipeFigures,
): Partial<MenuItem> {
	if (!hasRecipe(item.drinkType)) return {};
	const out: Partial<MenuItem> = {};
	for (const metric of METRICS) {
		if (metricOverridden(item, metric, before)) continue;
		out[metric] = after[metric];
	}
	return out;
}

/**
 * Override (on: the figure the locked field showed, the recipe's, now open
 * to typing) or Use recipe value (off: back to the recipe's).
 */
export function withOverride(
	item: MenuItem,
	metric: Metric,
	on: boolean,
	figures: RecipeFigures,
): MenuItem {
	const key = OVERRIDE_KEYS[metric];
	if (on) return { ...item, [key]: true, [metric]: figures[metric] || item[metric] || "" };
	return { ...item, [key]: false, [metric]: figures[metric] };
}
