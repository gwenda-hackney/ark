/**
 * Party facts (#240): what ops publishes about having a party here (the
 * Sanity document `venueDetails`, its `parties`) and the lines the party
 * page shows from them. How many fit, standing and seated; what's included,
 * a line for each thing; how soon we reply.
 *
 * Every fact may be missing, and a missing one is left out: never an
 * invented capacity or promise. Nothing filled in means nothing shown.
 */

/**
 * @typedef {{ standing: number | null, seated: number | null, included: string[], replyWithin: string }} PartyFacts
 * @typedef {{ kind: "capacity" | "included" | "reply", text: string }} PartyFactLine
 */

/** A whole number of people above 0, or null. */
function capacityOf(value) {
  const number = typeof value === "number" ? value : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
}

function textOf(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * The facts as Sanity holds them → clean facts; null when there is nothing
 * to say (none published, or all blank).
 * @returns {PartyFacts | null}
 */
export function readParties(raw) {
  if (!raw || typeof raw !== "object") return null;
  const facts = {
    standing: capacityOf(raw.standing),
    seated: capacityOf(raw.seated),
    included:
      typeof raw.included === "string"
        ? raw.included
            .split(/\r\n|\r|\n/)
            .map(textOf)
            .filter(Boolean)
        : [],
    replyWithin: textOf(raw.replyWithin),
  };
  const blank =
    facts.standing == null &&
    facts.seated == null &&
    !facts.included.length &&
    !facts.replyWithin;
  return blank ? null : facts;
}

/** "Up to 80 standing, 40 seated", or the one that's there; "" for neither. */
export function capacityLine({ standing = null, seated = null } = {}) {
  const parts = [
    standing != null && `${standing} standing`,
    seated != null && `${seated} seated`,
  ].filter(Boolean);
  return parts.length ? `Up to ${parts.join(", ")}` : "";
}

/**
 * The party page's lines, each fact on its own, in this order: how many
 * fit, what's included (a line each), how soon we reply. [] when there are
 * no facts: the page then shows nothing about them.
 * @param {PartyFacts | null} parties
 * @returns {PartyFactLine[]}
 */
export function partyFactLines(parties) {
  if (!parties) return [];
  /** @type {PartyFactLine[]} */
  const lines = [];
  const capacity = capacityLine(parties);
  if (capacity) lines.push({ kind: "capacity", text: capacity });
  for (const text of parties.included || [])
    lines.push({ kind: "included", text });
  if (parties.replyWithin) {
    lines.push({
      kind: "reply",
      text: `We reply within ${parties.replyWithin}`,
    });
  }
  return lines;
}

/** The party form's question for what the party is for (its key never changes once live). */
export const PARTY_OCCASION_KEY = "occasion";

/**
 * The kinds of party, as the party form offers them (its occasion
 * question's choices, as the venue has them in Studio): "Birthday",
 * "Leaving do", "Work do", "Something else". [] without the form or the
 * question, and then home shows none.
 *
 * @param {{ fields?: Array<{ key?: string, options?: Array<{ label?: string }> | null }> } | null | undefined} form
 * @returns {string[]}
 */
export function partyOccasions(form) {
  const fields = Array.isArray(form?.fields) ? form.fields : [];
  const question = fields.find((field) => field?.key === PARTY_OCCASION_KEY);
  const options = Array.isArray(question?.options) ? question.options : [];
  return options.map((option) => textOf(option?.label)).filter(Boolean);
}
