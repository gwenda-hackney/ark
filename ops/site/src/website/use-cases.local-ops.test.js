/**
 * Use cases (#300): while a developer runs `npm run ops:dev`, hosted dev ops
 * sends nothing to the website by itself, so its older code can't undo what
 * local ops just did. Through the real handlers with Baserow, Sanity and
 * Google faked (testing/fake-world.js): hosted dev is the world's env
 * (SITE_ENV=dev), local ops checks in through the same config database, as
 * scripts/ops-dev.mjs does.
 *
 * What the tick drives, and so what pauses: the queue that gets saved events
 * ready (calendar, preview, website: `?step=jobs`) and the site builds
 * (`?step=site`, site-pending.test.js). Venue details and the menu only go on
 * the website when someone saves or presses a button, which still works.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { onRequestPost as createEvent } from "../../functions/api/events/index.js";
import { onRequestPost as publishEvent } from "../../functions/api/events/[id]/publish.js";
import { onRequestPost as runWebsiteJob } from "../../functions/api/web/jobs.js";
import { onRequestPost as tick } from "../../functions/api/web/tick.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { LOCAL_OPS_FRESH_MS, checkIn, clearCheckIn } from "./server/local-ops.js";

const DEVELOPER = "dev@example.com";

function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The first date after today that is a Wednesday. */
function nextWednesday() {
  for (let days = 1; days <= 7; days += 1) {
    const iso = daysFromNow(days);
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === 3) return iso;
  }
  throw new Error("unreachable");
}

const SERIES = {
  name: "Negroni Chess Society",
  shortDescription: "Chess by the canal.",
  description: "Boards out, negronis poured.",
  startTime: "19:00",
  endTime: "23:00",
  startsOn: nextWednesday(),
  endsOn: daysFromNow(30),
  repeatUnit: "week",
  repeatEvery: 1,
  weekdays: ["wed"],
};

let world;

beforeEach(async () => {
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.install();
});

afterEach(() => world.restore());

/** Ops on a developer's machine: the same config database, SITE_ENV=local. */
const machine = () => ({ ...world.env, SITE_ENV: "local" });

/** `npm run ops:dev` checks in; `ago`: how long since its last check-in. */
async function localOpsChecksIn({ ago = 0, session = "laptop" } = {}) {
  const now = Date.now() - ago;
  await checkIn(machine(), { session, since: now - 60_000, by: DEVELOPER, now });
}

async function saveEvent() {
  const res = await callApi(world, createEvent, { method: "POST", path: "/api/events", body: SERIES });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.event;
}

/** The deploy webhook's cron calling one step of the tick. */
async function cronTick(step) {
  const res = await callApi(world, tick, {
    method: "POST",
    path: `/api/web/tick?step=${step}`,
    headers: { Authorization: `Bearer ${world.env.DEPLOY_WEBHOOK_SECRET}` },
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
}

/** One step of the website job, as an open ops tab runs it: for `eventId`, or whatever is waiting. */
async function tabStep(eventId = "") {
  const res = await callApi(world, runWebsiteJob, { method: "POST", path: "/api/web/jobs", body: { eventId } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
}

/** Calls that left ops for anything but its own config and data (Sanity, Google, …). */
const callsOutSince = (from) => world.calls.slice(from).filter((call) => !call.includes("api.baserow.io"));

describe("dev's automatic website updates wait while local ops runs", () => {
  it("a saved event waiting for the website: the cron's tick leaves it alone and says why", async () => {
    await saveEvent();
    await localOpsChecksIn();
    const from = world.calls.length;

    const result = await cronTick("jobs");

    assert.equal(result.job.idle, true);
    assert.equal(result.job.paused.reason, "local-ops");
    assert.equal(result.job.paused.by, DEVELOPER);
    assert.deepEqual(callsOutSince(from), [], "nothing went to Sanity or Google");
    assert.deepEqual(world.sanity.drafts(), []);
    assert.deepEqual(world.google.calendar(), []);
  });

  it("an open dev ops tab's background runner waits too, but an event saved in that tab still goes on", async () => {
    const event = await saveEvent();
    await localOpsChecksIn();

    const waiting = await tabStep();
    assert.equal(waiting.idle, true);
    assert.equal(waiting.paused.by, DEVELOPER);

    const saved = await tabStep(event.id);
    assert.equal(saved.eventId, String(event.id));
    assert.equal(saved.failed, "");
    assert.ok(world.google.calendar().length > 0, "its own save got its first step");
  });

  it("Update website still works while paused", async () => {
    world.baserow.insert("Config", { Name: "website.auto_update", Value: "off", Env: "dev", Service: "ops" });
    const event = await saveEvent();
    for (let step = 0; step < 20 && !(await tabStep(event.id)).done; step += 1);
    await localOpsChecksIn();

    const res = await callApi(world, publishEvent, {
      method: "POST",
      path: `/api/events/${event.id}/publish`,
      params: { id: String(event.id) },
      body: { target: "production", confirm: "production" },
    });

    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(world.sanity.published("eventSeries")[0]?.title, "Negroni Chess Society");
  });

  it("a check-in over 3 minutes old (local ops stopped or crashed) holds nothing back", async () => {
    const event = await saveEvent();
    await localOpsChecksIn({ ago: LOCAL_OPS_FRESH_MS + 5_000 });

    const result = await cronTick("jobs");

    assert.equal(result.job.paused, undefined);
    assert.equal(result.job.eventId, String(event.id));
    assert.ok(world.google.calendar().length > 0);
  });

  it("stopping local ops ends the pause straight away", async () => {
    const event = await saveEvent();
    await localOpsChecksIn();
    await clearCheckIn(machine(), "laptop");

    const result = await cronTick("jobs");

    assert.equal(result.job.eventId, String(event.id));
  });

  it("with nothing checked in, nothing changes: nothing waiting is just idle", async () => {
    assert.deepEqual(await cronTick("jobs"), { ok: true, job: { idle: true } });
  });
});
