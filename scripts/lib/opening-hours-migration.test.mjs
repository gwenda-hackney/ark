/**
 * migrations/2026-11-11-opening-hours.mjs, run as a deploy runs it against
 * a D1 with the real schema, with Sanity and the settings faked: for real,
 * again (nothing to do), after the venue changed the hours, halfway, and as
 * a dry run. What the website says is the website's own module.
 */
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { afterEach, beforeEach, describe, it } from "vitest";
import { weekRows } from "../../marketing/web/src/lib/opening-hours.js";
import { VENUE_DETAILS_QUERY, readVenueDetails } from "../../marketing/web/src/lib/venue-details.js";
import { d1VenueRepository } from "../../ops/site/src/venue/server/adapters/d1-venue.js";
import { saveOpeningHours } from "../../ops/site/src/venue/server/venue-details.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as hours from "../../migrations/2026-11-11-opening-hours.mjs";

describe("2026-11-11-opening-hours", () => {
  let world;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => world.restore());

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    const result = await hours.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return { lines, result };
  }

  async function websiteRows() {
    const docs = world.sanity.view("published");
    const week = readVenueDetails(await (await evaluate(parse(VENUE_DETAILS_QUERY), { dataset: docs })).get()).openingHours;
    return weekRows(week).map((row) => `${row.days} ${row.hours}`);
  }

  const GWENDA_ROWS = ["Mon Closed", "Tue–Thu 5–10:30pm", "Fri 4–11:30pm", "Sat 4pm–1am", "Sun 4–10pm"];

  it("saves the venue's hours in ops and puts them on the website", async () => {
    const db = createTestD1("ops");
    const { lines, result } = await run(db);
    assert.deepEqual(result, { saved: true, published: true });
    const saved = await d1VenueRepository(db).getOpeningHours();
    assert.deepEqual(saved.days[5], { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
    assert.equal(saved.updatedBy, hours.SAVED_BY);
    assert.deepEqual(await websiteRows(), GWENDA_ROWS);
    assert.match(lines.join("\n"), /saved the opening hours in ops: Monday Closed; Tuesday 5pm – 10:30pm;.*Saturday 4pm – 1am \(Sunday morning\)/);
  });

  it("does nothing the second time", async () => {
    const db = createTestD1("ops");
    await run(db);
    const before = JSON.stringify(await d1VenueRepository(db).exportAll());
    const { lines, result } = await run(db);
    assert.deepEqual(result, { saved: false, published: false });
    assert.equal(JSON.stringify(await d1VenueRepository(db).exportAll()), before);
    assert.match(lines.join("\n"), /left alone[\s\S]*the website shows them; nothing to do/);
  });

  it("leaves hours the venue has changed since as they are", async () => {
    const db = createTestD1("ops");
    await run(db);
    const env = { ...world.env, venueRepository: d1VenueRepository(db) };
    await saveOpeningHours(
      env,
      hours.WEEK.map((day) => (day.day === "mon" ? { day: "mon", opens: "12:00", closes: "18:00" } : day)),
      { by: "owner@gwenda.co.uk" },
    );
    const { result } = await run(db);
    assert.deepEqual(result, { saved: false, published: false });
    assert.equal((await d1VenueRepository(db).getOpeningHours()).updatedBy, "owner@gwenda.co.uk");
    assert.equal((await websiteRows())[0], "Mon midday–6pm");
  });

  it("finishes a run that saved in ops but never reached the website", async () => {
    const db = createTestD1("ops");
    world.env.SANITY_API_TOKEN = "";
    await assert.rejects(() => run(db), /saved in ops but not on the website/);
    world.env.SANITY_API_TOKEN = "sanity-token";
    // The fake Sanity takes any token; a real one would be the env's.
    const { result } = await run(db);
    assert.deepEqual(result, { saved: false, published: true });
    assert.deepEqual(await websiteRows(), GWENDA_ROWS);
  });

  it("putting the hours there keeps the party facts saved beside them", async () => {
    const db = createTestD1("ops");
    world.env.SANITY_API_TOKEN = "";
    await assert.rejects(() => run(db), /saved in ops but not on the website/);
    await d1VenueRepository(db).saveParties({ standing: 80, seated: null, included: "", replyWithin: "a day" });
    world.env.SANITY_API_TOKEN = "sanity-token";
    const { result } = await run(db);
    assert.deepEqual(result, { saved: false, published: true });
    const docs = world.sanity.view("published");
    const details = readVenueDetails(await (await evaluate(parse(VENUE_DETAILS_QUERY), { dataset: docs })).get());
    assert.deepEqual(details.parties, { standing: 80, seated: null, included: [], replyWithin: "a day" });
    assert.deepEqual(await websiteRows(), GWENDA_ROWS);
  });

  it("a dry run changes nothing anywhere", async () => {
    const db = createTestD1("ops");
    const { lines, result } = await run(db, { dryRun: true });
    assert.deepEqual(result, { saved: true, published: false });
    assert.equal(await d1VenueRepository(db).getOpeningHours(), null);
    assert.deepEqual(world.sanity.view("raw").filter((doc) => doc._type === "venueDetails"), []);
    const text = lines.join("\n");
    assert.match(text, /Dry run: working on a copy/);
    assert.match(text, /would save the opening hours in ops: Monday Closed;/);
    assert.match(text, /would put them on the website \(now the website has none\)/);
  });
});
