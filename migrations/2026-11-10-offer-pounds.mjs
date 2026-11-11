/**
 * Prices in offers the way they are written in the UK: "£6 BEER", not
 * "6 POUND BEER". The sign goes first, with no space.
 *
 * On every series it reads the offer and the card line (the short
 * description), and on every night to come the night's own offer and card
 * line where it has one. An amount written as a number followed by "pound"
 * or "pounds", in any case ("5 POUND", "7.50 pounds", "5pound", "5-pound"),
 * becomes "£" and the number; the rest of the text keeps its words and its
 * casing. A series is saved through the editor's own save (event-store.js
 * updateEvent) and a night through the night's (saveOccurrence, its other
 * details untouched), so the website and the calendar follow by themselves,
 * as after any save in ops.
 *
 * Left alone, and said so for the owner to decide: an amount in words ("a
 * pound off", "one pound"), since "£1 off" may not be what was meant. Never
 * touched: text already written with £, "pound" with no number before it
 * ("pound cake", "quarter pounder"), and long descriptions, which are only
 * reported when they hold such an amount.
 *
 * A number before "pound" is always read as a price, which is what an offer
 * means by it; a weight ("5 pound burger") would come out as "£5 burger".
 * Every change is listed, before and after, on a dry run and on the real
 * run, so the owner sees each one in the deploy's log.
 *
 * A series or night that ops refuses to save (an old one that today's rules
 * turn away, as the editor would) is left as it was and named with the
 * reason; the rest still change and the run ends well, so the migrations
 * after this one run. Anything else that goes wrong stops it.
 *
 * Safe to run again: text already written with £ has nothing left to change.
 * Supports --dry-run (with --only), which runs the same steps on a copy
 * (scripts/lib/d1-rehearsal.mjs) and lists each change, before and after.
 */
import { listEvents, saveOccurrence, updateEvent } from "../ops/site/src/events/server/event-store.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = 'Events: prices in offers written with £ ("6 POUND BEER" becomes "£6 BEER")';

/** A number, then "pound" or "pounds": not part of a longer word or number, and not already after a £. */
const AMOUNT = /(?<![\w£$€.,/])(\d+(?:\.\d{1,2})?)[ \t-]*pounds?(?![\w])/gi;
const WORDS = /\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|half a)[ \t-]+pounds?(?![\w])/gi;

/** "6 POUND BEER" → "£6 BEER". Text with no such amount comes back as it is. */
export function poundsToSign(value) {
  return String(value ?? "").replace(AMOUNT, "£$1");
}

/** Amounts written in words ("a pound", "five pounds"), which are left for the owner. */
export function amountsInWords(value) {
  return String(value ?? "").match(WORDS) || [];
}

/** The short texts a card shows, by field: [field, what the log calls it]. */
const FIELDS = [
  ["offer", "offer"],
  ["shortDescription", "card line"],
];
const title = (event) => `"${event.name}" (series ${event.id})`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Ops turning a save away (validation, a clash): a 4xx, as the editor would show it. */
const refused = (error) => error?.status >= 400 && error.status < 500;

/**
 * Rewrite the amounts in every series' and upcoming night's offer and card line.
 * @returns {Promise<{ changed: number, left: number, failed: number }>} texts changed, texts left
 *   for the owner, and series or nights ops refused to save
 */
export async function offersInPounds(env, log = () => {}, { dryRun = false, now = today() } = {}) {
  let changed = 0;
  let left = 0;
  let failed = 0;
  /** Save one series' or night's changes ([label, before, after]); a refusal is said, not thrown. */
  const save = async (where, changes, write) => {
    if (!changes.length) return;
    try {
      await write();
    } catch (error) {
      if (!refused(error)) throw error;
      failed += 1;
      const wanted = changes.map(([label, before, after]) => `${label}: "${before}" → "${after}"`).join("; ");
      log(`could not save ${where}, left as it was: ${error.message} (${wanted})`);
      return;
    }
    for (const [label, before, after] of changes) {
      changed += 1;
      log(`${dryRun ? "would change " : ""}${where} ${label}: "${before}" → "${after}"`);
    }
  };
  const leave = (where, label, value) => {
    const words = amountsInWords(poundsToSign(value));
    if (!words.length) return;
    left += 1;
    log(`left alone: ${where} ${label} "${value}": an amount in words (${words.map((word) => `"${word}"`).join(", ")}); write it with £ in ops if that is what it means`);
  };

  for (const event of await listEvents(env)) {
    const fields = {};
    const changes = [];
    for (const [key, label] of FIELDS) {
      const before = String(event[key] || "");
      const after = poundsToSign(before);
      if (after !== before) {
        fields[key] = after;
        changes.push([label, before, after]);
      }
      leave(title(event), label, before);
    }
    await save(title(event), changes, () => updateEvent(env, event.id, fields));

    for (const night of (event.dates || []).filter((row) => row.date >= now)) {
      const overrides = {};
      const nightChanges = [];
      for (const [key, label] of FIELDS) {
        const before = String(night.overrides?.[key] || "");
        const after = poundsToSign(before);
        if (after !== before) {
          overrides[key] = after;
          nightChanges.push([label, before, after]);
        }
        leave(`${title(event)} ${night.date}`, label, before);
      }
      await save(`${title(event)} ${night.date}`, nightChanges, () =>
        saveOccurrence(env, event.id, { ...night, overrides: { ...night.overrides, ...overrides } }),
      );
    }

    // Long descriptions are the owner's prose: reported, never rewritten.
    const texts = [
      ["description", event.description],
      ...(event.dates || []).filter((row) => row.date >= now).map((row) => [`${row.date} description`, row.overrides?.description]),
    ];
    for (const [label, value] of texts) {
      const found = String(value || "").match(AMOUNT);
      if (found) log(`not changed: ${title(event)} ${label} says ${found.map((text) => `"${text}"`).join(", ")}; long descriptions are left as written`);
    }
  }
  return { changed, left, failed };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { changed, left, failed } = await offersInPounds(data.env, log, { dryRun });
  if (failed) log(`${failed} could not be saved (above): open it in ops, fix what it says, and write the price with £ there.`);
  if (!changed && !failed) log(`Nothing to do: no offer or card line has an amount written with the word${left ? ` (${left} left for the owner, above)` : ""}.`);
  else if (changed) {
    log(`${changed} text${changed === 1 ? "" : "s"} ${dryRun ? "to change" : "changed"}.`);
    if (!dryRun) log("The website follows with each event's next website update, which ops does by itself.");
  }
}
