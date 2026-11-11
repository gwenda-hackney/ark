/**
 * Party facts (#240), part of the venue's details: what someone planning a
 * party wants to know before they ask. How many fit standing and seated,
 * what's included (a few short lines: "No hire fee", "A booth held for
 * you"), and how soon we reply ("a day"). Staff edit them in ops
 * (VenuePage.svelte); saving puts them on the website's party page
 * (server/venue-website.js). Every fact may be blank, and a blank fact is
 * left off the website. Plain objects and rules, no I/O: the page and the
 * server both use it.
 */

/** @typedef {{ standing: number | null, seated: number | null, included: string, replyWithin: string }} PartyFacts */
/** @typedef {"standing" | "seated" | "included" | "replyWithin"} PartyField */

/** @type {PartyField[]} In the order the page shows them. */
export const PARTY_FIELDS = ["standing", "seated", "included", "replyWithin"];

/** What's included: a few short lines, one thing on each. */
export const INCLUDED_MAX_LINES = 5;
export const INCLUDED_MAX_LENGTH = 300;
/** "We reply within …": a few words. */
export const REPLY_MAX_LENGTH = 40;

/** Blank → null; a figure → the number; anything else is kept as typed, for partyProblems to name. */
function capacityOf(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  if (!text) return null;
  const number = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) ? number : text;
}

/** One thing on each line, each trimmed, blank lines dropped. */
function linesOf(value) {
  return String(value ?? "")
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** One short line. The label already says "We reply within", so a typed "within" is dropped. */
function replyOf(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^within\s+/i, "");
}

/**
 * The facts, cleaned: numbers read, text trimmed, blank lines dropped.
 * Doesn't judge them (partyProblems does).
 * @returns {PartyFacts}
 */
export function partyFacts(fields = {}) {
  return {
    standing: /** @type {number | null} */ (capacityOf(fields?.standing)),
    seated: /** @type {number | null} */ (capacityOf(fields?.seated)),
    included: linesOf(fields?.included).join("\n"),
    replyWithin: replyOf(fields?.replyWithin),
  };
}

/** The lines of what's included, one thing on each. */
export function includedLines(facts) {
  return linesOf(facts?.included);
}

/** True when nothing is filled in: the website then says nothing about parties. */
export function isBlankParties(facts) {
  const clean = partyFacts(facts);
  return clean.standing == null && clean.seated == null && !clean.included && !clean.replyWithin;
}

function capacityProblem(value) {
  if (value == null) return "";
  if (typeof value !== "number" || !Number.isInteger(value)) return "Use a whole number of people, like 40, or leave it blank.";
  if (value < 1) return "Use a number above 0, or leave it blank.";
  return "";
}

/**
 * What's wrong with each fact, in words; empty when they're fine.
 * @param {PartyFacts} facts cleaned (partyFacts)
 * @returns {Partial<Record<PartyField, string>>}
 */
export function partyProblems(facts) {
  /** @type {Partial<Record<PartyField, string>>} */
  const problems = {};
  const standing = capacityProblem(facts.standing);
  if (standing) problems.standing = standing;
  const seated = capacityProblem(facts.seated);
  if (seated) problems.seated = seated;
  const lines = includedLines(facts);
  if (lines.length > INCLUDED_MAX_LINES) {
    problems.included = `Keep it to ${INCLUDED_MAX_LINES} lines, one thing on each.`;
  } else if (facts.included.length > INCLUDED_MAX_LENGTH) {
    problems.included = `Keep it under ${INCLUDED_MAX_LENGTH} characters (it's ${facts.included.length}).`;
  }
  if (facts.replyWithin.length > REPLY_MAX_LENGTH) {
    problems.replyWithin = `Keep it to a few words, like "a day" (${REPLY_MAX_LENGTH} characters at most).`;
  }
  return problems;
}

/**
 * The facts checked.
 * @returns {{ facts: PartyFacts, problems: Partial<Record<PartyField, string>> }}
 */
export function validateParties(input) {
  const facts = partyFacts(input);
  return { facts, problems: partyProblems(facts) };
}

const LABELS = {
  standing: "Standing",
  seated: "Seated",
  included: "What's included",
  replyWithin: "We reply within",
};

/**
 * Throws a 400 that names each fact's problem; returns the clean facts.
 * @returns {PartyFacts}
 */
export function assertValidParties(input) {
  const { facts, problems } = validateParties(input);
  const entries = Object.entries(problems);
  if (!entries.length) return facts;
  const error = new Error(entries.map(([key, message]) => `${LABELS[key]}: ${message}`).join(" "));
  /** @type {any} */ (error).status = 400;
  /** @type {any} */ (error).problems = problems;
  throw error;
}
