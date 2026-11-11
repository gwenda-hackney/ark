/**
 * migrations/2026-11-10-epic-jam-one-event.mjs, run as a deploy runs it
 * against a D1 with the real schema, with Sanity, Google Calendar and Drive
 * faked: for real, again (nothing left to do), halfway, and as a dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { resolveOccurrenceContent } from "../../ops/site/src/events/server/event-content.js";
import { createEvent, getEvent, listEvents, updateEvent } from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as epicJam from "../../migrations/2026-11-10-epic-jam-one-event.mjs";

const { KEEP, COPY, DAYS } = epicJam;
const SATURDAY = "DJs, a live band, dancers, MCs and an open mic, with graffiti writers painting live outside and stalls throughout the venue.";
const SUNDAY = "A film screening followed by a Q&A, dance performances, a Beats & Samples competition, and food.";

describe("2026-11-10-epic-jam-one-event", () => {
  let world;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => world.restore());

  /** Ops as the migration reaches it: the events in `db`, with Sanity, Google Calendar and Drive faked. */
  const opsEnv = (db) => ({ ...world.env, eventRepository: d1EventRepository(db), menuRepository: d1MenuRepository(db) });

  async function untilReady(env, id) {
    for (let step = 0; step < 60; step += 1) {
      const result = await runWebsiteJob(env, { eventId: id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) return;
    }
    throw new Error("the website job never finished");
  }

  /** An event as the Add wizard makes it, on the website. */
  async function add(db, fields, { live = true } = {}) {
    const env = opsEnv(db);
    const event = await createEvent(env, { repeatUnit: "once", repeatEvery: 1, ...fields });
    if (live) await untilReady(env, event.id);
    return getEvent(env, event.id);
  }

  /** The two EPIC Jam events as production has them, live, and a night that is neither. */
  async function seed(db, { copy = {} } = {}) {
    const keep = await add(db, { name: KEEP, description: SATURDAY, startsOn: DAYS[0], startTime: "12:00", endTime: "20:00" });
    const off = await add(db, { name: COPY, description: SUNDAY, startsOn: DAYS[1], startTime: "13:00", endTime: "18:00", ...copy });
    const jazz = await add(db, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-25", startTime: "19:00" });
    return { keep, off, jazz, env: opsEnv(db) };
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    await epicJam.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return lines;
  }

  const dump = async (db) => JSON.stringify(await d1EventRepository(db).exportAll());
  /** Everything outside D1 that a run could change: the website's documents, the calendar, Drive. */
  const outside = () =>
    JSON.stringify([
      world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc).sort((a, b) => a._id.localeCompare(b._id)),
      world.google.calendar().map((entry) => entry.id).sort(),
      [...world.google.driveFiles.values()].map((file) => [file.id, Boolean(file.trashed)]),
    ]);
  const docsOf = (slug, view = "raw") =>
    world.sanity.view(view).filter((doc) => doc.seriesId === slug || doc._id.replace(/^drafts\./, "") === `series-${slug}`);
  const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;
  const plain = (doc) => (doc.description || []).map((block) => block.children.map((span) => span.text).join("")).join("\n\n");

  it("makes one event with both days, each with its own times and words, on the website; the copy goes everywhere; then nothing to do", async () => {
    const db = createTestD1("ops");
    const { keep, off, jazz, env } = await seed(db);
    assert.equal(docsOf(off.slug, "published").length, 2, "the copy has its own page and night on the website to begin with");
    const calendarBefore = world.google.calendar().length;
    const jazzBefore = JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]);

    const lines = await run(db);

    // In ops: one event, two days.
    const left = await listEvents(env, { withDeleted: true });
    assert.deepEqual(left.map((event) => event.name).sort(), [KEEP, "Jazz Night"], "the copy is gone from ops, not waiting to be restored");
    const one = await getEvent(env, keep.id);
    assert.equal(one.repeatUnit, "none");
    assert.deepEqual(one.dates.map((night) => night.date), DAYS);
    assert.equal(one.slug, keep.slug, "its web address stays");
    assert.equal(one.description, `Saturday: ${SATURDAY}\n\nSunday: ${SUNDAY}`);
    const [sat, sun] = one.dates.map((night) => resolveOccurrenceContent(one, night));
    assert.deepEqual([sat.startTime, sat.endTime, sat.description], ["12:00", "20:00", SATURDAY]);
    assert.deepEqual([sun.startTime, sun.endTime, sun.description], ["13:00", "18:00", SUNDAY]);
    assert.equal(sun.title, KEEP, "the second day is not called '… 2'");
    assert.equal(one.dates[0].id, keep.dates[0].id, "the first day is the same night as before");
    assert.equal(one.publish.live, "current");

    // On the website: one page, two days; nothing of the copy.
    for (const view of ["published", "previewDrafts"]) {
      const docs = docsOf(keep.slug, view);
      const series = docs.filter((doc) => doc._type === "eventSeries");
      assert.equal(series.length, 1, view);
      assert.equal(series[0].schedule, "manual", view);
      const nights = docs.filter((doc) => doc._type === "event").sort((a, b) => a.date.localeCompare(b.date));
      assert.deepEqual(
        nights.map((doc) => [doc.date, doc.ticketStart, doc.ticketEnd, plain(doc), doc.title, doc.removed === true]),
        [
          [DAYS[0], "12:00", "20:00", SATURDAY, KEEP, false],
          [DAYS[1], "13:00", "18:00", SUNDAY, KEEP, false],
        ],
        view,
      );
    }
    assert.deepEqual(docsOf(off.slug), [], "no page, night or draft of the copy left on the website");
    assert.equal(world.google.calendar().length, calendarBefore, "the calendar still has two entries for it: the copy's went, the second day's came");
    assert.ok(one.dates.every((night) => night.googleCalendarEventId), "both days are in the calendar");
    assert.equal(world.google.driveFiles.get(off.driveFolderId).trashed, true, "the copy's Drive folder is in the bin");
    assert.equal(world.google.driveFiles.get(keep.driveFolderId).trashed, undefined);
    assert.equal(JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]), jazzBefore, "Jazz Night is untouched");

    const text = lines.join("\n");
    assert.match(text, new RegExp(`\\(event ${keep.id}\\) gets a second day, Sunday 2026-11-22, 13:00 to 18:00, from "${COPY}" \\(event ${off.id}\\)`));
    assert.match(text, new RegExp(`"${COPY}" \\(event ${off.id}\\) removed: 1 night in ops, 2 website documents, 1 calendar entry, its Drive folder`));

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await run(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
  });

  it("keeps what else the copy's day had of its own", async () => {
    const db = createTestD1("ops");
    const { keep, env } = await seed(db, { copy: { offer: "Free entry", artist: "DJ Sunday" } });
    await run(db);
    const one = await getEvent(env, keep.id);
    const [sat, sun] = one.dates.map((night) => resolveOccurrenceContent(one, night));
    assert.deepEqual([sun.offer, sun.artist], ["Free entry", "DJ Sunday"]);
    assert.deepEqual([sat.offer, sat.artist], ["", ""]);
  });

  it("finishes a run that stopped after the merge: the copy still goes, and nothing is merged twice", async () => {
    const db = createTestD1("ops");
    const { keep, off, env } = await seed(db);
    const { merged } = await epicJam.mergeDays(env);
    assert.equal(merged, true);
    assert.ok((await listEvents(env)).some((event) => event.name === COPY), "the copy is still there");

    await run(db);

    const one = await getEvent(env, keep.id);
    assert.equal(one.description, `Saturday: ${SATURDAY}\n\nSunday: ${SUNDAY}`);
    assert.deepEqual(one.dates.map((night) => night.date), DAYS);
    assert.deepEqual((await listEvents(env, { withDeleted: true })).filter((event) => event.name === COPY), []);
    assert.deepEqual(docsOf(off.slug), []);
    assert.equal(docsOf(keep.slug, "published").filter((doc) => doc._type === "event").length, 2);
  });

  it("leaves both alone when the owner has changed either so it no longer fits, and says so", async () => {
    const db = createTestD1("ops");
    const { off, env } = await seed(db);
    await updateEvent(env, off.id, { startsOn: "2026-11-29" });
    await untilReady(env, off.id);
    const before = [await dump(db), outside()];
    const lines = await run(db);
    assert.deepEqual([await dump(db), outside()], before);
    assert.match(lines.join("\n"), /left alone: .* is no longer a one-off event on 2026-11-22; nothing was merged or removed/);
  });

  it("says when there is no EPIC Jam, and leaves a lone copy alone", async () => {
    const db = createTestD1("ops");
    await add(db, { name: COPY, description: SUNDAY, startsOn: DAYS[1], startTime: "13:00" });
    const before = [await dump(db), outside()];
    const lines = await run(db);
    assert.deepEqual([await dump(db), outside()], before);
    assert.deepEqual(lines, [`not found: no event named "${KEEP}"; nothing to do`]);
  });

  it("a dry run changes nothing in ops, on the website, the calendar or Drive, and says what it would do", async () => {
    const db = createTestD1("ops");
    const { keep, off } = await seed(db);
    const before = [await dump(db), outside()];
    const calls = writes();
    const lines = await run(db, { dryRun: true });
    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls, "nothing sent that writes");
    const text = lines.join("\n");
    assert.match(text, new RegExp(`\\(event ${keep.id}\\) would get a second day, Sunday 2026-11-22, 13:00 to 18:00`));
    assert.match(text, /would put .* on the website with both days, before the copy goes/);
    assert.match(text, new RegExp(`would remove "${COPY}" \\(event ${off.id}\\): 1 night in ops, 2 website documents, 1 calendar entry, its Drive folder`));
    assert.match(text, /1 event to remove/);
  });
});
