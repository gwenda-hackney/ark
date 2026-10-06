/**
 * A cocktail's ABV and volume are worked out from its recipe. Each can be
 * overridden by hand; the override is kept per field (ABV override / Volume
 * override on Menu Items). One rule, used by the editor and the server:
 *
 *   overridden = the flag is on, OR a value is stored that isn't the one the
 *                recipe works out.
 *
 * The second half covers drinks saved before the flags existed (a Baserow
 * boolean is never empty, so "off" can't be told from "never set"): their
 * stored figure is never replaced behind anyone's back. A locked field that
 * follows the recipe always matches it, so it reads as locked.
 *
 * The editor settles both flags as a drink opens (metric-lock.ts) and sends
 * them with every Save; the server trusts a flag it is sent and only falls
 * back on the rule when a save leaves one out.
 *
 * Plain JS so the Pages Functions and the browser share it.
 */

/** @typedef {"abv" | "volume"} Metric */

/** @type {Record<Metric, "abvOverride" | "volumeOverride">} */
export const OVERRIDE_KEYS = { abv: "abvOverride", volume: "volumeOverride" };
/** @type {Metric[]} */
export const METRICS = ["abv", "volume"];

/** @param {unknown} value */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The figure in "12.5%", "12.5", "120 ml" or "120ml"; null when there is none.
 * @param {unknown} value
 * @returns {number | null}
 */
export function metricFigure(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = text(value).replace(/,/g, "").replace(/%|ml$/gi, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Two values say the same figure (to 0.1), or are the same text.
 * @param {unknown} a
 * @param {unknown} b
 */
export function sameMetric(a, b) {
  const x = metricFigure(a);
  const y = metricFigure(b);
  if (x != null && y != null) return Math.round(x * 10) === Math.round(y * 10);
  return text(a) === text(b);
}

/**
 * Whether a field is set by hand: its flag is on, or what's stored isn't
 * what the recipe works out (or the recipe can't work it out at all).
 * @param {unknown} flag
 * @param {unknown} stored
 * @param {string | null | undefined} recipe the recipe's figure, formatted ("12.5%", "120 ml")
 */
export function isMetricOverridden(flag, stored, recipe) {
  if (flag === true) return true;
  if (!text(stored)) return false;
  if (!text(recipe)) return true;
  return !sameMetric(stored, recipe);
}

/**
 * What to save for one field, and its flag.
 *
 * `given`: the flag the save sent (the editor always sends it). On: what was
 * given is kept. Off: the recipe's figure, or what was given when the recipe
 * can't say (the editor sends "" then).
 *
 * Not sent: worked out from `saved` (the flag already on the row) by the
 * rule above. With no recipe figure the flag stays as it was, so a save that
 * doesn't carry the recipe (archiving, say) doesn't mark a field set by hand.
 *
 * @param {{ given?: unknown, saved?: unknown, stored: unknown, recipe: string | null | undefined }} input
 * @returns {{ value: string, override: boolean }}
 */
export function resolveMetric({ given, saved, stored, recipe }) {
  const figure = text(recipe);
  const value = text(stored);
  if (typeof given === "boolean") {
    return { value: given || !figure ? value : figure, override: given };
  }
  if (!figure) return { value, override: saved === true };
  const override = isMetricOverridden(saved, value, figure);
  return { value: override ? value : figure, override };
}
