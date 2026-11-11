/**
 * EPIC Jam is one event over two days, 21 and 22 November 2026. It was
 * entered as two one-off events, the second a copy named "… 2", so the
 * website has two pages for it. This makes it one event with two days, and
 * removes the copy.
 *
 * Ops already has this: an event that doesn't repeat, with each day added as
 * its own date (Schedule, "Doesn't repeat", Add night). Each day keeps its own
 * times and description, and the website shows one page listing both days.
 *
 * 1. The first event ("…Hip Hop Culture") gets the second day, with the
 *    copy's times, description and anything else that differs from the first
 *    day, read from the copy as it is when this runs. The first day keeps its
 *    own description. The event's description becomes both days' descriptions,
 *    each under its weekday. Its name, web address, flyer, Drive folder and
 *    the first day's times stay.
 * 2. The event goes on the website (calendar, preview, website: ops' website
 *    job, website-jobs.js), so the second day is there before the copy goes.
 * 3. The copy is deleted the way ops deletes an event (event-publish.js
 *    deleteEventFromOps), and that removal is published straight away for the
 *    copy's documents only (release.js), as in 2026-11-10-one-happy-hour: the
 *    owner asked for it. Its page, its night, its calendar entry go; its Drive
 *    folder goes to the bin. There is no Restore afterwards.
 *
 * Both are found by their exact name. The merge only happens while both are
 * one-off events on those two dates; otherwise everything is left and said
 * so. The copy only goes once the first event holds both days and is on the
 * website. Safe to run again: with one event holding both days and no copy,
 * there is nothing to do, and a run that stopped halfway is finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the merge runs on a copy
 * of the data (scripts/lib/d1-rehearsal.mjs), and for the website and the
 * removal it says what would happen, since the website and the calendar have
 * no copy to rehearse on.
 */
import { expandSeriesOccurrenceDates } from "../ops/site/src/events/event-recurrence.js";
import { resolveOccurrenceContent } from "../ops/site/src/events/server/event-content.js";
import { deleteEventFromOps, eventDocumentIds, putEventOnWebsite } from "../ops/site/src/events/server/event-publish.js";
import { ensureOccurrence, getEvent, listEvents, updateEvent } from "../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../ops/site/src/events/server/website-jobs.js";
import { PREVIEW, sanityQuery } from "../ops/site/src/platform/sanity.js";
import { markReleasedInOps, publishRelease } from "../ops/site/src/website/server/release.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = 'Events: EPIC Jam is one event over two days (21 and 22 November); the copy "… 2" removed';

export const KEEP = "EPIC Jam at Gwenda: A Weekend of Hip Hop Culture";
export const COPY = `${KEEP} 2`;
/** The two days: the first event's, and the copy's. */
export const DAYS = ["2026-11-21", "2026-11-22"];

/** What a day can have of its own, besides its description. */
const OWN = ["artist", "offer", "pageUrl", "shortDescription", "time", "startTime", "endTime", "operationsNotes"];

const named = (events, name) => events.filter((event) => String(event.name || "").trim() === name);
const title = (event) => `"${event.name}" (event ${event.id})`;
const unit = (event) => String(event.repeatUnit || "none").toLowerCase();
const count = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const weekday = (date) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${date}T12:00:00Z`).getUTCDay()];
const nightOn = (event, date) => (event.dates || []).find((night) => night.date === date) || null;

/** One event that doesn't repeat, holding both days. */
export function holdsBothDays(event) {
  const scheduled = new Set(expandSeriesOccurrenceDates(event));
  return unit(event) === "none" && DAYS.every((date) => scheduled.has(date) && nightOn(event, date));
}

/** Why the two can't be merged as they stand, or "". */
function whyNot(keep, copy) {
  if (unit(keep) !== "once" || keep.startsOn !== DAYS[0]) {
    return `${title(keep)} is no longer a one-off event on ${DAYS[0]}`;
  }
  if (unit(copy) !== "once" || copy.startsOn !== DAYS[1]) {
    return `${title(copy)} is no longer a one-off event on ${DAYS[1]}`;
  }
  if ((copy.gallery || []).length) {
    return `${title(copy)} has ${count(copy.gallery.length, "gallery photo")}, which would go with it; move them first`;
  }
  return "";
}

/** The second day's own details: what the copy has that differs from the first day. */
function secondDayOverrides(first, second, keep) {
  const overrides = { description: second.description };
  const inherited = [];
  for (const key of OWN) {
    if (second[key] && second[key] !== first[key]) overrides[key] = second[key];
    else if (!second[key] && first[key]) inherited.push(key);
  }
  if (JSON.stringify(second.nightSchedule || []) !== JSON.stringify(first.nightSchedule || [])) {
    overrides.nightSchedule = second.nightSchedule || [];
  }
  if (JSON.stringify(second.imageLinks || []) !== JSON.stringify(first.imageLinks || []) && second.imageLinks?.length) {
    overrides.imageLinks = second.imageLinks;
  }
  // Its own flyer, when the copy had a different one.
  if (second.image?.asset && second.image.asset !== keep.mainImage?.asset) overrides.image = { asset: second.image.asset };
  return { overrides, inherited };
}

/**
 * Put both days on the first event, through the editor's own saves.
 * @returns {Promise<{ keep: object | null, merged: boolean, changed: boolean }>}
 *   `keep`: the first event when it now holds both days.
 */
export async function mergeDays(env, log = () => {}, { dryRun = false } = {}) {
  const events = await listEvents(env, { withDeleted: true });
  const keepers = named(events, KEEP).filter((event) => !event.deletedAt);
  if (!keepers.length) {
    log(`not found: no event named "${KEEP}"; nothing to do`);
    return { keep: null, merged: false, changed: false };
  }
  if (keepers.length > 1) {
    log(`left alone: ${keepers.length} events are named "${KEEP}"`);
    return { keep: null, merged: false, changed: false };
  }
  const keep = keepers[0];
  if (holdsBothDays(keep)) return { keep, merged: true, changed: false };

  const copies = named(events, COPY);
  if (copies.length !== 1) {
    log(
      copies.length
        ? `left alone: ${copies.length} events are named "${COPY}"`
        : `left alone: ${title(keep)} does not hold both days, and there is no "${COPY}" to take the second day from`,
    );
    return { keep: null, merged: false, changed: false };
  }
  const copy = copies[0];
  const why = whyNot(keep, copy);
  if (why) {
    log(`left alone: ${why}; nothing was merged or removed`);
    return { keep: null, merged: false, changed: false };
  }

  const first = resolveOccurrenceContent(keep, nightOn(keep, DAYS[0]) || DAYS[0]);
  const second = resolveOccurrenceContent(copy, nightOn(copy, DAYS[1]) || DAYS[1]);
  const { overrides, inherited } = secondDayOverrides(first, second, keep);
  const span = (day) => [day.startTime, day.endTime].filter(Boolean).join(" to ") || "no times";
  const would = dryRun ? "would get" : "gets";

  // The first day keeps its own words, whatever the event's description says.
  await ensureOccurrence(env, keep.id, DAYS[0], {
    ...(nightOn(keep, DAYS[0])?.overrides || {}),
    description: first.description,
  });
  await ensureOccurrence(env, keep.id, DAYS[1], overrides);
  log(
    `${title(keep)} ${would} a second day, ${weekday(DAYS[1])} ${DAYS[1]}, ${span(second)}, from ${title(copy)}: "${second.description}"`,
  );
  const own = Object.keys(overrides).filter((key) => !["description", "startTime", "endTime"].includes(key));
  if (own.length) log(`    the second day also keeps its own: ${own.join(", ")}`);
  if (inherited.length) log(`    the copy had no ${inherited.join(", ")}; the second day shows the event's`);
  log(`    ${weekday(DAYS[0])} ${DAYS[0]} stays ${span(first)}: "${first.description}"`);

  // Last, and in one save: until it lands the event is still a one-off, so a
  // run that stopped before here starts again from the same descriptions.
  const description =
    first.description && second.description && first.description !== second.description
      ? `${weekday(DAYS[0])}: ${first.description}\n\n${weekday(DAYS[1])}: ${second.description}`
      : first.description || second.description;
  const saved = await updateEvent(env, keep.id, { repeatUnit: "none", description });
  log(`    it ${dryRun ? "would be" : "is now"} one event that doesn't repeat, with both days; its description says both: ${JSON.stringify(description)}`);
  log(`    dropped: the copy's name "${copy.name}"; the flyer, name and web address /whats-on/${keep.slug} stay`);
  return { keep: saved, merged: holdsBothDays(saved), changed: true };
}

/**
 * Bring the event's calendar entries, preview and website pages up to date,
 * as ops' website job does after a save. Throws if it does not get there.
 */
export async function putOnWebsite(env, id) {
  for (let step = 0; step < 30; step += 1) {
    const result = await runWebsiteJob(env, { eventId: id, retry: true });
    if (result.failed) throw new Error(`The event did not reach the website: ${result.failed}. The copy was left. Run again.`);
    if (result.done) break;
  }
  // With website.auto_update off the job stops at the preview; the owner asked for this one.
  if ((await getEvent(env, id)).publish?.live !== "current") await putEventOnWebsite(env, id);
  const event = await getEvent(env, id);
  if (event.publish?.live !== "current") {
    throw new Error("The event's two days are not on the website yet. The copy was left. Run again.");
  }
  return event;
}

/** Delete one event in ops and take it off the website now. Returns what went, in words. */
async function removeEvent(env, event, { dryRun }) {
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
    // Update website, for this event only. Nothing of it may still be a
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
    const waiting = named(await listEvents(env, { withDeleted: true }), COPY).some((row) => String(row.id) === String(event.id));
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
 * Remove the copy (also one deleted in ops that still waits on the Website page).
 * @returns {Promise<number>} how many went
 */
export async function removeCopy(env, keep, log = () => {}, { dryRun = false } = {}) {
  let removed = 0;
  for (const copy of named(await listEvents(env, { withDeleted: true }), COPY)) {
    const what = await removeEvent(env, copy, { dryRun });
    removed += 1;
    log(`${dryRun ? `would remove ${title(copy)}` : `${title(copy)} removed`}: ${what}; ${title(keep)} stays, with both days`);
  }
  return removed;
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { keep, merged, changed } = await mergeDays(data.env, log, { dryRun });
  if (!merged) return;
  if (dryRun) {
    if (changed) log(`would put ${title(keep)} on the website with both days, before the copy goes`);
  } else {
    const before = keep.publish?.live;
    const live = await putOnWebsite(data.env, keep.id);
    if (changed || before !== "current") {
      log(`${title(live)} is on the website with both days: /whats-on/${live.slug}`);
    }
  }
  const removed = await removeCopy(data.env, keep, log, { dryRun });
  if (!changed && !removed) log(`Nothing to do: ${title(keep)} is one event with both days, and there is no copy.`);
  else if (removed) {
    log(
      dryRun
        ? "1 event to remove, from ops, the website and the calendar."
        : "The copy is gone from ops, the website and the calendar. Its Drive folder is in the bin.",
    );
  }
}
