/**
 * One happy hour, Wednesday to Saturday. It was entered twice: "Happy Hour"
 * and "From Wednesday to Saturday is the Cocktail Hour 🍹". The owner keeps
 * the Cocktail Hour, under the plain name "Cocktail Hour 🍹", and it runs
 * Wednesday to Saturday (ops had it on Sundays too). "Happy Hour" is removed.
 *
 * The Cocktail Hour is renamed "Cocktail Hour 🍹" through the editor's own
 * save (event-store.js updateEvent), as when staff rename a series: its web
 * address stays as it is
 * (/whats-on/from-wednesday-to-saturday-is-the-cocktail-hour), so links, its
 * nights' pages and their documents keep their ids. The website shows the new
 * name with the series' next website update, which ops' website job does by
 * itself. A series already named "Cocktail Hour 🍹" is the Cocktail Hour too:
 * every step here takes either name. The rename runs after step 1.
 *
 * 1. "Happy Hour" is deleted the way ops deletes a series
 *    (event-publish.js deleteEventFromOps): its pages and nights are marked
 *    removed on the preview and its calendar entries go. In ops a deleted
 *    series that is on the website then waits on the Website page, with
 *    Restore, until someone presses Update website. Here nobody has to: the
 *    owner asked for it to go, so the migration publishes that removal
 *    straight away, for this series' documents only (release.js
 *    publishRelease and markReleasedInOps, what Update website runs). The
 *    series and its nights then leave ops, and its Drive folder goes to the
 *    bin. There is no Restore afterwards.
 * 2. The Cocktail Hour loses its Sunday through the editor's own save
 *    (event-store.js updateEvent), so its nights follow: Sundays to come
 *    leave the calendar and the website with the series' next website
 *    update, which ops' website job does by itself, as after any save.
 * 3. Nights of the Cocktail Hour still on the website that ops has no row
 *    for, on a day it no longer runs (Mondays and Tuesdays, from when it ran
 *    every day): no save in ops can reach them, so they are taken off the
 *    website here, the way a dropped night goes (event-publish.js
 *    markNightsRemoved, then release.js publishRelease for those nights
 *    only). Only nights to come, only on days the series doesn't run.
 *
 * Series are found by their exact name (the Cocktail Hour by its old or its
 * new one). "Happy Hour" is only removed while the Cocktail Hour is there
 * with nights to come; otherwise it is left and said so. Only Sunday is taken from the Cocktail Hour's days, and only if it
 * repeats weekly. Safe to run again: with "Happy Hour" gone, the name changed, no Sunday
 * left and no stray night there is nothing to do, and a removal that stopped
 * halfway is finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the Cocktail Hour's name and days
 * change on a copy of the data (scripts/lib/d1-rehearsal.mjs), and for "Happy
 * Hour" and the stray nights it says what would go, since the website and the
 * calendar have no copy to rehearse on.
 */
import { deleteEventFromOps, eventDocumentIds, markNightsRemoved } from "../ops/site/src/events/server/event-publish.js";
import { listEvents, updateEvent } from "../ops/site/src/events/server/event-store.js";
import { PREVIEW, sanityQuery } from "../ops/site/src/platform/sanity.js";
import { markReleasedInOps, publishRelease } from "../ops/site/src/website/server/release.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = 'Events: one happy hour, Wednesday to Saturday ("Happy Hour" removed, the Cocktail Hour without Sunday)';

export const REMOVE = "Happy Hour";
/** The Cocktail Hour's name from now on, and the one it was entered under. */
export const KEEP = "Cocktail Hour 🍹";
export const KEEP_WAS = "From Wednesday to Saturday is the Cocktail Hour 🍹";
/** The day the Cocktail Hour loses. */
export const DROP_DAY = "sun";

const named = (events, name) => events.filter((event) => String(event.name || "").trim() === name);
/** The Cocktail Hour, under either name. */
const kept = (events) => [...named(events, KEEP), ...named(events, KEEP_WAS)];
const count = (n, word, many = `${word}s`) => `${n} ${n === 1 || word === "series" ? word : many}`;
const title = (event) => `"${event.name}" (series ${event.id})`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isSunday(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
}

/** Delete one series in ops and take it off the website now. Returns what went, in words. */
async function removeSeries(env, event, { dryRun }) {
  const ids = await eventDocumentIds(env, event);
  const live = (await sanityQuery(env, "production", "*[_id in $ids]._id", { ids })) || [];
  const nights = event.dates || [];
  const what = [
    `${count(nights.length, "night")} in ops`,
    count(live.length, "website document"),
    count(nights.filter((night) => night.googleCalendarEventId).length, "calendar entry", "calendar entries"),
    ...(event.driveFolderId ? ["its Drive folder"] : []),
  ].join(", ");
  if (dryRun) return what;

  const { pending, warnings } = await deleteEventFromOps(env, event.id);
  if (pending) {
    // Update website, for this series only. Nothing of it may still be a
    // plain draft, or publishing would put that on the website instead.
    const unmarked = (await sanityQuery(env, PREVIEW, "*[_id in $ids && removed != true]._id", { ids })) || [];
    if (unmarked.length) {
      throw new Error(
        `${title(event)} is deleted in ops, but ${count(unmarked.length, "website document")} could not be marked removed (${warnings.join("; ") || "no reason given"}). Nothing was published. Run again, or restore it on the Website page in ops.`,
      );
    }
    const result = await publishRelease(env, { ids });
    await markReleasedInOps(env, result.written, { deleted: result.deleted });
    warnings.push(...result.warnings);
    const waiting = named(await listEvents(env, { withDeleted: true }), REMOVE).some((row) => String(row.id) === String(event.id));
    // Still in ops with nothing left on the website: ops lets it go at once.
    if (waiting && (await deleteEventFromOps(env, event.id)).pending) {
      throw new Error(
        `${title(event)} is deleted in ops but still on the website: ${warnings.join("; ") || "the website kept some of its pages"}. Run again, or press Update website on the Website page in ops.`,
      );
    }
  }
  return warnings.length ? `${what}. Notes: ${warnings.join("; ")}` : what;
}

/**
 * Remove every series named REMOVE, while the one that is kept is there.
 * @returns {Promise<{ removed: number, skipped: string }>} `skipped`: why nothing was done, if so
 */
export async function removeDuplicate(env, log = () => {}, { dryRun = false, now = today() } = {}) {
  // One that was deleted in ops and waits on the Website page is finished too.
  const events = await listEvents(env, { withDeleted: true });
  const remove = named(events, REMOVE);
  if (!remove.length) {
    const skipped = `not found: no series named "${REMOVE}"; nothing to remove`;
    log(skipped);
    return { removed: 0, skipped };
  }
  const keeper = kept(events).find(
    (event) => !event.deletedAt && (event.dates || []).some((night) => night.date >= now),
  );
  if (!keeper) {
    const skipped = `left alone: the Cocktail Hour ("${KEEP}" or "${KEEP_WAS}") is not there with nights to come, so "${REMOVE}" (series ${remove.map((event) => event.id).join(", ")}) would be the only happy hour`;
    log(skipped);
    return { removed: 0, skipped };
  }
  let removed = 0;
  for (const event of remove) {
    const what = await removeSeries(env, event, { dryRun });
    removed += 1;
    log(`${dryRun ? `would remove ${title(event)}` : `${title(event)} removed`}: ${what}; ${title(keeper)} stays`);
  }
  return { removed, skipped: "" };
}

/**
 * Rename the series named KEEP_WAS to KEEP, through the editor's save: the
 * web address stays, as for any rename in ops.
 * @returns {Promise<{ renamed: number }>}
 */
export async function renameKept(env, log = () => {}, { dryRun = false } = {}) {
  const events = await listEvents(env);
  let renamed = 0;
  for (const event of named(events, KEEP_WAS)) {
    const taken = named(events, KEEP)[0];
    if (taken) {
      log(`left alone: ${title(event)} was not renamed, because ${title(taken)} already has that name`);
      continue;
    }
    renamed += 1;
    if (dryRun) {
      // The save also renames the Drive folder, which has no copy to rehearse on: only the name, on the copy.
      await env.eventRepository.update(event.id, { name: KEEP });
      log(`would rename ${title(event)} "${KEEP}"${event.driveFolderId ? ", and its Drive folder" : ""}; its web address would stay /whats-on/${event.slug}`);
      continue;
    }
    await updateEvent(env, event.id, { name: KEEP });
    log(`${title(event)} is now "${KEEP}"; its web address stays /whats-on/${event.slug}, and the website shows the new name with its next website update, which ops does by itself`);
  }
  return { renamed };
}

/**
 * Take DROP_DAY from the days of every series named KEEP, through the
 * editor's save, so its nights follow.
 * @returns {Promise<{ changed: number }>}
 */
export async function dropSunday(env, log = () => {}, { now = today() } = {}) {
  let changed = 0;
  for (const event of kept(await listEvents(env))) {
    const unit = String(event.repeatUnit || "none").toLowerCase();
    const days = event.weekdays || [];
    if (unit !== "week") {
      log(`left alone: ${title(event)} does not repeat weekly (${unit}); its days were not changed`);
      continue;
    }
    if (!days.includes(DROP_DAY)) {
      log(`${title(event)} runs ${days.join(", ") || "on no set day"} and has no Sunday; nothing to do`);
      continue;
    }
    const weekdays = days.filter((day) => day !== DROP_DAY);
    if (!weekdays.length) {
      log(`left alone: ${title(event)} runs on Sundays only; without them it would have no nights`);
      continue;
    }
    const sundays = (event.dates || []).filter((night) => night.date >= now && isSunday(night.date));
    await updateEvent(env, event.id, { weekdays });
    changed += 1;
    log(
      `${title(event)}: Sunday dropped, now ${weekdays.join(", ")}; ${count(sundays.length, "Sunday night")} to come leave the website with its next website update, which ops does by itself`,
    );
  }
  return { changed };
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_NAMES = { sun: "Sundays", mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays" };
const dayOf = (date) => DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

/**
 * Take off the website the nights to come of every series named KEEP that
 * ops has no row for, on a day the series doesn't run. Run after dropSunday.
 * @returns {Promise<{ taken: number }>}
 */
export async function removeStrays(env, log = () => {}, { dryRun = false, now = today() } = {}) {
  let taken = 0;
  for (const event of kept(await listEvents(env))) {
    const days = event.weekdays || [];
    if (String(event.repeatUnit || "none").toLowerCase() !== "week" || !days.length) continue;
    const known = new Set((event.dates || []).map((night) => night.sanityId).filter(Boolean));
    const groq = `*[_type == "event" && seriesId == $slug && date >= $now]{ _id, date }`;
    const params = { slug: event.slug, now };
    const found = [
      ...((await sanityQuery(env, "production", groq, params)) || []),
      ...((await sanityQuery(env, PREVIEW, groq, params)) || []),
    ];
    const strays = [...new Map(found.map((doc) => [doc._id, doc])).values()]
      .filter((doc) => !known.has(doc._id) && !days.includes(dayOf(doc.date)))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!strays.length) continue;
    const which = DAYS.filter((day) => strays.some((doc) => dayOf(doc.date) === day)).map((day) => DAY_NAMES[day]).join(" and ");
    if (dryRun) {
      log(`${title(event)}: would take ${count(strays.length, "night")} off the website that ops doesn't have (${which}): ${strays.map((doc) => doc.date).join(", ")}`);
      taken += strays.length;
      continue;
    }
    const ids = strays.map((doc) => doc._id);
    const marked = await markNightsRemoved(env, ids.map((sanityId) => ({ sanityId })));
    if (marked.warnings.length) {
      throw new Error(`${title(event)}: ${count(ids.length, "stray night")} could not be marked removed (${marked.warnings.join("; ")}). Nothing was published. Run again.`);
    }
    const result = await publishRelease(env, { ids });
    await markReleasedInOps(env, result.written, { deleted: result.deleted });
    taken += strays.length;
    log(
      `${title(event)}: ${count(strays.length, "night")} taken off the website that ops doesn't have (${which})${result.warnings.length ? `. Notes: ${result.warnings.join("; ")}` : ""}`,
    );
  }
  return { taken };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { removed } = await removeDuplicate(data.env, log, { dryRun });
  const { renamed } = await renameKept(data.env, log, { dryRun });
  const { changed } = await dropSunday(data.env, log);
  const { taken } = await removeStrays(data.env, log, { dryRun });
  if (!removed && !renamed && !changed && !taken) log("Nothing to do: nothing was removed or changed.");
  if (renamed) log(`${count(renamed, "series")} ${dryRun ? "to rename" : "renamed"}: "${KEEP}".`);
  if (removed) {
    log(
      dryRun
        ? `${count(removed, "series")} to remove, from ops, the website and the calendar.`
        : `${count(removed, "series")} removed, from ops, the website and the calendar. Its Drive folder is in the bin.`,
    );
  }
  if (changed) log(`${count(changed, "series")} ${dryRun ? "to change" : "changed"}: Wednesday to Saturday.`);
}
