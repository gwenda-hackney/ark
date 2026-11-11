/**
 * Happy Hour is a promotion and Chez Pickle a pop-up kitchen, not nights.
 * Both were entered as event series (there was nothing else), so What's on
 * repeats them every night. This says what each one is; the website can then
 * show nights only in What's on, and a promotion or pop-up kitchen once.
 *
 * Series are found by their exact name. Only the category is written, and
 * only when it differs (event-store.js setEventCategory): nothing is deleted
 * or merged, and no night changes. One that isn't there is said so and
 * skipped. Safe to run again. Supports --dry-run (with --only), which runs
 * the same steps on a copy (scripts/lib/d1-rehearsal.mjs) and also prints
 * what each series holds. The website follows on each series' next Update
 * website.
 */
import { recurrenceLabel } from "../ops/site/src/events/server/event-content.js";
import { listEvents, setEventCategory } from "../ops/site/src/events/server/event-store.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: Happy Hour is a promotion, Chez Pickle a pop-up kitchen";

/** Series by exact name, and what each one is. */
export const SERIES = [
  { name: "Happy Hour", category: "promotion" },
  // The Cocktail Hour, as 2026-11-10-one-happy-hour renames it, or as it was entered.
  { name: "Cocktail Hour 🍹", was: "From Wednesday to Saturday is the Cocktail Hour 🍹", category: "promotion" },
  { name: "Chez Pickle", category: "popup" },
];

const WORDS = { event: "a night", promotion: "a promotion", popup: "a pop-up kitchen" };

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** What a series holds, for the dry run: what the website could show for it. */
export function describeSeries(event, now = today()) {
  const upcoming = (event.dates || []).filter((night) => night.date >= now);
  const clip = (value) => {
    const line = String(value || "").replace(/\s+/g, " ").trim();
    return line ? `"${line.length > 160 ? `${line.slice(0, 157)}...` : line}"` : "none";
  };
  const repeats = recurrenceLabel(event);
  return [
    `times: ${event.startTime || "?"} to ${event.endTime || "?"}${event.time ? ` (shown as "${event.time}")` : ""}`,
    `repeats: ${repeats || event.repeatUnit}${event.weekdays?.length ? ` [${event.weekdays.join(", ")}]` : ""}; first night ${event.startsOn || "not set"}, last ${event.endsOn || "not set"}`,
    `nights: ${(event.dates || []).length} in ops, ${upcoming.length} from today${upcoming.length ? ` (${upcoming[0].date} to ${upcoming.at(-1).date})` : ""}`,
    `offer: ${clip(event.offer)}`,
    `card line: ${clip(event.shortDescription)}`,
    `description: ${clip(event.description)}`,
    `image: ${event.mainImage?.asset ? `yes (${event.mainImage.asset})` : "none"}; gallery photos: ${(event.gallery || []).length}`,
    `link: ${event.pageUrl || "none"}; web address: /whats-on/${event.slug}; website: ${event.publish?.live || "?"}`,
  ];
}

/**
 * Give each series in SERIES its category, through the events' use cases.
 * @returns {Promise<{ changed: number, missing: string[] }>}
 */
export async function categoriseSeries(env, log = () => {}, { details = false } = {}) {
  const events = await listEvents(env);
  let changed = 0;
  const missing = [];
  for (const want of SERIES) {
    const matches = events.filter((event) => [want.name, want.was].includes(String(event.name || "").trim()));
    if (!matches.length) {
      missing.push(want.name);
      log(`not found: no series named "${want.name}"${want.was ? ` or "${want.was}"` : ""}; nothing to do for it`);
      continue;
    }
    for (const event of matches) {
      const now = event.category || "event";
      if (now === want.category) log(`"${event.name}" (series ${event.id}) is already ${WORDS[want.category]}`);
      else {
        log(`"${event.name}" (series ${event.id}): ${WORDS[now] || now} → ${WORDS[want.category]}`);
        await setEventCategory(env, event.id, want.category);
        changed += 1;
      }
      if (details) for (const line of describeSeries(event)) log(`    ${line}`);
    }
  }
  return { changed, missing };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { changed, missing } = await categoriseSeries(data.env, log, { details: dryRun });
  if (!changed && !missing.length) log("Nothing to do: every series already says what it is.");
  if (changed) {
    log(`${changed} series ${dryRun ? "to change" : "changed"}. Nothing was deleted and no night changed.`);
    log("The website follows on each series' next Update website (ops, Events).");
  }
}
