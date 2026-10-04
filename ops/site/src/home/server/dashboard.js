/**
 * GET /api/dashboard: what needs doing, from every source at once.
 *
 * Each section loads on its own (Promise.allSettled), so one slow or broken
 * source shows as an error on its card and never blanks the page. Sections
 * are slim: the dashboard needs counts and a few rows, not the full lists the
 * other pages load (/api/events alone is ~200KB).
 *
 * Menu and stock analysis stay in the browser (dashboard.ts), and Sentry has
 * its own cached endpoint (api/health/errors.js) because it is slow.
 */
import { listArtists } from "../../../../../shared/artists.js";
import { runsOnMachine } from "../../platform/sanity.js";
import { expandSeriesOccurrenceDates, formatIsoDate, parseIsoDate, todayIso } from "../../events/event-recurrence.js";
import { calendarConfigured, calendarNightsBehind } from "../../events/server/event-calendar-sync.js";
import { resolveOccurrenceContent } from "../../events/server/event-content.js";
import { withWebsiteStatus } from "../../events/server/event-publish.js";
import { listEvents } from "../../events/server/event-store.js";
import { listWebsiteJobs } from "../../events/server/website-jobs.js";
import { listFormSubmissions } from "../../forms/server/form-submissions.js";
import { fetchMonitorStatus, SITE_HEALTH_URL } from "../../website/server/web-status.js";
import { siteStatus } from "../../website/server/site-pending.js";
import { siteUrls } from "../../website/server/site-urls.js";

/** Tonight plus this many days. */
export const UPCOMING_DAYS = 7;
const PLAY_FORM = "play";
const PENDING_ITEMS = 5;

function addDays(iso, days) {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

/**
 * Every night from `today` through `today + days`, earliest first. Uses the
 * same dates the schedule shows: the series' own nights plus the ones it will
 * have, never a night the schedule dropped.
 */
export function upcomingNights(events, { today = todayIso(), days = UPCOMING_DAYS, calendar = false } = {}) {
  const end = addDays(today, days);
  const nights = [];
  for (const event of events || []) {
    if (!event?.id || event.deletedAt) continue;
    const materialized = new Set(expandSeriesOccurrenceDates(event));
    const byDate = new Map();
    for (const row of event.dates || []) {
      if (materialized.has(row.date)) byDate.set(row.date, row);
    }
    for (const date of event.publish?.previewDates || []) {
      if (!byDate.has(date)) byDate.set(date, null);
    }
    const inWindow = [...byDate.keys()].filter((date) => date >= today && date <= end);
    if (!inWindow.length) continue;
    const calendarBehind = calendar ? calendarNightsBehind(event, today) : 0;
    for (const date of inWindow) {
      const content = resolveOccurrenceContent(event, byDate.get(date) || date);
      nights.push({
        eventId: String(event.id),
        date,
        title: content.title || event.name || "Untitled event",
        artist: content.artist,
        startTime: content.startTime,
        endTime: content.endTime,
        live: event.publish?.live || "unpublished",
        preview: event.publish?.preview || "unpublished",
        calendarBehind,
      });
    }
  }
  return nights.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime || "99").localeCompare(b.startTime || "99") ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Events whose preview is ready and only Update website is left. Events whose
 * preview is still behind are website jobs, counted there instead.
 */
export function eventsWaitingForUpdate(events) {
  return (events || [])
    .filter((event) => event?.id && !event.deletedAt)
    .filter((event) => event.publish?.preview === "current" && event.publish?.live !== "current")
    .map((event) => ({
      id: String(event.id),
      name: event.name || "Untitled event",
      change: event.publish.live === "unpublished" ? "added" : "changed",
    }));
}

function slimSubmission(row) {
  return {
    id: row.id,
    name: row.name || row.submitted?.name || row.email || "",
    email: row.email,
    formSlug: row.formSlug,
    formTitle: row.formTitle,
    submittedAt: row.submittedAt,
    decision: row.decision || "",
    notifySentAt: row.notifySentAt || "",
    receiptSentAt: row.receiptSentAt || "",
  };
}

/**
 * Play applications nobody has approved or declined yet (the "To review" rows
 * on /forms), oldest first, and submissions whose emails never went out.
 * Status is left over from email verification and means nothing now.
 */
export function formsSummary(submissions) {
  const rows = (submissions || []).filter((row) => row?.id);
  const toReview = rows
    .filter((row) => row.formSlug === PLAY_FORM && !row.decision)
    .map(slimSubmission)
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
  const emailFailed = rows
    .filter((row) => !row.notifySentAt || !row.receiptSentAt)
    .map(slimSubmission);
  return { toReview, emailFailed };
}

function slimArtist(artist) {
  if (!artist) return null;
  return {
    id: artist.id,
    name: artist.artistName || artist.name || "",
    startMonth: artist.startMonth || "",
    endMonth: artist.endMonth || "",
  };
}

export function artistsSummary(artists) {
  const list = artists || [];
  return {
    current: slimArtist(list.find((artist) => artist.slot === "current")),
    next: slimArtist(list.find((artist) => artist.slot === "next")),
  };
}

function slimSite(status) {
  return {
    known: status.known,
    builtAt: status.builtAt,
    count: status.items.length,
    items: status.items.slice(0, PENDING_ITEMS).map((item) => ({ label: item.label, change: item.change })),
    updating: status.updating,
    runUrl: status.runUrl,
    failed: status.failed,
    needsHelp: status.needsHelp,
    lastError: status.lastError,
    autoUpdateAt: status.autoUpdateAt,
  };
}

function slimHealthSite(id, site) {
  if (!site) return null;
  const checks = Array.isArray(site.lastProbe?.checks) ? site.lastProbe.checks : [];
  return {
    id,
    url: site.url || "",
    ok: site.ok !== false && !site.down,
    down: Boolean(site.down),
    consecutiveFails: site.consecutiveFails || 0,
    lastCheckedAt: site.lastCheckedAt ?? null,
    lastError: site.lastError || "",
    checks: checks.map((check) => ({
      name: String(check?.name || "check"),
      ok: check?.ok === true,
      status: check?.status ?? null,
      error: check?.error || "",
    })),
  };
}

/** The site-health Worker's last probe of both sites, check by check. */
export function healthSummary(monitor) {
  if (!monitor) throw Object.assign(new Error("The site monitor did not answer."), { status: 502 });
  const sites = monitor.sites || {};
  return {
    production: slimHealthSite("production", sites.production),
    preview: slimHealthSite("preview", sites.preview),
  };
}

const SECTION_ERRORS = {
  events: "Could not load events.",
  jobs: "Could not check website jobs.",
  pending: "Could not check website updates.",
  health: "Could not reach the site monitor.",
  forms: "Could not load applications.",
  artists: "Could not load the featured artist.",
};

function settle(name, result, log) {
  if (result.status === "fulfilled") return { ok: true, data: result.value };
  const error = result.reason;
  log?.warn?.("dashboard.section_failed", { section: name, error: error?.message || String(error) });
  // Messages from 4xx errors are written for people; anything else is not.
  const status = typeof error?.status === "number" ? error.status : 500;
  const message = status < 500 && error?.message ? error.message : SECTION_ERRORS[name];
  return { ok: false, error: message };
}

/**
 * Load every section in parallel. `deps` swaps any source in tests.
 * The event list is loaded once and shared by the nights and the jobs.
 */
export async function collectDashboard(env, deps = {}, { log = null, today = todayIso() } = {}) {
  const d = {
    listEvents,
    withWebsiteStatus,
    listWebsiteJobs,
    calendarConfigured,
    siteStatus,
    listFormSubmissions,
    listArtists,
    fetchMonitor: () =>
      fetchMonitorStatus(env.SITE_HEALTH_URL || SITE_HEALTH_URL, fetch, env.SITE_HEALTH_STATUS_TOKEN || ""),
    ...deps,
  };

  const baseEvents = d.listEvents(env);
  const artists = d.listArtists(env);
  // Unhandled until a section awaits them; allSettled reports their failures.
  baseEvents.catch(() => {});
  artists.catch(() => {});

  const events = (async () => {
    const [list, calendar] = await Promise.all([
      baseEvents.then((rows) => d.withWebsiteStatus(env, rows)),
      d.calendarConfigured(env).catch(() => false),
    ]);
    return {
      today,
      days: UPCOMING_DAYS,
      nights: upcomingNights(list, { today, calendar }),
      waitingForUpdate: eventsWaitingForUpdate(list),
    };
  })();

  const jobs = baseEvents
    .then((list) => d.listWebsiteJobs(env, { events: list }))
    .then((rows) => ({ jobs: rows }));

  // The pending check reads the artists too; share the one request.
  const shared = { artists: () => artists };
  const pending = Promise.all([
    d.siteStatus(env, "production", shared),
    d.siteStatus(env, "preview", shared),
  ]).then(([production, preview]) => ({
    local: runsOnMachine(env),
    urls: siteUrls(env),
    production: slimSite(production),
    preview: slimSite(preview),
  }));

  const health = Promise.resolve()
    .then(() => d.fetchMonitor())
    .then(healthSummary);
  const forms = d.listFormSubmissions(env).then(formsSummary);
  const featured = artists.then(artistsSummary);

  const names = ["events", "jobs", "pending", "health", "forms", "artists"];
  const results = await Promise.allSettled([events, jobs, pending, health, forms, featured]);
  const out = { ok: true, checkedAt: new Date().toISOString() };
  names.forEach((name, index) => {
    out[name] = settle(name, results[index], log);
  });
  return out;
}
