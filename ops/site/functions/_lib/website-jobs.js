/**
 * Getting saved events ready for the website, in the background.
 *
 * Saving only writes Baserow. Afterwards each event still needs its Google
 * Calendar entries and its preview (preview) documents brought up to date.
 * There is no queue table: the data already says which events are behind
 * (publish.preview, and each night's stored calendar hash), so the queue is
 * worked out every time and can't drift or be lost.
 *
 * Work runs one step per request (Cloudflare's free plan allows 50 outbound
 * calls per request): up to CALENDAR_STEP nights of calendar, or preview one
 * event. The open ops app runs steps back to back; the deploy webhook's cron
 * runs one every few minutes when nobody has ops open.
 *
 * A step that fails is remembered against the event's content, so it is not
 * retried in a loop. Changing the event, or "Try again", clears it.
 */
import { environmentOf, readState, writeState } from "../../../../shared/config.js";
import {
  calendarConfigured,
  calendarNightsBehind,
  syncSeriesCalendar,
} from "./event-calendar-sync.js";
import { occurrenceHash } from "./event-content.js";
import { publishEventPreview, withWebsiteStatus } from "./event-publish.js";
import { getEvent, listEvents } from "./event-store.js";

export const CALENDAR_STEP = 12;
const FAILURES_KEY = "site.prep_failures";

/** Changes whenever anything the calendar or website shows changes. */
export function contentSignature(event) {
  const byDate = new Map((event?.dates || []).map((row) => [row.date, row]));
  const text = (event?.publish?.previewDates || [])
    .map((date) => occurrenceHash(event, byDate.get(date) || date))
    .join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** What this event still needs, or null when it is ready. */
export function prepNeeded(event, { calendar = true } = {}) {
  if (!event?.id || !event.publish?.previewDates?.length) return null;
  const calendarBehind = calendar ? calendarNightsBehind(event) : 0;
  const preview = event.publish.preview !== "current";
  if (!calendarBehind && !preview) return null;
  return { calendarBehind, preview };
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
export function jobsFrom(events, failures, { calendar = true } = {}) {
  const jobs = [];
  for (const event of events) {
    const needs = prepNeeded(event, { calendar });
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

export async function listWebsiteJobs(env) {
  const [events, failures, calendar] = await Promise.all([
    listEvents(env),
    readFailures(env),
    calendarConfigured(env),
  ]);
  return jobsFrom(events, failures, { calendar });
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
 * Returns { idle } when there is nothing to do.
 */
export async function runWebsiteJob(env, { eventId = "", retry = false } = {}) {
  const failures = await readFailures(env);
  const calendar = await calendarConfigured(env);
  let event;
  if (eventId) {
    event = await getEvent(env, eventId);
  } else {
    const events = await listEvents(env);
    event = events.find(
      (row) => prepNeeded(row, { calendar }) && !currentFailure(failures, row),
    );
    if (!event) return { idle: true };
  }

  const needs = prepNeeded(event, { calendar });
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
    } else {
      const result = await publishEventPreview(env, event.id);
      warnings.push(...(result.warnings || []));
      event = result.event;
      if (event.publish?.preview !== "current") {
        throw new Error("The website copy is still out of date after updating it.");
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

  const done = !prepNeeded(event, { calendar });
  if (failures[String(event.id)]) await writeFailures(env, prunedFailures(failures, event));
  return {
    eventId: String(event.id),
    done,
    failed: "",
    warnings,
    event: done ? await withWebsiteStatus(env, event) : event,
  };
}
