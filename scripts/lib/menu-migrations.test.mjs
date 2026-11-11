/**
 * The 2026-11-10 migrations (plain menu sections, series categories, one
 * happy hour, Chez Pickle's menu, offers in pounds, promotions on the website), run as a deploy runs them against a D1 with the real
 * schema: for real, again (nothing left to do), and as a dry run (nothing
 * written).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { flattenMenuSections } from "../../ops/site/src/menu/menu-sections.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { deleteEventFromOps } from "../../ops/site/src/events/server/event-publish.js";
import { createEvent, ensureOccurrence, getEvent, listEvents } from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { loadMenuTree } from "../../ops/site/src/menu/server/menu-store.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as chezPickle from "../../migrations/2026-11-10-chez-pickle-menu.mjs";
import * as plain from "../../migrations/2026-11-10-menu-plain-sections.mjs";
import * as offerPounds from "../../migrations/2026-11-10-offer-pounds.mjs";
import * as oneHappyHour from "../../migrations/2026-11-10-one-happy-hour.mjs";
import * as categories from "../../migrations/2026-11-10-a-series-categories.mjs";
import * as onWebsite from "../../migrations/2026-11-10-z-promotions-on-website.mjs";
import { sanityMutate } from "../../ops/site/src/platform/sanity.js";
import { resetConfigCacheForTests } from "../../shared/config.js";
import { missingSchema } from "./d1-rehearsal.mjs";

const FANCY = Object.fromEntries(plain.CHAPTERS.filter((chapter) => chapter.was).map((chapter) => [chapter.slug, chapter.was]));

/** The menu as production had it on 2026-11-10 (ids and order included), with a drink in each beer group. */
async function seed(db, { events = true } = {}) {
  const section = (id, name, slug, order, parentId = null) => ({
    id,
    name,
    slug,
    order,
    parentId,
    subtitle: FANCY[slug]?.subtitle || "",
    sanityId: `sanity-${slug}`,
    kind: parentId ? "" : "bar",
  });
  await d1MenuRepository(db).importAll({
    menu_sections: [
      section(65, "Our Formulas", "our-formulas", 1),
      section(66, "Free of Spirit", "free-of-spirit", 2),
      section(67, "By the Book", "by-the-book", 3),
      section(68, "Spritz", "spritz", 4, 67),
      section(69, "Negroni", "negroni", 5, 67),
      section(72, "Bottled Beer", "bottled-beer", 8, 67),
      section(75, "Draught Beer", "draught-beer", 9, 67),
      section(73, "The Cabinet", "the-cabinet", 10),
      section(76, "Agave", "agave", 11, 73),
      section(78, "Amaro & Digestivi", "amaro-digestivi", 14, 73),
      { ...section(79, "Soft Drinks", "soft-drinks", 12), sanityId: "" },
    ],
    pos_menus: [{ id: 7, name: "Fall 2026", order: 1, isDefault: true }],
    menu_items: [
      { id: 300, name: "Menabrea", sectionId: 72, price: "4", sanityId: "item-menabrea", posMenuIds: [7] },
      { id: 301, name: "Gwenda Pilsner", sectionId: 75, price: "6.5", posMenuIds: [7] },
    ],
    menu_placements: [
      { id: 1, itemId: 300, channel: "digital", sectionId: 72 },
      { id: 2, itemId: 300, channel: "pos", posMenuId: 7, posScreen: "Beers" },
      { id: 3, itemId: 301, channel: "digital", sectionId: 75 },
      { id: 4, itemId: 301, channel: "pos", posMenuId: 7, posScreen: "Beers" },
    ],
  });
  if (events) {
    const repo = d1EventRepository(db);
    await repo.create({ name: "Happy Hour", offer: "20% off any cocktail", startTime: "17:00", repeatUnit: "day" });
    await repo.create({ name: "From Wednesday to Saturday is the Cocktail Hour 🍹", offer: "20% OFF", startTime: "17:00" });
    await repo.create({ name: "Chez Pickle", description: "Smashed burgers." });
    await repo.create({ name: "Jazz Night" });
  }
}

/** Run a migration's up() against `db`, collecting what it logs. */
async function run(migration, db, { dryRun = false, processEnv = {} } = {}) {
  const lines = [];
  await migration.up({ env: "dev", d1: () => db, processEnv, dryRun, log: (line) => lines.push(line) });
  return lines;
}

async function tree(db) {
  const { sections, items } = await loadMenuTree({ menuRepository: d1MenuRepository(db) });
  return { sections, flat: flattenMenuSections(sections), items };
}

const dump = async (db) => JSON.stringify([await d1MenuRepository(db).exportAll(), await d1EventRepository(db).exportAll()]);

describe("2026-11-10-menu-plain-sections", () => {
  it("renames, adds Beer, moves the beer groups and puts the chapters in order; then has nothing left to do", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const lines = await run(plain, db);
    const { sections, flat } = await tree(db);

    assert.deepEqual(
      sections.map((chapter) => [chapter.slug, chapter.title, chapter.subtitle]),
      [
        ["our-formulas", "Our Cocktails", "Made up here. They change now and then."],
        ["by-the-book", "The Classics", "Spritz, Negroni, sours. The ones you know."],
        ["beer", "Beer", "On draught and in bottles."],
        ["the-cabinet", "Spirits", "Tequila, rum, whiskey, and something for after."],
        ["free-of-spirit", "No Booze", "Nothing in them. Still worth ordering."],
        ["soft-drinks", "Soft Drinks", undefined],
      ],
    );
    const beer = sections.find((chapter) => chapter.slug === "beer");
    assert.equal(beer.kind, "bar");
    assert.deepEqual(
      beer.subsections.map((group) => [group._id, group.slug, group.title, group.sanityId]),
      [
        ["75", "draught-beer", "On Draught", "sanity-draught-beer"],
        ["72", "bottled-beer", "In Bottles", "sanity-bottled-beer"],
      ],
      "On Draught first; ids, slugs and Sanity links kept",
    );
    assert.deepEqual(
      sections.find((chapter) => chapter.slug === "by-the-book").subsections.map((group) => group.slug),
      ["spritz", "negroni"],
    );
    assert.equal(flat.find((row) => row.slug === "amaro-digestivi").title, "After Dinner");
    assert.deepEqual(
      flat.map((row) => row.orderRank),
      flat.map((_row, index) => index + 1),
      "1, 2, 3… in the order guests read it",
    );
    // The drinks went with their groups, and nothing changed on the till.
    const menabrea = (await tree(db)).items.find((item) => item.name === "Menabrea");
    assert.equal(menabrea.sectionId, "72");
    assert.deepEqual(menabrea.placements.map((row) => row.channel).sort(), ["digital", "pos"]);
    assert.ok(lines.some((line) => /add menu_sections \d+ "Beer"/.test(line)), lines.join("\n"));

    const before = await dump(db);
    const again = await run(plain, db);
    assert.equal(await dump(db), before, "a second run writes nothing");
    assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
  });

  it("leaves a name or line the owner has since edited, and says so", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const repo = d1MenuRepository(db);
    await repo.update("menu_sections", 65, { name: "House Cocktails" });
    await repo.update("menu_sections", 73, { subtitle: "The good stuff." });
    const lines = await run(plain, db);
    const { flat } = await tree(db);
    const own = flat.find((row) => row.slug === "our-formulas");
    assert.equal(own.title, "House Cocktails");
    assert.equal(own.subtitle, "Made up here. They change now and then.", "its untouched line still changes");
    const spirits = flat.find((row) => row.slug === "the-cabinet");
    assert.equal(spirits.title, "Spirits");
    assert.equal(spirits.subtitle, "The good stuff.");
    assert.equal(lines.filter((line) => line.startsWith("left alone")).length, 2, lines.join("\n"));
  });

  it("stops, changing nothing, when a section it expects is missing", async () => {
    const db = createTestD1("ops");
    await seed(db);
    await d1MenuRepository(db).remove("menu_sections", 75);
    const before = await dump(db);
    await assert.rejects(() => run(plain, db), /not found by slug: draught-beer\. Nothing was changed/);
    assert.equal(await dump(db), before);
  });

  it("a dry run says what it would do and writes nothing, also before the D1 schema is applied", async () => {
    // A database from before 0007 and 0008: no kind, no pop-up link, no category.
    const db = createTestD1("ops");
    await seed(db);
    db.exec("ALTER TABLE menu_sections DROP COLUMN kind; ALTER TABLE menu_sections DROP COLUMN popup_series_id; ALTER TABLE events DROP COLUMN category;");
    assert.deepEqual(await missingSchema(db, "ops", ["menu_sections", "events", "menu_items"]), [
      { table: "menu_sections", columns: ["kind", "popup_series_id"] },
      { table: "events", columns: ["category"] },
    ]);
    const snapshot = () => JSON.stringify(db.prepare("SELECT * FROM menu_sections ORDER BY id").all());
    const before = JSON.stringify(await snapshot());
    const lines = await run(plain, db, { dryRun: true });
    assert.equal(JSON.stringify(await snapshot()), before, "nothing written");
    const text = lines.join("\n");
    assert.match(text, /Dry run: working on a copy/);
    assert.match(text, /missing events\.category, menu_sections\.kind, menu_sections\.popup_series_id; the copy has them/);
    assert.match(text, /node scripts\/with-ops-env\.mjs node scripts\/d1-migrate\.mjs --env dev --db ops/);
    assert.match(text, /would add menu_sections \d+ "Beer"/);
    assert.match(text, /would change menu_sections 65 "Our Formulas": name "Our Formulas" → "Our Cocktails"/);
    assert.match(text, /would change menu_sections 75 "Draught Beer": name "Draught Beer" → "On Draught", parentId 67 → \d+/);
    // And the real run refuses until the schema is there.
    await assert.rejects(() => run(plain, db), /is missing events\.category, menu_sections\.kind.*Apply the D1 schema first/s);
  });
});

describe("2026-11-10-a-series-categories", () => {
  it("marks Happy Hour and the Cocktail Hour promotions and Chez Pickle a pop-up kitchen, and nothing else", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const lines = await run(categories, db);
    const byName = Object.fromEntries((await d1EventRepository(db).listEvents()).map((event) => [event.name, event]));
    assert.equal(byName["Happy Hour"].category, "promotion");
    assert.equal(byName["From Wednesday to Saturday is the Cocktail Hour 🍹"].category, "promotion");
    assert.equal(byName["Chez Pickle"].category, "popup");
    assert.equal(byName["Jazz Night"].category, "event");
    // Happy Hour repeats daily with no first night, which the editor now refuses: only its category changed.
    assert.equal(byName["Happy Hour"].repeatUnit, "day");
    assert.equal(byName["Happy Hour"].offer, "20% off any cocktail");
    assert.equal((await d1EventRepository(db).listEvents()).length, 4, "nothing deleted or merged");
    assert.ok(lines.some((line) => line.includes('"Happy Hour" (series') && line.includes("a night → a promotion")), lines.join("\n"));

    const before = await dump(db);
    const again = await run(categories, db);
    assert.equal(await dump(db), before);
    assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
  });

  it("knows the Cocktail Hour by its new name too (a run after 2026-11-10-one-happy-hour renamed it)", async () => {
    const db = createTestD1("ops");
    await seed(db, { events: false });
    const repo = d1EventRepository(db);
    await repo.create({ name: "Cocktail Hour 🍹" });
    await repo.create({ name: "Chez Pickle" });
    const lines = await run(categories, db);
    assert.equal((await repo.listEvents()).find((event) => event.name === "Cocktail Hour 🍹").category, "promotion");
    assert.ok(!lines.some((line) => line.includes("Cocktail Hour") && line.startsWith("not found")), lines.join("\n"));
    const again = await run(categories, db);
    assert.ok(again.some((line) => line.includes('"Cocktail Hour 🍹" (series') && line.includes("is already a promotion")), again.join("\n"));
  });

  it("says which series isn't there, and does the rest", async () => {
    const db = createTestD1("ops");
    await seed(db, { events: false });
    await d1EventRepository(db).create({ name: "Happy Hour" });
    const lines = await run(categories, db);
    assert.ok(lines.includes('not found: no series named "Chez Pickle"; nothing to do for it'), lines.join("\n"));
    assert.equal((await d1EventRepository(db).listEvents())[0].category, "promotion");
  });

  it("a dry run writes nothing and prints what each series holds", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await dump(db);
    const lines = await run(categories, db, { dryRun: true });
    assert.equal(await dump(db), before);
    const text = lines.join("\n");
    assert.match(text, /would change events \d+ "Happy Hour": category "event" → "promotion"/);
    assert.match(text, /offer: "20% off any cocktail"/);
    assert.match(text, /times: 17:00 to \?/);
  });
});

describe("2026-11-10-one-happy-hour", () => {
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const today = iso(0);
  const weekday = (date) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${date}T12:00:00Z`).getUTCDay()];
  const WED_TO_SAT = ["wed", "thu", "fri", "sat"];
  const COCKTAIL_HOUR = "From Wednesday to Saturday is the Cocktail Hour 🍹";
  /** Its name once the migration has run. */
  const RENAMED = "Cocktail Hour 🍹";

  let world;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => world.restore());

  /** Ops as the migration reaches it: the events in `db`, with Sanity, Google Calendar and Drive faked. */
  const opsEnv = (db) => ({ ...world.env, eventRepository: d1EventRepository(db), menuRepository: d1MenuRepository(db) });

  /** A series as an editor makes it; `live` lets the website job finish (calendar, preview, website). */
  async function add(db, fields, { live = true } = {}) {
    const env = opsEnv(db);
    const event = await createEvent(env, {
      shortDescription: "20% off any cocktail.",
      description: "20% off any cocktail, 5 to 7.",
      startTime: "17:00",
      endTime: "19:00",
      startsOn: iso(-7),
      endsOn: iso(30),
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: WED_TO_SAT,
      ...fields,
    });
    if (live) await untilReady(env, event.id);
    return getEvent(env, event.id);
  }

  async function untilReady(env, id) {
    for (let step = 0; step < 60; step += 1) {
      const result = await runWebsiteJob(env, { eventId: id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) return;
    }
    throw new Error("the website job never finished");
  }

  /** Both happy hours as production has them, live, and a night that is neither. */
  async function seedHappyHours(db, { keeper = true, live = true } = {}) {
    const off = await add(db, { name: "Happy Hour" }, { live });
    const kept = keeper ? await add(db, { name: COCKTAIL_HOUR, weekdays: [...WED_TO_SAT, "sun"] }) : null;
    const jazz = await add(db, { name: "Jazz Night", weekdays: ["wed"] });
    return { off, kept, jazz, env: opsEnv(db) };
  }

  const migrate = (db, options = {}) => run(oneHappyHour, db, { processEnv: world.env, ...options });
  /** Everything outside D1 that a run could change: the website's documents, the calendar, Drive. */
  const outside = () =>
    JSON.stringify([
      world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc).sort((a, b) => a._id.localeCompare(b._id)),
      world.google.calendar().map((entry) => entry.id).sort(),
      [...world.google.driveFiles.values()].map((file) => [file.id, Boolean(file.trashed)]),
    ]);
  const docsOf = (slug, view = "raw") =>
    world.sanity.view(view).filter((doc) => doc.seriesId === slug || doc._id.replace(/^drafts\./, "") === `series-${slug}`);
  const inCalendar = (event) => event.dates.filter((night) => night.googleCalendarEventId).length;
  const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;

  it("removes Happy Hour from ops, the website, the calendar and Drive; nothing else goes; then has nothing left to do", async () => {
    const db = createTestD1("ops");
    const { off, kept, jazz, env } = await seedHappyHours(db);
    const onWebsite = docsOf(off.slug, "published").length;
    assert.ok(onWebsite > 3, "Happy Hour is on the website to begin with");
    const calendarBefore = world.google.calendar().length;
    const jazzBefore = JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]);

    const lines = await migrate(db);

    const left = await listEvents(env, { withDeleted: true });
    assert.deepEqual(left.map((event) => event.name).sort(), [RENAMED, "Jazz Night"], "gone from ops, not waiting to be restored");
    assert.deepEqual((await d1EventRepository(db).exportAll()).nights.filter((night) => String(night.eventId) === String(off.id)), []);
    assert.deepEqual(docsOf(off.slug), [], "no page, night or draft of it left on the website");
    assert.ok(inCalendar(off) > 3, "it was in the calendar");
    assert.equal(world.google.calendar().length, calendarBefore - inCalendar(off), "its calendar entries went");
    assert.equal(world.google.driveFiles.get(off.driveFolderId).trashed, true, "its Drive folder is in the bin");
    assert.equal(JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]), jazzBefore, "Jazz Night is untouched");
    assert.equal(world.google.driveFiles.get(kept.driveFolderId).trashed, undefined);
    assert.equal(docsOf(kept.slug, "published").filter((doc) => doc._type === "eventSeries").length, 1, "the Cocktail Hour stays");
    const text = lines.join("\n");
    assert.match(text, new RegExp(`"Happy Hour" \\(series ${off.id}\\) removed: ${off.dates.length} nights in ops, ${onWebsite} website documents, ${inCalendar(off)} calendar entries, its Drive folder`));
    assert.match(text, /1 series removed/);

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await migrate(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
  });

  it("the Cocktail Hour loses its Sundays: Wednesday to Saturday in ops, and on the website once its website job has run", async () => {
    const db = createTestD1("ops");
    const { kept, env } = await seedHappyHours(db);
    const sundays = kept.dates.filter((night) => night.date >= today && weekday(night.date) === "sun");
    assert.ok(sundays.length >= 3, "it has Sundays to come");
    const lines = await migrate(db);

    const now = await getEvent(env, kept.id);
    assert.deepEqual(now.weekdays, WED_TO_SAT);
    assert.deepEqual([...new Set(now.publish.previewDates.map(weekday))].sort(), [...WED_TO_SAT].sort(), "no Sunday to come");
    assert.equal(now.name, RENAMED);
    assert.equal(now.startsOn, kept.startsOn);
    assert.equal(now.endsOn, kept.endsOn);
    assert.match(lines.join("\n"), new RegExp(`"${RENAMED}" \\(series ${kept.id}\\): Sunday dropped, now wed, thu, fri, sat; ${sundays.length} Sunday nights to come leave the website`));

    // The website follows by itself, as after a save in ops.
    await untilReady(env, kept.id);
    const live = docsOf(kept.slug, "published").filter((doc) => doc._type === "event" && doc.date >= today);
    assert.ok(live.length > 8);
    assert.deepEqual([...new Set(live.map((doc) => weekday(doc.date)))].sort(), [...WED_TO_SAT].sort(), "Wednesday to Saturday only on the website");
    assert.deepEqual((await getEvent(env, kept.id)).dates.filter((night) => night.date >= today && weekday(night.date) === "sun"), []);
    assert.ok(!world.google.calendar().some((entry) => sundays.some((night) => night.googleCalendarEventId.includes(entry.id))), "the Sundays left the calendar");
  });

  it("renames the Cocktail Hour as staff would: new name in ops and on the website, same web address and night pages; then has nothing left to do", async () => {
    const db = createTestD1("ops");
    const { kept, env } = await seedHappyHours(db);
    const idsBefore = docsOf(kept.slug, "published").map((doc) => doc._id).sort();
    const lines = await migrate(db);

    const now = await getEvent(env, kept.id);
    assert.equal(now.name, RENAMED);
    assert.equal(now.slug, kept.slug, "the web address stays");
    assert.deepEqual(now.formerSlugs || [], []);
    assert.match(lines.join("\n"), new RegExp(`"${COCKTAIL_HOUR}" \\(series ${kept.id}\\) is now "${RENAMED}"; its web address stays /whats-on/${kept.slug}`));
    await untilReady(env, kept.id);
    const live = docsOf(kept.slug, "published").filter((doc) => doc._type === "eventSeries" || doc.date >= today);
    assert.deepEqual([...new Set(live.map((doc) => doc.title))], [RENAMED], "the page and every night to come carry the new name");
    const idsAfter = new Set(live.map((doc) => doc._id));
    assert.ok([...idsAfter].every((id) => idsBefore.includes(id)), "no new page: the same documents, renamed");
    assert.deepEqual(docsOf(kept.slug, "raw").filter((doc) => doc.date >= today && doc.title !== RENAMED), [], "nothing to come is left under the old name");

    // Again, now that it is named "Cocktail Hour": every step still finds it, and none has work.
    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await migrate(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls);
    assert.ok(again.some((line) => line.includes(`"${RENAMED}" (series ${kept.id}) runs wed, thu, fri, sat and has no Sunday`)), again.join("\n"));
    assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
  });

  it("after the rename it still stands as the happy hour that is kept, and loses a Sunday given back to it", async () => {
    const db = createTestD1("ops");
    const env = opsEnv(db);
    const kept = await add(db, { name: RENAMED, weekdays: [...WED_TO_SAT, "sun"] });
    await add(db, { name: "Happy Hour" });
    await migrate(db);
    assert.deepEqual((await listEvents(env, { withDeleted: true })).map((event) => event.name), [RENAMED]);
    assert.deepEqual((await getEvent(env, kept.id)).weekdays, WED_TO_SAT);
  });

  it("leaves a Cocktail Hour that already runs Wednesday to Saturday, and other days the owner gave it", async () => {
    const db = createTestD1("ops");
    await add(db, { name: RENAMED, weekdays: ["tue", ...WED_TO_SAT] });
    const before = [await dump(db), outside()];
    const lines = await migrate(db);
    assert.deepEqual([await dump(db), outside()], before);
    assert.ok(lines.some((line) => line.includes("has no Sunday; nothing to do")), lines.join("\n"));
  });

  it("leaves Happy Hour alone when the Cocktail Hour isn't there, and says so", async () => {
    const db = createTestD1("ops");
    await seedHappyHours(db, { keeper: false });
    const before = [await dump(db), outside()];
    const lines = await migrate(db);
    assert.deepEqual([await dump(db), outside()], before);
    assert.ok(lines.some((line) => line.startsWith("left alone:") && line.includes("would be the only happy hour")), lines.join("\n"));
  });

  it("a Happy Hour that never reached the website goes at once", async () => {
    const db = createTestD1("ops");
    const { off, env } = await seedHappyHours(db, { live: false });
    await migrate(db);
    assert.ok(!(await listEvents(env, { withDeleted: true })).some((event) => event.name === "Happy Hour"));
    assert.deepEqual(docsOf(off.slug), []);
  });

  it("finishes a Happy Hour someone deleted in ops that still waits on the Website page", async () => {
    const db = createTestD1("ops");
    const { off, env } = await seedHappyHours(db);
    assert.equal((await deleteEventFromOps(env, off.id)).pending, true);
    assert.ok(docsOf(off.slug, "published").length, "still on the website");
    await migrate(db);
    assert.ok(!(await listEvents(env, { withDeleted: true })).some((event) => event.name === "Happy Hour"));
    assert.deepEqual(docsOf(off.slug), []);
  });

  /** A Cocktail Hour that ran every day and is live; then ops lost its Mondays and Tuesdays without telling the website. */
  async function seedStrays(db) {
    const kept = await add(db, { name: COCKTAIL_HOUR, weekdays: ["mon", "tue", ...WED_TO_SAT, "sun"] });
    const repo = d1EventRepository(db);
    const strays = kept.dates.filter((night) => night.date >= today && ["mon", "tue"].includes(weekday(night.date)));
    for (const night of strays) await repo.removeNight(night.id);
    await repo.update(kept.id, { weekdays: [...WED_TO_SAT, "sun"] });
    return { kept, strays, env: opsEnv(db) };
  }

  it("takes off the website the Cocktail Hour's nights to come that ops doesn't have and its days don't include", async () => {
    const db = createTestD1("ops");
    const { kept, strays, env } = await seedStrays(db);
    const jazz = await add(db, { name: "Jazz Night", weekdays: ["tue"] });
    assert.ok(strays.length >= 6, "Mondays and Tuesdays to come");
    const days = (view) => [...new Set(docsOf(kept.slug, view).filter((doc) => doc._type === "event" && doc.date >= today).map((doc) => weekday(doc.date)))].sort();
    assert.ok(days("published").includes("mon") && days("published").includes("tue"), "they are on the website to begin with");
    const jazzBefore = JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]);

    const lines = await migrate(db);

    const strayIds = new Set(strays.map((night) => night.sanityId));
    assert.deepEqual(docsOf(kept.slug).filter((doc) => strayIds.has(doc._id.replace(/^drafts\./, ""))), [], "gone from the website, no draft left");
    assert.equal(JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]), jazzBefore, "another series' Tuesdays stay");
    assert.match(lines.join("\n"), new RegExp(`"${RENAMED}" \\(series ${kept.id}\\): ${strays.length} nights taken off the website that ops doesn't have \\(Mondays and Tuesdays\\)`));
    await untilReady(env, kept.id);
    assert.deepEqual(days("published"), [...WED_TO_SAT].sort(), "Wednesday to Saturday only, on the website");
    assert.deepEqual(days("raw"), [...WED_TO_SAT].sort());

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await migrate(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
  });

  it("leaves a night the website has for a day the Cocktail Hour still runs, and past nights", async () => {
    const db = createTestD1("ops");
    const { kept } = await seedStrays(db);
    const repo = d1EventRepository(db);
    // Ops also lost a Thursday to come and a Monday gone by: neither is a stray.
    const thursday = (await getEvent(opsEnv(db), kept.id)).dates.find((night) => night.date >= today && weekday(night.date) === "thu");
    await repo.removeNight(thursday.id);
    const past = docsOf(kept.slug, "published").filter((doc) => doc._type === "event" && doc.date < today).map((doc) => doc._id);
    await migrate(db);
    const left = new Set(docsOf(kept.slug, "published").map((doc) => doc._id));
    assert.ok(left.has(thursday.sanityId), "a Thursday is in its days: left for the website job");
    for (const id of past) assert.ok(left.has(id), `${id} is in the past: left`);
  });

  it("a dry run names the nights it would take off the website and takes none", async () => {
    const db = createTestD1("ops");
    const { kept, strays } = await seedStrays(db);
    const before = [await dump(db), outside()];
    const calls = writes();
    const lines = await migrate(db, { dryRun: true });
    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls, "nothing sent that writes");
    assert.match(lines.join("\n"), new RegExp(`"${RENAMED}" \\(series ${kept.id}\\): would take ${strays.length} nights off the website that ops doesn't have \\(Mondays and Tuesdays\\): ${strays[0].date}`));
  });

  it("says when there is no Happy Hour", async () => {
    const db = createTestD1("ops");
    await add(db, { name: COCKTAIL_HOUR });
    const lines = await migrate(db);
    assert.ok(lines.includes('not found: no series named "Happy Hour"; nothing to remove'), lines.join("\n"));
  });

  it("a dry run changes nothing in ops, on the website, the calendar or Drive, and says what it would do", async () => {
    const db = createTestD1("ops");
    const { off, kept } = await seedHappyHours(db);
    const before = [await dump(db), outside()];
    const calls = writes();
    const lines = await migrate(db, { dryRun: true });
    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls, "nothing sent that writes");
    const text = lines.join("\n");
    assert.match(text, new RegExp(`would remove "Happy Hour" \\(series ${off.id}\\): ${off.dates.length} nights in ops, ${docsOf(off.slug, "published").length} website documents, ${inCalendar(off)} calendar entries, its Drive folder`));
    assert.match(text, new RegExp(`would change events ${kept.id} "${RENAMED}": weekdays \\["wed","thu","fri","sat","sun"\\] → \\["wed","thu","fri","sat"\\]`));
    assert.match(text, /1 series to remove/);
  });
});

describe("2026-11-10-chez-pickle-menu", () => {
  it("adds the Food chapter for the pop-up kitchen, with its dishes on the digital menu only; then has nothing to add", async () => {
    const db = createTestD1("ops");
    await seed(db);
    await run(categories, db);
    const lines = await run(chezPickle, db);
    const { sections, items } = await tree(db);
    const chapter = sections.find((row) => row.slug === "chez-pickle");
    const popup = (await d1EventRepository(db).listEvents()).find((event) => event.name === "Chez Pickle");
    assert.equal(chapter.title, "Chez Pickle");
    assert.equal(chapter.kind, "kitchen");
    assert.equal(chapter.popupSeriesId, String(popup.id));
    assert.equal(chapter.subtitle, "Tell us about any allergies. We take every care, but can't guarantee against cross-contamination.");
    assert.deepEqual(
      chapter.subsections.map((group) => [group.title, group.subtitle, group.items.map((item) => `${item.name} ${item.price}`)]),
      [
        ["Burgers", "For a single patty, take off £2.50", ["Liberty Burger 15.50", "OG Burger 14", "Classic Cheeseburger 12.50"]],
        ["Fries and dips", undefined, ["Fries 6", "Disco dust 1", "Premium dips 2", "Dips 1"]],
        ["Dessert", undefined, ["Brown butter and almond cake 8"]],
      ],
    );
    const dishes = items.filter((item) => chapter.subsections.some((group) => group._id === item.sectionId));
    assert.equal(dishes.length, 8);
    for (const dish of dishes) {
      assert.deepEqual(dish.placements.map((row) => row.channel), ["digital"], `${dish.name}: digital only`);
      assert.equal(dish.onPrintMenu, false);
      assert.equal(dish.onDigitalMenu, true);
      assert.deepEqual(dish.posMenus, [], `${dish.name}: not on the till`);
      assert.deepEqual(dish.ingredients, []);
    }
    assert.match(dishes.find((dish) => dish.name === "Fries").description, /^Koffmann's skin-on fries/);
    const repo = d1MenuRepository(db);
    assert.equal((await repo.list("menu_placements")).filter((row) => row.channel === "pos").length, 2, "only the drinks' POS rows");
    assert.ok(lines.some((line) => line.includes('belongs to the "Chez Pickle" pop-up kitchen')), lines.join("\n"));

    // The owner changes a price; a second run leaves it, and everything else.
    const fries = dishes.find((dish) => dish.name === "Fries");
    await repo.update("menu_items", fries._id, { price: "6.5" });
    const before = await dump(db);
    const again = await run(chezPickle, db);
    assert.equal(await dump(db), before, "a second run writes nothing");
    assert.ok(again.some((line) => line.startsWith("Nothing to add")), again.join("\n"));
  });

  it("goes without a pop-up kitchen when the series isn't one yet, and picks it up on a later run", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const lines = await run(chezPickle, db);
    assert.ok(lines.some((line) => line.startsWith('no pop-up kitchen named "Chez Pickle"')), lines.join("\n"));
    assert.equal((await tree(db)).sections.find((row) => row.slug === "chez-pickle").popupSeriesId, null);
    await run(categories, db);
    await run(chezPickle, db);
    assert.ok((await tree(db)).sections.find((row) => row.slug === "chez-pickle").popupSeriesId);
  });

  it("stops before writing anything when a dish name is already on the menu elsewhere", async () => {
    const db = createTestD1("ops");
    await seed(db);
    await d1MenuRepository(db).create("menu_items", { name: "FRIES", sectionId: 68 });
    const before = await dump(db);
    await assert.rejects(
      () => run(chezPickle, db),
      /nothing was changed:\n {2}"Fries" would clash with "FRIES" \(item \d+, in "Spritz"\)/,
    );
    assert.equal(await dump(db), before);
  });

  it("a dry run writes nothing", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await dump(db);
    const lines = await run(chezPickle, db, { dryRun: true });
    assert.equal(await dump(db), before);
    assert.match(lines.join("\n"), /would add menu_items \d+ "Liberty Burger"/);
    assert.match(lines.join("\n"), /would add menu_placements \d+ \(digital\)/);
    assert.doesNotMatch(lines.join("\n"), /\(pos\)/);
  });
});

describe("2026-11-10-z-promotions-on-website", () => {
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const today = iso(0);
  const COCKTAIL_HOUR = "From Wednesday to Saturday is the Cocktail Hour 🍹";

  let world;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => world.restore());

  const opsEnv = (db) => ({ ...world.env, eventRepository: d1EventRepository(db), menuRepository: d1MenuRepository(db) });
  const migrate = (migration, db, options = {}) => run(migration, db, { processEnv: world.env, ...options });
  const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;
  const docsOf = (slug, view) =>
    world.sanity.view(view).filter((doc) => doc.seriesId === slug || doc._id.replace(/^drafts\./, "") === `series-${slug}`);
  /** The categories of a series' page and nights to come, in one view: [] when none carries one. */
  const categoriesOf = (slug, view) =>
    docsOf(slug, view)
      .filter((doc) => doc._type === "eventSeries" || doc.date >= today)
      .map((doc) => doc.category ?? null);
  const all = (list, value) => list.length > 0 && list.every((item) => item === value);

  /** Three series live on the website as nights, as production has them before the release. */
  async function seedLive(db) {
    const env = opsEnv(db);
    const out = {};
    for (const [key, name] of [["cocktail", COCKTAIL_HOUR], ["pickle", "Chez Pickle"], ["jazz", "Jazz Night"]]) {
      const event = await createEvent(env, {
        name,
        shortDescription: "Short.",
        description: "Longer.",
        startTime: "17:00",
        endTime: "19:00",
        startsOn: iso(-7),
        endsOn: iso(30),
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["wed", "thu", "fri", "sat"],
      });
      for (let step = 0; ; step += 1) {
        const result = await runWebsiteJob(env, { eventId: event.id });
        assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
        if (result.done) break;
        assert.ok(step < 60, "the website job never finished");
      }
      out[key] = await getEvent(env, event.id);
    }
    return { ...out, env };
  }

  it("puts each promotion and pop-up kitchen on the website as one: its page and every night to come, preview and website; then has nothing to do", async () => {
    const db = createTestD1("ops");
    const { cocktail, pickle, jazz, env } = await seedLive(db);
    assert.ok(all(categoriesOf(cocktail.slug, "published"), null), "live as nights to begin with");
    await migrate(categories, db);
    const jazzBefore = JSON.stringify(docsOf(jazz.slug, "raw"));

    const lines = await migrate(onWebsite, db);

    for (const view of ["published", "previewDrafts"]) {
      assert.ok(all(categoriesOf(cocktail.slug, view), "promotion"), `the Cocktail Hour is a promotion (${view})`);
      assert.ok(all(categoriesOf(pickle.slug, view), "popup"), `Chez Pickle is a pop-up kitchen (${view})`);
    }
    assert.ok(categoriesOf(cocktail.slug, "published").length > 8);
    assert.equal(JSON.stringify(docsOf(jazz.slug, "raw")), jazzBefore, "a night is untouched");
    const now = await getEvent(env, cocktail.id);
    assert.deepEqual([now.publish.preview, now.publish.live], ["current", "current"]);
    assert.match(lines.join("\n"), new RegExp(`"${COCKTAIL_HOUR}" \\(series ${cocktail.id}\\) is on the website as a promotion`));
    assert.match(lines.join("\n"), /2 series put on the website/);

    const before = [await dump(db), JSON.stringify(world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc))];
    const calls = writes();
    const again = await migrate(onWebsite, db);
    assert.deepEqual([await dump(db), JSON.stringify(world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc))], before);
    assert.equal(writes(), calls, "a second run writes nothing anywhere");
    assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
  });

  it("puts the category back when the preview lost it (staged again by ops code from before categories)", async () => {
    const db = createTestD1("ops");
    const { cocktail, env } = await seedLive(db);
    await migrate(categories, db);
    await migrate(onWebsite, db);
    // Older ops code stages the same documents without the field, as drafts.
    const stripped = docsOf(cocktail.slug, "published").map(({ category, _rev, _updatedAt, _createdAt, ...doc }) => ({ createOrReplace: doc }));
    await sanityMutate(env, stripped);
    assert.ok(all(categoriesOf(cocktail.slug, "previewDrafts"), null), "the preview shows nights again");

    await migrate(onWebsite, db);
    for (const view of ["published", "previewDrafts"]) {
      assert.ok(all(categoriesOf(cocktail.slug, view), "promotion"), `a promotion again (${view})`);
    }
  });

  it("only stages the preview when the website doesn't follow saves by itself", async () => {
    const db = createTestD1("ops");
    const { cocktail } = await seedLive(db);
    await migrate(categories, db);
    world.baserow.insert("Config", { Name: "website.auto_update", Value: "off", Env: "dev", Service: "ops" });
    resetConfigCacheForTests();
    const lines = await migrate(onWebsite, db);
    assert.ok(all(categoriesOf(cocktail.slug, "previewDrafts"), "promotion"));
    assert.ok(all(categoriesOf(cocktail.slug, "published"), null), "the website waits for Update website");
    assert.match(lines.join("\n"), /waits for Update website/);
  });

  it("a dry run says which series it would put on the website and writes nothing", async () => {
    const db = createTestD1("ops");
    const { cocktail } = await seedLive(db);
    await migrate(categories, db);
    const before = await dump(db);
    const calls = writes();
    const lines = await migrate(onWebsite, db, { dryRun: true });
    assert.equal(await dump(db), before);
    assert.equal(writes(), calls, "nothing sent that writes");
    assert.match(lines.join("\n"), new RegExp(`would put "${COCKTAIL_HOUR}" \\(series ${cocktail.id}\\) on the website as a promotion`));
  });
});

describe("2026-11-10-offer-pounds", () => {
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  it("writes an amount in pounds with the sign first, and leaves everything else as it is", () => {
    const cases = [
      ["6 POUND BEER", "£6 BEER"],
      ["5 pound glass wine", "£5 glass wine"],
      ["10 Pounds a bottle", "£10 a bottle"],
      ["7.50 pounds", "£7.50"],
      ["2 for 10 pounds", "2 for £10"],
      ["5pound pints", "£5 pints"],
      ["5-pound pints", "£5 pints"],
      ["5 pound pints, 8 pounds cocktails", "£5 pints, £8 cocktails"],
      ["BEER 6 POUND.", "BEER £6."],
      ["£8 NEGRONI", "£8 NEGRONI"],
      ["£8 pound negroni", "£8 pound negroni"],
      ["quarter pounder and fries", "quarter pounder and fries"],
      ["1/4 pounder", "1/4 pounder"],
      ["pound cake", "pound cake"],
      ["a pound off", "a pound off"],
      ["one pound shots", "one pound shots"],
      ["20% OFF ALL COCKTAIL", "20% OFF ALL COCKTAIL"],
      ["", ""],
    ];
    for (const [before, after] of cases) assert.equal(offerPounds.poundsToSign(before), after, before);
    for (const [, after] of cases) assert.equal(offerPounds.poundsToSign(after), after, `again: ${after}`);
    assert.deepEqual(offerPounds.amountsInWords("a pound off, or one pound shots; pound cake; five pounds"), ["a pound", "one pound", "five pounds"]);
    assert.deepEqual(offerPounds.amountsInWords("£6 BEER and a quarter pounder"), []);
  });

  describe("on the events", () => {
    let world;
    beforeEach(async () => {
      world = await createFakeWorld();
      world.install();
    });
    afterEach(() => world.restore());

    const opsEnv = (db) => ({ ...world.env, eventRepository: d1EventRepository(db), menuRepository: d1MenuRepository(db) });
    const migrate = (db, options = {}) => run(offerPounds, db, { processEnv: world.env, ...options });
    const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;

    async function seedOffers(db) {
      const env = opsEnv(db);
      const add = (fields) =>
        createEvent(env, {
          description: "Longer.",
          startTime: "17:00",
          endTime: "19:00",
          startsOn: iso(-7),
          endsOn: iso(30),
          repeatUnit: "week",
          repeatEvery: 1,
          weekdays: ["wed", "thu", "fri", "sat"],
          ...fields,
        });
      const karaoke = await add({ name: "Karaoke", offer: "6 POUND BEER", shortDescription: "Sing. 2 for 10 pounds." });
      const negroni = await add({ name: "Negroni Society", offer: "£8 Negroni", shortDescription: "Stirred slowly." });
      const words = await add({ name: "Quiz", offer: "A POUND OFF", description: "Pints are 5 pounds all night." });
      // One night of Karaoke with an offer of its own.
      const night = (await getEvent(env, karaoke.id)).dates.find((row) => row.date >= iso(0));
      await ensureOccurrence(env, karaoke.id, night.date, { offer: "5 pound glass wine" });
      for (const event of [karaoke, negroni, words]) {
        for (let step = 0; ; step += 1) {
          const result = await runWebsiteJob(env, { eventId: event.id });
          assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
          if (result.done) break;
          assert.ok(step < 60, "the website job never finished");
        }
      }
      return { env, karaoke, negroni, words, night };
    }

    it("changes the offer and the card line of a series, and a night's own offer; says what it left; then has nothing to do", async () => {
      const db = createTestD1("ops");
      const { env, karaoke, negroni, words, night } = await seedOffers(db);
      const negroniBefore = JSON.stringify(await getEvent(env, negroni.id));

      const lines = await migrate(db);

      const now = await getEvent(env, karaoke.id);
      assert.equal(now.offer, "£6 BEER");
      assert.equal(now.shortDescription, "Sing. 2 for £10.");
      const changedNight = now.dates.find((row) => row.date === night.date);
      assert.equal(changedNight.overrides.offer, "£5 glass wine");
      assert.deepEqual(
        now.dates.filter((row) => row.date !== night.date).map((row) => row.overrides?.offer || ""),
        now.dates.filter((row) => row.date !== night.date).map(() => ""),
        "the other nights still follow the series",
      );
      assert.equal(JSON.stringify(await getEvent(env, negroni.id)), negroniBefore, "an offer already written with £ is untouched");
      const quiz = await getEvent(env, words.id);
      assert.equal(quiz.offer, "A POUND OFF");
      assert.equal(quiz.description, "Pints are 5 pounds all night.", "long descriptions are not changed");
      const text = lines.join("\n");
      assert.ok(text.includes(`"Karaoke" (series ${karaoke.id}) offer: "6 POUND BEER" → "£6 BEER"`), text);
      assert.ok(text.includes(`"Karaoke" (series ${karaoke.id}) card line: "Sing. 2 for 10 pounds." → "Sing. 2 for £10."`), text);
      assert.ok(text.includes(`"Karaoke" (series ${karaoke.id}) ${night.date} offer: "5 pound glass wine" → "£5 glass wine"`), text);
      assert.ok(text.includes(`left alone: "Quiz" (series ${words.id}) offer "A POUND OFF": an amount in words ("A POUND")`), text);
      assert.ok(text.includes(`not changed: "Quiz" (series ${words.id}) description says "5 pounds"`), text);
      assert.match(text, /3 texts changed/);

      // The website follows by itself, as after a save in ops.
      for (let step = 0; step < 60 && !(await runWebsiteJob(env, { eventId: karaoke.id })).done; step += 1);
      const live = world.sanity.view("published").filter((doc) => doc.seriesId === now.slug && doc.date >= iso(0));
      assert.deepEqual([...new Set(live.map((doc) => doc.offer))].sort(), ["£5 glass wine", "£6 BEER"]);

      const before = await dump(db);
      const calls = writes();
      const again = await migrate(db);
      assert.equal(await dump(db), before, "a second run writes nothing");
      assert.equal(writes(), calls);
      assert.ok(again.some((line) => line.startsWith("Nothing to do")), again.join("\n"));
    });

    it("a series ops would refuse to save is left as it was and named; the others still change, and it doesn't stop the run", async () => {
      const db = createTestD1("ops");
      const env = opsEnv(db);
      // An old series from before today's rules: weekly, with no weekday. It comes first.
      const legacy = await createEvent(env, {
        name: "Legacy Shots",
        description: "Longer.",
        offer: "4 POUND SHOTS",
        startTime: "17:00",
        endTime: "19:00",
        startsOn: iso(-7),
        endsOn: iso(30),
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["fri"],
      });
      await d1EventRepository(db).update(legacy.id, { weekdays: [] });
      const { karaoke, night } = await seedOffers(db);

      const lines = await migrate(db);

      const text = lines.join("\n");
      assert.equal((await d1EventRepository(db).get(legacy.id)).offer, "4 POUND SHOTS", "left as it was");
      const now = await getEvent(env, karaoke.id);
      assert.equal(now.offer, "£6 BEER", "the series after it still changed");
      assert.equal(now.dates.find((row) => row.date === night.date).overrides.offer, "£5 glass wine");
      assert.ok(
        text.includes(`could not save "Legacy Shots" (series ${legacy.id}), left as it was: Choose at least one weekday. (offer: "4 POUND SHOTS" → "£4 SHOTS")`),
        text,
      );
      assert.match(text, /3 texts changed/);
      assert.match(text, /1 could not be saved \(above\): open it in ops, fix what it says, and write the price with £ there/);

      // A dry run says the same, and still gets to the end.
      const rehearsed = (await migrate(db, { dryRun: true })).join("\n");
      assert.ok(rehearsed.includes(`could not save "Legacy Shots" (series ${legacy.id})`), rehearsed);
    });

    it("something unexpected still stops it", async () => {
      const db = createTestD1("ops");
      await seedOffers(db);
      const repo = d1EventRepository(db);
      const broken = { ...repo, update: async () => { throw new Error("D1 is down."); } };
      await assert.rejects(offerPounds.offersInPounds({ ...world.env, eventRepository: broken, menuRepository: d1MenuRepository(db) }), /D1 is down/);
    });

    it("a dry run lists each change, before and after, and writes nothing", async () => {
      const db = createTestD1("ops");
      const { karaoke, night } = await seedOffers(db);
      const before = await dump(db);
      const calls = writes();
      const lines = await migrate(db, { dryRun: true });
      assert.equal(await dump(db), before);
      assert.equal(writes(), calls, "nothing sent that writes");
      const text = lines.join("\n");
      assert.ok(text.includes(`would change "Karaoke" (series ${karaoke.id}) offer: "6 POUND BEER" → "£6 BEER"`), text);
      assert.ok(text.includes(`would change "Karaoke" (series ${karaoke.id}) ${night.date} offer: "5 pound glass wine" → "£5 glass wine"`), text);
      assert.match(text, /3 texts to change/);
    });
  });
});
