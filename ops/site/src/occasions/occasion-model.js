/**
 * Occasions (#353), the rules: an occasion is something on sale for a while that
 * leads to an enquiry (Christmas parties, a summer terrace). The website's
 * home shows it from `showFrom` to `showUntil` (London days, both included),
 * with its picture, its line, what's included and an enquiry button that
 * opens the party form marked with its name.
 *
 * @typedef {{
 *   id?: number,
 *   name: string,
 *   line: string,
 *   included: string,
 *   covers: string,
 *   showFrom: string,
 *   showUntil: string,
 *   image: { asset: string, alt: string } | null,
 *   updatedAt?: string,
 *   updatedBy?: string,
 * }} Occasion
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Longest an occasion's words may be, so the home card stays a card. */
export const LIMITS = { name: 60, line: 200, included: 600, covers: 60, alt: 200 };

const text = (value) => String(value ?? "").trim();

/** A real day in the calendar, YYYY-MM-DD. */
function isDay(value) {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** An occasion as stored and shown: every field there, trimmed; no picture is null. */
export function occasion(raw = {}) {
  const asset = text(raw.image?.asset ?? raw.imageAsset);
  return {
    ...(raw.id != null ? { id: Number(raw.id) } : {}),
    name: text(raw.name),
    line: text(raw.line),
    included: String(raw.included ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n"),
    covers: text(raw.covers),
    showFrom: text(raw.showFrom),
    showUntil: text(raw.showUntil),
    image: asset ? { asset, alt: text(raw.image?.alt ?? raw.imageAlt) } : null,
    ...(raw.updatedAt !== undefined ? { updatedAt: String(raw.updatedAt || "") } : {}),
    ...(raw.updatedBy !== undefined ? { updatedBy: String(raw.updatedBy || "") } : {}),
  };
}

/**
 * What's wrong with an occasion, field by field; {} when nothing is. A name and
 * both show dates are needed; the last day can't come before the first.
 * @returns {Record<string, string>}
 */
export function occasionProblems(raw) {
  const value = occasion(raw);
  const problems = {};
  if (!value.name) problems.name = "Give it a name.";
  for (const [field, limit] of Object.entries(LIMITS)) {
    const current = field === "alt" ? value.image?.alt || "" : value[field];
    if (current.length > limit) problems[field] = `Keep it under ${limit} characters.`;
  }
  if (!isDay(value.showFrom)) problems.showFrom = "Pick the first day it shows.";
  if (!isDay(value.showUntil)) problems.showUntil = "Pick the last day it shows.";
  if (!problems.showFrom && !problems.showUntil && value.showUntil < value.showFrom) {
    problems.showUntil = "The last day comes after the first.";
  }
  return problems;
}

/** The occasion, clean, or a 400 with each field's problem (`problems`). */
export function assertValidOccasion(raw) {
  const problems = occasionProblems(raw);
  if (Object.keys(problems).length) {
    const error = new Error(Object.values(problems)[0]);
    error.status = 400;
    error.problems = problems;
    throw error;
  }
  return occasion(raw);
}

/**
 * Where an occasion stands on `todayIso`: "showing" (home shows it), "coming"
 * (it starts later) or "over".
 * @param {Occasion} value
 * @param {string} todayIso
 */
export function occasionState(value, todayIso) {
  if (todayIso < value.showFrom) return "coming";
  if (todayIso > value.showUntil) return "over";
  return "showing";
}

/** Occasions in the order ops lists them: showing and coming first, soonest first; over last. */
export function occasionOrder(occasions, todayIso) {
  const rank = { showing: 0, coming: 1, over: 2 };
  return [...occasions].sort(
    (a, b) =>
      rank[occasionState(a, todayIso)] - rank[occasionState(b, todayIso)] ||
      (occasionState(a, todayIso) === "over"
        ? b.showUntil.localeCompare(a.showUntil)
        : a.showFrom.localeCompare(b.showFrom)) ||
      a.name.localeCompare(b.name),
  );
}
