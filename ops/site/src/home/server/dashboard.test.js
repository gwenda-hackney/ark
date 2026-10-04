import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  artistsSummary,
  collectDashboard,
  eventsWaitingForUpdate,
  formsSummary,
  healthSummary,
  upcomingNights,
} from "./dashboard.js";
import { callApi, createFakeWorld } from "../../testing/fake-world.js";
import { onRequestGet as getDashboard } from "../../../functions/api/dashboard.js";
import { onRequestPost as createEvent } from "../../../functions/api/events/index.js";

const TODAY = "2026-10-05"; // a Monday

/** A weekly series as listEvents returns it, nights already saved. */
function series(overrides = {}) {
  return {
    id: "7",
    name: "Negroni Chess Society",
    artist: "",
    startTime: "19:00",
    endTime: "23:00",
    startsOn: "2026-09-01",
    endsOn: "2026-12-31",
    repeatUnit: "week",
    repeatEvery: 1,
    weekdays: ["tue", "fri"],
    skippedDates: [],
    extraDates: [],
    dates: [],
    publish: { preview: "current", live: "current", nextDate: "", previewDates: [] },
    ...overrides,
  };
}

function datesRow(date, overrides = {}) {
  return { id: `d-${date}`, date, overrides: { name: "", artist: "", ...overrides }, snapshots: {} };
}

describe("upcomingNights", () => {
  it("lists tonight and the next 7 days, earliest first, with each night's own title", () => {
    const chess = series({
      dates: [datesRow("2026-10-06", { artist: "DJ Rook" }), datesRow("2026-10-09")],
      publish: {
        preview: "current",
        live: "stale",
        nextDate: "2026-10-06",
        // Not saved as a row yet: still on the schedule.
        previewDates: ["2026-10-06", "2026-10-09", "2026-10-13", "2026-10-16"],
      },
    });
    const tonight = series({
      id: "8",
      name: "Radio Gwenda",
      startTime: "18:00",
      repeatUnit: "once",
      startsOn: TODAY,
      endsOn: "",
      weekdays: [],
      dates: [datesRow(TODAY)],
      publish: { preview: "current", live: "current", nextDate: TODAY, previewDates: [TODAY] },
    });
    const deleted = series({ id: "9", deletedAt: "2026-10-01T00:00:00Z", publish: { ...chess.publish } });

    const nights = upcomingNights([chess, tonight, deleted], { today: TODAY });
    assert.deepEqual(
      nights.map((n) => [n.date, n.title, n.artist, n.live]),
      [
        [TODAY, "Radio Gwenda", "", "current"],
        ["2026-10-06", "Negroni Chess Society", "DJ Rook", "stale"],
        ["2026-10-09", "Negroni Chess Society", "", "stale"],
      ],
    );
    // The 13th is past the 7-day window (5th + 7 = 12th).
    assert.ok(!nights.some((n) => n.date === "2026-10-13"));
  });

  it("drops a saved night the schedule no longer has", () => {
    const moved = series({
      weekdays: ["tue"],
      dates: [datesRow("2026-10-06"), datesRow("2026-10-08")],
      publish: { preview: "current", live: "current", nextDate: "2026-10-06", previewDates: ["2026-10-06"] },
    });
    assert.deepEqual(upcomingNights([moved], { today: TODAY }).map((n) => n.date), ["2026-10-06"]);
  });
});

describe("eventsWaitingForUpdate", () => {
  it("lists events whose preview is ready and only Update website is left", () => {
    const rows = eventsWaitingForUpdate([
      series({ id: "1", name: "Changed", publish: { preview: "current", live: "stale" } }),
      series({ id: "2", name: "New", publish: { preview: "current", live: "unpublished" } }),
      series({ id: "3", name: "Still a job", publish: { preview: "stale", live: "stale" } }),
      series({ id: "4", name: "Done", publish: { preview: "current", live: "current" } }),
      series({ id: "5", name: "Deleted", deletedAt: "x", publish: { preview: "current", live: "stale" } }),
    ]);
    assert.deepEqual(rows, [
      { id: "1", name: "Changed", change: "changed" },
      { id: "2", name: "New", change: "added" },
    ]);
  });
});

describe("formsSummary", () => {
  const row = (overrides) => ({
    id: "1",
    formSlug: "play",
    formTitle: "Play at Gwenda",
    email: "a@example.com",
    name: "Ada",
    status: "Verified",
    submittedAt: "2026-10-01T10:00:00Z",
    current: true,
    decision: "",
    notifySentAt: "2026-10-01T10:00:01Z",
    receiptSentAt: "2026-10-01T10:00:02Z",
    answers: [{ key: "bio", label: "Bio", value: "long text" }],
    ...overrides,
  });

  it("keeps undecided play applications, oldest first, and ignores the old status", () => {
    const { toReview, emailFailed } = formsSummary([
      row({ id: "new", submittedAt: "2026-10-03T10:00:00Z", status: "" }),
      row({ id: "old", submittedAt: "2026-09-20T10:00:00Z" }),
      row({ id: "yes", decision: "Approved" }),
      row({ id: "no", decision: "Declined" }),
      row({ id: "contact", formSlug: "contact", receiptSentAt: "" }),
    ]);
    assert.deepEqual(toReview.map((r) => r.id), ["old", "new"]);
    assert.equal("answers" in toReview[0], false);
    assert.deepEqual(emailFailed.map((r) => r.id), ["contact"]);
  });
});

describe("healthSummary and artistsSummary", () => {
  it("maps each site's checks", () => {
    const summary = healthSummary({
      ok: true,
      sites: {
        production: {
          url: "https://gwenda.co.uk",
          ok: false,
          down: true,
          consecutiveFails: 3,
          lastCheckedAt: 1,
          lastError: "home: HTTP 500",
          lastProbe: { ok: false, checks: [{ name: "home", ok: false, status: 500 }, { name: "health", ok: true, status: 200 }] },
        },
      },
    });
    assert.equal(summary.production.down, true);
    assert.deepEqual(summary.production.checks, [
      { name: "home", ok: false, status: 500, error: "" },
      { name: "health", ok: true, status: 200, error: "" },
    ]);
    assert.equal(summary.preview, null);
    assert.throws(() => healthSummary(null), /did not answer/);
  });

  it("picks the current and next artist", () => {
    const out = artistsSummary([
      { id: "1", slot: "current", name: "Rita", artistName: "Rita Matos", startMonth: "9", endMonth: "10" },
      { id: "2", slot: "previous", name: "Old" },
    ]);
    assert.deepEqual(out, { current: { id: "1", name: "Rita Matos", startMonth: "9", endMonth: "10" }, next: null });
  });
});

describe("collectDashboard", () => {
  const site = { known: true, builtAt: null, items: [], updating: false, runUrl: "", failed: false, needsHelp: false, lastError: "", autoUpdateAt: null };

  function fakes(overrides = {}) {
    const calls = { listEvents: 0, listArtists: 0, eventsForJobs: null };
    const deps = {
      listEvents: async () => {
        calls.listEvents += 1;
        return [series({ publish: { preview: "current", live: "stale", nextDate: TODAY, previewDates: ["2026-10-06"] } })];
      },
      withWebsiteStatus: async (_env, events) => events,
      calendarConfigured: async () => false,
      listWebsiteJobs: async (_env, { events }) => {
        calls.eventsForJobs = events;
        return [{ eventId: "7", name: "Negroni Chess Society", state: "failed", error: "boom", failedAt: null }];
      },
      siteStatus: async (_env, name, deps) => ({ ...site, site: name, items: [{ label: "Menu", change: "changed" }], artistsShared: await deps.artists() }),
      listFormSubmissions: async () => [],
      listArtists: async () => {
        calls.listArtists += 1;
        return [];
      },
      fetchMonitor: async () => ({ ok: true, sites: {} }),
      ...overrides,
    };
    return { deps, calls };
  }

  it("answers every section and loads events and artists once", async () => {
    const { deps, calls } = fakes();
    const out = await collectDashboard({ SITE_ENV: "dev" }, deps, { today: TODAY });
    for (const name of ["events", "jobs", "pending", "health", "forms", "artists"]) {
      assert.equal(out[name].ok, true, `${name}: ${out[name].error}`);
    }
    assert.equal(calls.listEvents, 1);
    assert.equal(calls.listArtists, 1);
    assert.equal(calls.eventsForJobs.length, 1);
    assert.deepEqual(out.events.data.nights.map((n) => n.date), ["2026-10-06"]);
    assert.equal(out.events.data.waitingForUpdate.length, 1);
    assert.equal(out.jobs.data.jobs[0].state, "failed");
    assert.equal(out.pending.data.production.count, 1);
    assert.equal("artistsShared" in out.pending.data.production, false);
  });

  it("reports a failing source on its own section and keeps the rest", async () => {
    const warnings = [];
    const log = { warn: (message, extra) => warnings.push([message, extra.section]) };
    const { deps } = fakes({
      listFormSubmissions: async () => {
        throw new Error("Baserow exploded with secrets in the message");
      },
      fetchMonitor: async () => null,
      listEvents: async () => {
        throw Object.assign(new Error("Events table not found."), { status: 503 });
      },
    });
    const out = await collectDashboard({ SITE_ENV: "dev" }, deps, { log, today: TODAY });
    assert.deepEqual(out.forms, { ok: false, error: "Could not load applications." });
    assert.equal(out.health.ok, false);
    assert.equal(out.events.ok, false);
    assert.equal(out.jobs.ok, false);
    assert.equal(out.pending.ok, true);
    assert.equal(out.artists.ok, true);
    assert.deepEqual(warnings.map(([, section]) => section).sort(), ["events", "forms", "health", "jobs"]);
  });

  it("passes on a 4xx message, which is written for people", async () => {
    const { deps } = fakes({
      listFormSubmissions: async () => {
        throw Object.assign(new Error("The forms table is missing."), { status: 404 });
      },
    });
    const out = await collectDashboard({ SITE_ENV: "dev" }, deps, { today: TODAY });
    assert.equal(out.forms.error, "The forms table is missing.");
  });
});

describe("GET /api/dashboard", () => {
  let world;

  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
  });

  afterEach(() => world.restore());

  it("shows a new event in the next 7 days even when other sources are down", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await callApi(world, createEvent, {
      method: "POST",
      path: "/api/events",
      body: { name: "Gwenda + Live", startsOn: tomorrow, repeatUnit: "once", startTime: "20:00", endTime: "23:00" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));

    const before = world.calls.length;
    const res = await callApi(world, getDashboard, { path: "/api/dashboard" });
    const dashboardCalls = world.calls.slice(before);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.events.ok, true, res.data.events.error);
    const nights = res.data.events.data.nights;
    assert.deepEqual(nights.map((n) => [n.date, n.title, n.startTime]), [[tomorrow, "Gwenda + Live", "20:00"]]);
    // Saved, not ready yet: a website job, not "waiting for Update website".
    assert.equal(res.data.jobs.ok, true, res.data.jobs.error);
    assert.deepEqual(res.data.jobs.data.jobs.map((job) => job.name), ["Gwenda + Live"]);
    // Nothing fakes the forms database or the site monitor: those cards fail alone.
    assert.equal(res.data.forms.ok, false);
    assert.equal(res.data.health.ok, false);
    // The dashboard only reads.
    const writes = dashboardCalls.filter(
      (call) => /^(PATCH|PUT|DELETE) /.test(call) || (call.startsWith("POST ") && !/\/query|token/.test(call)),
    );
    assert.deepEqual(writes, []);
  });
});
