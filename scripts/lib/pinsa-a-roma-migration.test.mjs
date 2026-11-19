/**
 * migrations/2026-11-19-pinsa-a-roma.mjs, run as a deploy runs it against a
 * D1 with the real schema, with Sanity, Google Calendar and Drive faked: for
 * real (the pop-up, its Monday and Tuesday nights, its menu, the website), again (nothing
 * to do), with a dish name already taken (stops before writing), and as a
 * dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { createEvent, listEvents } from "../../ops/site/src/events/server/event-store.js";
import { createMenuItem, createMenuSection, loadMenuTree } from "../../ops/site/src/menu/server/menu-store.js";
import { createMenu, listMenus } from "../../ops/site/src/menu/server/menus.js";
import { flattenMenuSections } from "../../ops/site/src/menu/menu-sections.js";
import { WEEK as SHUT_MONDAYS } from "../../migrations/2026-11-11-opening-hours.mjs";
import { d1VenueRepository } from "../../ops/site/src/venue/server/adapters/d1-venue.js";
import { saveOpeningHours, venueDetailsNow } from "../../ops/site/src/venue/server/venue-details.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as pinsa from "../../migrations/2026-11-19-pinsa-a-roma.mjs";

const { SLUG, CHAPTER } = pinsa;
const DISHES = CHAPTER.groups.flatMap((group) => group.items.map((item) => item.name));

describe("2026-11-19-pinsa-a-roma", () => {
  let world;
  beforeEach(async () => {
    // The day the owner sent the menu: Thursday the 19th.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T12:00:00Z") });
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
  const hoursOf = async (env) =>
    Object.fromEntries((await venueDetailsNow(env.venueRepository)).details.openingHours.map((day) => [day.day, day.closed ? "shut" : `${day.opens}–${day.closes}`]));

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    const result = await pinsa.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return { lines, text: lines.join("\n"), result };
  }

  const dump = async (db) => JSON.stringify([await d1EventRepository(db).exportAll(), await d1MenuRepository(db).list("menus")]);
  const findPopup = async (env) => (await listEvents(env)).find((event) => event.slug === SLUG);

  /** Chez Pickle, as dev and production have it: its own Fries and dessert. */
  async function seedChezPickle(env, { hours = SHUT_MONDAYS } = {}) {
    await saveOpeningHours(env, hours, { by: "test" });
    const chez = await createEvent(env, {
      name: "Chez Pickle",
      category: "popup",
      description: "Smash burgers.",
      startsOn: "2026-11-25",
      startTime: "17:00",
      endTime: "22:00",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["wed"],
    });
    const menu = await createMenu(env, { name: "Chez Pickle", kind: "kitchen", popupSeriesId: chez.id, days: "wed" });
    const chapter = await createMenuSection(env, { title: "Chez Pickle", slug: "chez-pickle", menuId: menu.id });
    const sides = await createMenuSection(env, { title: "Fries and dips", slug: "fries-and-dips", parentId: chapter._id });
    await createMenuSection(env, { title: "Dessert", slug: "dessert", parentId: chapter._id });
    await createMenuItem(env, { name: "Fries", price: "6", sectionId: sides._id, placements: [{ channel: "digital", sectionId: sides._id }] });
  }

  it("adds the pop-up on Mondays and Tuesdays from the 23rd, its menu and dishes beside Chez Pickle's, puts it on the website; then nothing to do", async () => {
    const db = createTestD1("ops");
    const env = opsEnv(db);
    await seedChezPickle(env);

    const { text, result } = await run(db);

    const popup = await findPopup(env);
    assert.deepEqual(
      [popup.name, popup.category, popup.repeatUnit, popup.weekdays, popup.startsOn, popup.endsOn, popup.startTime, popup.endTime, popup.pageUrl],
      ["Pinsa A Roma", "popup", "week", ["mon", "tue"], "2026-11-23", "", "12:00", "21:00", "https://aroma.london/"],
    );
    assert.deepEqual(popup.dates.slice(0, 3).map((night) => night.date), ["2026-11-23", "2026-11-24", "2026-11-30"]);
    assert.equal(popup.publish.live, "current", "on the website");
    assert.ok(popup.logo?.asset, "its logo");
    assert.ok(popup.mainImage?.asset, "its main picture");
    assert.equal(popup.gallery.length, pinsa.PICTURES.gallery.length, "its gallery");

    const menu = (await listMenus(env)).menus.find((row) => row.slug === SLUG);
    assert.deepEqual([menu.name, menu.kind, menu.popupSeriesId, menu.startsOn, menu.endsOn, menu.days], ["Pinsa A Roma", "kitchen", String(popup.id), "2026-11-23", "", ["mon", "tue"]]);

    const { sections, items } = await loadMenuTree(env);
    const chapter = sections.find((section) => section.slug === SLUG);
    assert.equal(String(chapter.menuId), String(menu.id));
    const groups = flattenMenuSections(sections).filter((section) => section.parentId === chapter._id).map((section) => section.title);
    assert.deepEqual(groups, ["Pinsa", "Sides and dips", "Dessert"]);
    const ours = items.filter((item) => DISHES.includes(item.name));
    assert.deepEqual(ours.map((item) => item.name).sort(), [...DISHES].sort());
    assert.equal(ours.find((item) => item.name === "Giulio Cesare").price, "16");
    const photographed = ours.filter((item) => item.image?.asset?._id).map((item) => item.name).sort();
    assert.deepEqual(photographed, Object.keys(pinsa.PICTURES.dishes).sort(), "a photo on each dish there is one of");
    for (const item of ours) assert.deepEqual(item.placements.map((row) => row.channel), ["digital"], `${item.name}: digital menu only`);

    assert.deepEqual(await hoursOf(env), {
      mon: "12:00–21:00",
      tue: "12:00–22:30",
      wed: "17:00–22:30",
      thu: "17:00–22:30",
      fri: "16:00–23:30",
      sat: "16:00–01:00",
      sun: "16:00–22:00",
    }, "open Mondays, Tuesday from noon, the rest as it was");
    assert.deepEqual(result, { popup: "added", menu: 14, hours: "changed", published: true });
    assert.match(text, /added the pop-up kitchen "Pinsa A Roma" \(event \d+\): every Monday and Tuesday from 2026-11-23, 12:00–21:00, no end date/);
    assert.match(text, /Pinsa: Trastevere \(V\) £13\.50, Colosseo £14\.50, Villa Borghese \(V\) £15\.50, Giulio Cesare £16/);
    assert.match(text, /is on the website: \/whats-on\/pinsa-a-roma/);
    assert.match(text, /added to its gallery: trastevere\.jpg, colosseo\.jpg, villa-borghese\.jpg, focaccia\.jpg/);
    assert.match(text, /added a photo to: Trastevere \(V\), Colosseo, Villa Borghese \(V\)/);

    const before = await dump(db);
    const again = await run(db);
    assert.equal(await dump(db), before, "a second run changes nothing");
    assert.match(again.text, /^Nothing to do: "Pinsa A Roma" \(event \d+\) and its menu are there, and the website is in step\.$/);
  });

  it("leaves opening hours the owner has changed since, and says so", async () => {
    const db = createTestD1("ops");
    const env = opsEnv(db);
    const own = SHUT_MONDAYS.map((day) => (day.day === "tue" ? { ...day, opens: "16:00" } : day));
    await seedChezPickle(env, { hours: own });

    const { text, result } = await run(db);

    assert.equal(result.hours, "owner's");
    assert.equal((await hoursOf(env)).mon, "shut");
    assert.equal((await hoursOf(env)).tue, "16:00–22:30");
    assert.match(text, /left alone: the opening hours aren't shut Mondays and Tuesday 5–10:30pm any more/);
  });

  it("stops before writing anything when a dish name is taken elsewhere", async () => {
    const db = createTestD1("ops");
    const env = opsEnv(db);
    await seedChezPickle(env);
    const dessert = flattenMenuSections((await loadMenuTree(env)).sections).find((s) => s.slug === "dessert");
    await createMenuItem(env, { name: "Tiramisu", price: "7", sectionId: dessert._id, placements: [{ channel: "digital", sectionId: dessert._id }] });
    const before = await dump(db);

    await assert.rejects(run(db), /Pinsa A Roma was not added, and nothing was changed:\n {2}"Tiramisù" would clash with "Tiramisu"/);
    assert.equal(await dump(db), before);
  });

  it("dry run: says what it would add and changes nothing", async () => {
    const db = createTestD1("ops");
    const env = opsEnv(db);
    await seedChezPickle(env);
    const before = await dump(db);

    const { text, result } = await run(db, { dryRun: true });

    assert.equal(await dump(db), before);
    assert.equal(await findPopup(env), undefined);
    assert.deepEqual(result, { popup: "added", menu: 14, hours: "changed", published: false });
    assert.equal((await hoursOf(env)).mon, "shut", "a dry run leaves the hours");
    assert.match(text, /would have: added the pop-up kitchen "Pinsa A Roma"/);
    assert.match(text, /would put it on the website \(\/whats-on\/pinsa-a-roma\), and its menu/);
  });
});
