/**
 * Putting saved events on the website, in the background.
 *
 * Saving only stores the event, so it returns at once. Afterwards the event
 * still needs its Google Calendar entries, its preview documents (drafts)
 * and then the website itself brought up to date: nobody has to press Update
 * website for a save to show. There is no queue table: the data already says
 * which events are behind (each night's stored calendar hash, and its preview
 * and website snapshots), so the queue is worked out every time and can't
 * drift or be lost.
 *
 * Work runs one step per request (Cloudflare's free plan allows 50 outbound
 * calls per request), so a series of ninety nights is many short requests,
 * never one long one: up to CALENDAR_STEP nights of calendar, or PREVIEW_STEP
 * nights of preview, or LIVE_STEP documents onto the website. The open ops
 * app runs steps back to back; the deploy webhook's cron runs one every few
 * minutes when nobody has ops open.
 *
 * What does not go by itself: an event deleted in ops (it waits on the
 * Website page, with Restore), and anything at all when the setting
 * `website.auto_update` is "off": then events stop at the preview and wait
 * for Update website, as they did before. And on hosted dev, nothing goes by
 * itself while a developer runs `npm run ops:dev` (website/server/local-ops.js,
 * #300): the queue (no `eventId`) waits; a step for an event someone just
 * saved still runs.
 *
 * A step that fails is remembered against the event's content, so it is not
 * retried in a loop. Changing the event, or "Try again", clears it.
 */
import { environmentOf, readState, writeState } from "../../../../../shared/config.js";
import { AUTO_UPDATE_KEY, websiteFollowsSaves } from "../../website/server/auto-update.js";
import { localOpsPause } from "../../website/server/local-ops.js";
import {
  calendarConfigured,
  calendarNightsBehind,
  syncSeriesCalendar,
} from "./event-calendar-sync.js";
import { occurrenceHash, seriesAwaitingDates } from "./event-content.js";
import {
  publishEventPreview,
  putEventOnWebsite,
  readSeriesLive,
  readSeriesPreviews,
  seriesPreviewHash,
  withWebsiteStatus,
} from "./event-publish.js";
import { droppedNights, getEvent, listEvents, liveNightsBehind, previewBehind } from "./event-store.js";

export const CALENDAR_STEP = 12;
/** Nights staged on the preview in one step: a draft and a ClickUp task each. */
export const PREVIEW_STEP = 12;
/** Documents put on (or taken off) the website in one step. */
export const LIVE_STEP = 20;
export const FAILURES_KEY = "site.prep_failures";
/** Saved events go on the website by themselves unless the setting says "off" (the website's rule, shared with opening hours). */
export { AUTO_UPDATE_KEY, websiteFollowsSaves };

/** Changes whenever anything the calendar or website shows changes. */
export function contentSignature(event) {
  const byDate = new Map((event?.dates || []).map((row) => [row.date, row]));
  const text = [
    ...(event?.publish?.previewDates || []).map((date) =>
      occurrenceHash(event, byDate.get(date) || date),
    ),
    ...(seriesAwaitingDates(event) ? [seriesPreviewHash(event)] : []),
  ].join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * What this event still needs, or null when it is done: its calendar
 * entries, its preview copy, then (`live`) the website itself, once the
 * preview is in step. `seriesPreviews` and `seriesLive` (readSeriesPreviews,
 * readSeriesLive) cover a series waiting for dates, which has no nights to
 * hold a snapshot. `autoUpdate: false` stops at the preview.
 */
export function prepNeeded(
  event,
  { calendar = true, seriesPreviews = {}, seriesLive = {}, autoUpdate = true } = {},
) {
  // A deleted event waits for Update website; nothing to get ready (#23).
  if (!event?.id || event.deletedAt) return null;
  const awaiting = seriesAwaitingDates(event);
  // An ended series has no upcoming nights but may still have some to take off.
  if (!awaiting && !event.publish?.previewDates?.length && !droppedNights(event).length) {
    return null;
  }
  const calendarBehind = calendar ? calendarNightsBehind(event) : 0;
  const preview =
    previewBehind(event) ||
    (awaiting && seriesPreviews[String(event.id)] !== seriesPreviewHash(event));
  const live =
    autoUpdate &&
    !preview &&
    (liveNightsBehind(event) > 0 || (awaiting && seriesLive[String(event.id)] !== seriesPreviewHash(event)));
  if (!calendarBehind && !preview && !live) return null;
  return { calendarBehind, preview, live };
}

export function parseFailures(text) {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readFailures(env) {
  return parseFailures(
    await readState(env, "ops", FAILURES_KEY, environmentOf(env)).catch(() => ""),
  );
}

async function writeFailures(env, failures) {
  await writeState(env, "ops", FAILURES_KEY, environmentOf(env), JSON.stringify(failures));
}

/** A failure only counts while the event is unchanged since it failed. */
export function currentFailure(failures, event) {
  const failure = failures[String(event.id)];
  return failure && failure.signature === contentSignature(event) ? failure : null;
}

/** Every event that is not ready yet, in the order the runner takes them. */
export function jobsFrom(events, failures, options = {}) {
  const jobs = [];
  for (const event of events) {
    const needs = prepNeeded(event, options);
    if (!needs) continue;
    const failure = currentFailure(failures, event);
    jobs.push({
      eventId: String(event.id),
      name: event.name,
      state: failure ? "failed" : "waiting",
      error: failure?.message || "",
      failedAt: failure?.at || null,
    });
  }
  return jobs;
}

/** `events`: the event list when the caller already has it (the dashboard). */
export async function listWebsiteJobs(env, { events: known = null } = {}) {
  const [events, failures, options] = await Promise.all([
    known || listEvents(env),
    readFailures(env),
    jobOptions(env),
  ]);
  return jobsFrom(events, failures, options);
}

/** What prepNeeded has to know besides the event. */
async function jobOptions(env) {
  const [calendar, seriesPreviews, seriesLive, autoUpdate] = await Promise.all([
    calendarConfigured(env),
    readSeriesPreviews(env),
    readSeriesLive(env),
    websiteFollowsSaves(env),
  ]);
  return { calendar, seriesPreviews, seriesLive, autoUpdate };
}

/** Earlier failures for events that are ready now or have changed: drop them. */
function prunedFailures(failures, event) {
  const next = { ...failures };
  delete next[String(event.id)];
  return next;
}

/**
 * Run one step for `eventId`, or for the first waiting event when none is
 * given. `retry` runs an event even though it failed before.
 * Returns { idle } when there is nothing to do, and { idle, paused } when
 * the queue waits for local ops (hosted dev only, see the header).
 */
export async function runWebsiteJob(env, { eventId = "", retry = false } = {}) {
  if (!eventId) {
    const paused = await localOpsPause(env);
    if (paused) return { idle: true, paused };
  }
  const failures = await readFailures(env);
  const options = await jobOptions(env);
  let event;
  if (eventId) {
    event = await getEvent(env, eventId);
  } else {
    const events = await listEvents(env);
    event = events.find((row) => prepNeeded(row, options) && !currentFailure(failures, row));
    if (!event) return { idle: true };
  }

  const needs = prepNeeded(event, options);
  const failed = currentFailure(failures, event);
  if (!needs || (failed && !retry)) {
    if (!needs && failures[String(event.id)]) await writeFailures(env, prunedFailures(failures, event));
    const ready = await withWebsiteStatus(env, event);
    return { eventId: String(event.id), done: !needs, failed: failed?.message || "", event: ready };
  }

  const warnings = [];
  try {
    if (needs.calendarBehind) {
      const result = await syncSeriesCalendar(env, event, { maxWrites: CALENDAR_STEP });
      warnings.push(...(result.warnings || []));
      const fresh = await getEvent(env, event.id);
      // Nothing moved: the calendar is refusing these nights. Stop retrying.
      if (calendarNightsBehind(fresh) >= needs.calendarBehind) {
        throw new Error(warnings[0] || "Google Calendar did not take the changes.");
      }
      event = fresh;
    } else if (needs.preview) {
      const result = await publishEventPreview(env, event.id, { maxNights: PREVIEW_STEP });
      warnings.push(...(result.warnings || []));
      event = result.event;
      options.seriesPreviews = await readSeriesPreviews(env);
      // With nights left for the next step it moved on; otherwise it must be in step now.
      if (!result.remaining && previewBehind(event)) {
        throw new Error("The website copy is still out of date after updating it.");
      }
    } else {
      const behind = liveNightsBehind(event);
      const result = await putEventOnWebsite(env, event.id, { maxDocuments: LIVE_STEP });
      warnings.push(...(result.warnings || []));
      // As ops has it: putEventOnWebsite answers with the status read from the website.
      event = await getEvent(env, event.id);
      options.seriesLive = await readSeriesLive(env);
      // Nothing moved: the website is refusing these. Stop retrying.
      if (behind ? liveNightsBehind(event) >= behind : prepNeeded(event, options)?.live) {
        throw new Error(warnings[0] || "The website did not take the changes.");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    await writeFailures(env, {
      ...failures,
      [String(event.id)]: { message, at: new Date().toISOString(), signature: contentSignature(event) },
    });
    return { eventId: String(event.id), done: false, failed: message, warnings };
  }

  const done = !prepNeeded(event, options);
  if (failures[String(event.id)]) await writeFailures(env, prunedFailures(failures, event));
  return {
    eventId: String(event.id),
    done,
    failed: "",
    warnings,
    event: done ? await withWebsiteStatus(env, event) : event,
  };
}
