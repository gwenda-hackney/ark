/**
 * San Martino in Gwenda is one night, Wednesday 11 November 2026 (St Martin's
 * Day). It was entered as a weekly Wednesday series from that date with no
 * end, so the website shows it every Wednesday from now on. The owner: "the
 * san martino event should not be a series. it should be a one time event
 * today". This makes it a one-off event on the 11th, and the later Wednesdays
 * go from ops, the website and the calendar.
 *
 * It goes the way ops does it when a series' schedule changes:
 *
 * 1. The event is saved as a one-off ("Special event": repeat "once") on the
 *    11th through the editor's own save (event-store.js updateEvent). Its
 *    name, web address, flyer, times, description, Drive folder and the
 *    11 November night stay. A later Wednesday that never reached the website
 *    goes at once, with its calendar entry; one that is on the website stays
 *    in ops as a dropped night until the website lets it go (keepsDroppedNight).
 * 2. The website job (website-jobs.js) then does what it does after any save:
 *    the dropped nights are marked removed on the preview and leave the
 *    calendar, the event's page says one-off, and Update website for this
 *    event (putEventOnWebsite) takes the later Wednesdays off the website,
 *    after which ops lets their rows go (release.js markReleasedInOps). The
 *    owner asked for it to be on the website now, so this also runs when the
 *    setting website.auto_update is off.
 *
 * ClickUp: ops makes a social-post task for each night (production only) and
 * does not remove it when a night is dropped from the schedule. Any task the
 * later Wednesdays have is named in the log and stays in ClickUp.
 *
 * Found by its web address. Changed only while it is still the weekly
 * Wednesday series from the 11th (every week, Wednesdays only, no end date,
 * no nights added by hand); anything else is left and the log says how it is
 * now. Safe to run again: once it is the one-off with nothing of a later
 * Wednesday left, there is nothing to do, and a run that stopped halfway is
 * finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the save runs on a copy
 * of the data (scripts/lib/d1-rehearsal.mjs), and for the website and the
 * calendar it says what would happen, since they have no copy to rehearse on.
 */
import { droppedNights, getEvent, listEvents, liveNightsBehind, previewBehind, updateEvent } from "../ops/site/src/events/server/event-store.js";
import { putEventOnWebsite } from "../ops/site/src/events/server/event-publish.js";
import { runWebsiteJob } from "../ops/site/src/events/server/website-jobs.js";
import { PREVIEW, sanityQuery } from "../ops/site/src/platform/sanity.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: San Martino is a one-off on Wednesday 11 November, not a weekly series";

/** /whats-on/san-martino-in-gwenda */
export const SLUG = "san-martino-in-gwenda";
/** Its one night, St Martin's Day. */
export const DATE = "2026-11-11";

const WEEKDAY_NAMES = { mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays", sun: "Sundays" };
const UNIT_WORDS = { day: "day", week: "week", month: "month" };

const title = (event) => `"${event.name}" (event ${event.id})`;
const unit = (event) => String(event.repeatUnit || "none").toLowerCase();
const count = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const weekday = (date) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${date}T12:00:00Z`).getUTCDay()];
const span = (event) => [event.startTime, event.endTime].filter(Boolean).join(" to ") || event.time || "no times";
const every = (event) => Math.floor(Number(event.repeatEvery) || 1);

/** The event's schedule in words, for the log: "weekly on Wednesdays from 2026-11-11". */
export function scheduleInWords(event) {
  const kind = unit(event);
  if (kind === "once") return `a one-off event on ${event.startsOn || "no date"}`;
  if (!UNIT_WORDS[kind]) return "a series that doesn't repeat";
  const n = every(event);
  const how =
    n === 1 ? { day: "daily", week: "weekly", month: "monthly" }[kind] : `every ${n} ${UNIT_WORDS[kind]}s`;
  const days = (event.weekdays || []).map((day) => WEEKDAY_NAMES[day] || day);
  const on = kind === "week" && days.length ? ` on ${days.join(" and ")}` : "";
  const until = event.endsOn ? ` to ${event.endsOn}` : "";
  const added = (event.extraDates || []).length ? `, with ${count(event.extraDates.length, "night")} added by hand` : "";
  return `${how}${on} from ${event.startsOn || "no date"}${until}${added}`;
}

/** The one-off the owner wants. */
export function isOneOff(event) {
  return unit(event) === "once" && event.startsOn === DATE;
}

/** Still the weekly Wednesday series it was entered as. */
export function isWeeklyWednesdays(event) {
  return (
    unit(event) === "week" &&
    every(event) === 1 &&
    JSON.stringify(event.weekdays || []) === JSON.stringify(["wed"]) &&
    event.startsOn === DATE &&
    !event.endsOn &&
    !(event.extraDates || []).length
  );
}

/** Nights in ops other than the 11th: the later Wednesdays still to go. */
const laterNights = (event) => (event?.dates || []).filter((night) => night.date !== DATE);

/** What the later Wednesdays have, in words: nights, website pages, calendar entries. */
async function describeLater(env, nights) {
  const ids = nights.map((night) => night.sanityId).filter(Boolean);
  const live = ids.length ? (await sanityQuery(env, "production", "*[_id in $ids]._id", { ids })) || [] : [];
  const dates = nights.map((night) => night.date).sort();
  const range = dates.length > 1 ? `${dates[0]} to ${dates.at(-1)}` : dates[0];
  const what = [
    count(nights.length, "night") + " in ops",
    count(live.length, "page") + " on the website",
    count(nights.filter((night) => night.googleCalendarEventId).length, "calendar entry", "calendar entries"),
  ].join(", ");
  return `${count(nights.length, "later Wednesday")}, ${range}: ${what}`;
}

/**
 * Save the event as a one-off on the 11th, through the editor's own save.
 * @returns {Promise<{ event: object | null, changed: boolean, later: object[] }>}
 *   `event`: the one-off, when it is one now; `later`: the nights it had besides the 11th.
 */
export async function makeOneOff(env, log = () => {}, { dryRun = false } = {}) {
  const found = (await listEvents(env, { withDeleted: true })).filter((event) => event.slug === SLUG);
  if (!found.length) {
    log(`not found: no event at /whats-on/${SLUG}; nothing to do`);
    return { event: null, changed: false, later: [] };
  }
  const event = found[0];
  if (event.deletedAt) {
    log(`left alone: ${title(event)} is deleted in ops and waits on the Website page; nothing was changed`);
    return { event: null, changed: false, later: [] };
  }
  if (isOneOff(event)) return { event, changed: false, later: laterNights(event) };
  if (!isWeeklyWednesdays(event)) {
    log(
      `left alone: ${title(event)} is no longer the weekly Wednesday series from ${DATE}: it is ${scheduleInWords(event)}; nothing was changed`,
    );
    return { event: null, changed: false, later: [] };
  }

  const later = laterNights(event);
  const was = scheduleInWords(event);
  const described = later.length ? await describeLater(env, later) : "";
  // As ops makes a one-off: repeat "once", no weekdays, no end.
  const saved = await updateEvent(env, event.id, { repeatUnit: "once", repeatEvery: 1, weekdays: [], endsOn: "" });
  log(
    `${title(saved)} ${dryRun ? "would be" : "is now"} a one-off event on ${weekday(DATE)} ${DATE}, ${span(saved)}; it was ${was}`,
  );
  if (described) log(`    ${dryRun ? "would drop" : "dropped"} ${described}`);
  const tasks = later.filter((night) => night.clickupTaskId);
  if (tasks.length) {
    log(
      `    ${count(tasks.length, "ClickUp task")} of the later Wednesdays ${tasks.length === 1 ? "stays" : "stay"} in ClickUp (ops does not remove a dropped night's task): ${tasks.map((night) => `${night.date} ${night.clickupTaskId}`).join(", ")}`,
    );
  }
  log(`    kept: the ${DATE} night, its name, flyer, times, description and web address /whats-on/${saved.slug}`);
  return { event: saved, changed: true, later };
}

/** Nothing left to do on the website: no later Wednesday in ops, preview and website in step. */
function settled(event) {
  return !laterNights(event).length && !droppedNights(event).length && !previewBehind(event) && !liveNightsBehind(event);
}

/**
 * Bring the event's calendar entries, preview and website pages up to date,
 * as ops' website job does after a save. Throws if it does not get there.
 */
export async function putOnWebsite(env, id) {
  for (let step = 0; step < 30; step += 1) {
    const result = await runWebsiteJob(env, { eventId: id, retry: true });
    if (result.failed) throw new Error(`San Martino did not reach the website: ${result.failed}. Run again.`);
    if (result.done) break;
  }
  // With website.auto_update off the job stops at the preview; the owner asked for this one.
  if (!settled(await getEvent(env, id))) await putEventOnWebsite(env, id);
  const event = await getEvent(env, id);
  if (!settled(event)) {
    const left = laterNights(event).map((night) => night.date);
    throw new Error(
      `San Martino is a one-off in ops, but the website is not in step yet${left.length ? ` (still there: ${left.join(", ")})` : ""}. Run again, or press Update website for it in ops.`,
    );
  }
  return event;
}

/** Website documents of the later Wednesdays still there, drafts included. */
async function leftOnWebsite(env, nights) {
  const ids = nights.map((night) => night.sanityId).filter(Boolean);
  if (!ids.length) return [];
  const drafts = ids.map((id) => `drafts.${id}`);
  const [preview, live] = await Promise.all([
    sanityQuery(env, PREVIEW, "*[_id in $ids]._id", { ids: [...ids, ...drafts] }),
    sanityQuery(env, "production", "*[_id in $ids]._id", { ids }),
  ]);
  return [...new Set([...(preview || []), ...(live || [])])];
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { event, changed, later } = await makeOneOff(data.env, log, { dryRun });
  if (!event) return;
  if (!changed && !later.length) {
    log(`Nothing to do: ${title(event)} is a one-off event on ${weekday(DATE)} ${DATE}, and nothing of a later Wednesday is left.`);
    return;
  }
  if (!changed) log(`${title(event)} is already a one-off on ${DATE}; finishing: ${await describeLater(data.env, later)}`);
  if (dryRun) {
    log(
      `would put it on the website as a one-off (/whats-on/${event.slug}) and take the ${count(later.length, "later Wednesday")} off the website and the calendar`,
    );
    return;
  }
  const live = await putOnWebsite(data.env, event.id);
  const left = await leftOnWebsite(data.env, later);
  if (left.length) {
    throw new Error(`Still on the website for the later Wednesdays: ${left.join(", ")}. Run again.`);
  }
  log(
    `${title(live)} is on the website as a one-off: /whats-on/${live.slug}, ${weekday(DATE)} ${DATE} only; the ${count(later.length, "later Wednesday")} ${later.length === 1 ? "is" : "are"} gone from ops, the website and the calendar`,
  );
}
