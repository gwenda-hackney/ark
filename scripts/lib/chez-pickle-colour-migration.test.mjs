/**
 * migrations/2026-11-17-chez-pickle-colour.mjs, run as a deploy runs it
 * against a D1 with the real schema, with Sanity, Google Calendar and Drive
 * faked: a dry run, for real, again (nothing left to do), with a colour the
 * owner has set since, and with no Chez Pickle. What the website gets is
 * Chez Pickle's series document as published, put through the website's
 * own colour rules (src/lib/kitchen-colour.js).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { BOARDS, READABLE, contrast, readableOn } from "../../marketing/web/src/lib/kitchen-colour.js";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { d1VenueRepository } from "../../ops/site/src/venue/server/adapters/d1-venue.js";
import { createEvent, getEvent, setEventAccentColor } from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as chezPickleColour from "../../migrations/2026-11-17-chez-pickle-colour.mjs";

const TODAY = "2026-11-17";

describe("2026-11-17-chez-pickle-colour", () => {
  let world;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${TODAY}T12:00:00Z`) });
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => {
    world.restore();
    vi.useRealTimers();
  });

  const opsEnv = (db) => ({
    ...world.env,
    eventRepository: d1EventRepository(db),
    menuRepository: d1MenuRepository(db),
    venueRepository: d1VenueRepository(db),
  });

  async function untilReady(env, id) {
    for (let step = 0; step < 60; step += 1) {
      const result = await runWebsiteJob(env, { eventId: id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) return;
    }
    throw new Error("the website job never finished");
  }

  /** Chez Pickle as dev and production have it: a pop-up kitchen, Wed to Sun, on the website. */
  async function seed(db, name = "Chez Pickle") {
    const env = opsEnv(db);
    const event = await createEvent(env, {
      name,
      category: "popup",
      description: "Smash burgers from Chez Pickle, in the kitchen at Gwenda.",
      startsOn: TODAY,
      endsOn: "2026-12-20",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["wed", "thu", "fri", "sat", "sun"],
    });
    await untilReady(env, event.id);
    return getEvent(env, event.id);
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    const result = await chezPickleColour.up({
      env: "dev",
      d1: () => db,
      processEnv: world.env,
      dryRun,
      log: (line) => lines.push(line),
    });
    return { result, text: lines.join("\n") };
  }

  /** Chez Pickle's series as the live website reads it. */
  const series = () => world.sanity.view("published").find((doc) => doc._id === "series-chez-pickle");
  const stored = async (db) => JSON.stringify(await d1EventRepository(db).exportAll());

  it("is their logo's green, and reads on our boards once lightened", () => {
    assert.equal(chezPickleColour.COLOUR, "#024a34");
    const ink = readableOn(chezPickleColour.COLOUR);
    for (const board of BOARDS) assert.ok(contrast(ink, board) >= READABLE, `${ink} on ${board}`);
  });

  it("a dry run changes nothing, and says what it would do", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await stored(db);
    const { text, result } = await run(db, { dryRun: true });
    assert.deepEqual(result, { colour: "added", published: false });
    assert.equal(await stored(db), before);
    assert.match(text, /would set #024a34 as the colour of "Chez Pickle"/);
  });

  it("for real: Chez Pickle has its colour in ops and on the website; again, nothing to do", async () => {
    const db = createTestD1("ops");
    const { id } = await seed(db);
    assert.equal("accentColor" in series(), false, "no colour before");
    const { text, result } = await run(db);
    assert.deepEqual(result, { colour: "added", published: true });
    assert.equal((await getEvent(opsEnv(db), id)).accentColor, "#024a34");
    assert.equal(series().accentColor, "#024a34");
    assert.match(text, /set #024a34 as the colour of "Chez Pickle"/);

    const before = await stored(db);
    const again = await run(db);
    assert.deepEqual(again.result, { colour: "there", published: false });
    assert.equal(await stored(db), before);
    assert.match(again.text, /Nothing to do/);
  });

  it("never replaces a colour the owner has set since", async () => {
    const db = createTestD1("ops");
    const { id } = await seed(db);
    await setEventAccentColor(opsEnv(db), id, "#336699");
    const { text, result } = await run(db);
    assert.deepEqual(result, { colour: "owner's", published: false });
    assert.equal((await getEvent(opsEnv(db), id)).accentColor, "#336699");
    assert.match(text, /has a colour of its own, #336699/);
  });

  it("stops with a clear message when there is no Chez Pickle", async () => {
    const db = createTestD1("ops");
    await seed(db, "Crust Fund");
    await assert.rejects(() => run(db), /Chez Pickle was not found/);
  });
});
