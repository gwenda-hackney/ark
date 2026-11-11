/**
 * Use cases (#240): staff change the opening hours or the party facts in
 * ops (Venue details), and the website says the new ones. Real API handlers
 * on a test D1, with Sanity and the settings faked (testing/fake-world.js);
 * "what the website says" is the website's own query and modules
 * (marketing/web/src/lib/venue-details.js, opening-hours.js,
 * party-facts.js) run against the documents a build would read.
 */
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  openingHoursSpecification,
  todayLine,
  weekRows,
} from "../../../../marketing/web/src/lib/opening-hours.js";
import { partyFactLines } from "../../../../marketing/web/src/lib/party-facts.js";
import { VENUE_DETAILS_QUERY, readVenueDetails } from "../../../../marketing/web/src/lib/venue-details.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { onRequestGet as getVenue } from "../../functions/api/venue/index.js";
import { onRequestPut as putHours } from "../../functions/api/venue/hours.js";
import { onRequestPut as putParties } from "../../functions/api/venue/parties.js";
import { onRequestPost as updateWebsite } from "../../functions/api/web/release.js";

const GWENDA = [
  { day: "mon", closed: true },
  { day: "tue", closed: false, opens: "17:00", closes: "22:00" },
  { day: "wed", closed: false, opens: "17:00", closes: "22:30" },
  { day: "thu", closed: false, opens: "17:00", closes: "22:30" },
  { day: "fri", closed: false, opens: "16:00", closes: "23:30" },
  { day: "sat", closed: false, opens: "16:00", closes: "01:00" },
  { day: "sun", closed: false, opens: "16:00", closes: "22:00" },
];

let world;
beforeEach(async () => {
  world = await createFakeWorld();
  world.install();
  world.env.OPS_DB = createTestD1("ops");
});
afterEach(() => world.restore());

const save = (days) => callApi(world, putHours, { method: "PUT", path: "/api/venue/hours", body: { days } });
const saveParties = (parties) =>
  callApi(world, putParties, { method: "PUT", path: "/api/venue/parties", body: { parties } });
const read = () => callApi(world, getVenue, { path: "/api/venue" });

/** The venue's details a site build reads: the live site published documents, the preview drafts over them. */
async function websiteDetails(site = "live") {
  const docs = world.sanity.view(site === "live" ? "published" : "previewDrafts");
  return readVenueDetails(await (await evaluate(parse(VENUE_DETAILS_QUERY), { dataset: docs })).get());
}

/** The week a site build reads. */
const websiteWeek = async (site = "live") => (await websiteDetails(site)).openingHours;

/** The lines the party page shows. */
const partyPage = async (site = "live") =>
  partyFactLines((await websiteDetails(site)).parties).map((line) => line.text);

describe("opening hours: ops to the website", () => {
  it("has no hours until they are saved, and the website says nothing", async () => {
    const res = await read();
    assert.equal(res.status, 200);
    assert.equal(res.data.openingHours, null);
    assert.equal(res.data.website, "none");
    assert.equal(await websiteWeek(), null);
  });

  it("saving the week puts it on the website, Saturday's late close and all", async () => {
    const res = await save(GWENDA);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, true);
    assert.equal(res.data.website, "live");
    assert.deepEqual(res.data.warnings, []);

    const week = await websiteWeek();
    assert.deepEqual(
      weekRows(week).map((row) => `${row.days} ${row.hours}`),
      ["Mon Closed", "Tue 5–10pm", "Wed–Thu 5–10:30pm", "Fri 4–11:30pm", "Sat 4pm–1am", "Sun 4–10pm"],
    );
    // 00:30 on Sunday is still Saturday's night
    assert.equal(todayLine(week, new Date("2026-11-15T00:30:00Z")), "Open now till 1am");
    const saturday = openingHoursSpecification(week).find((spec) => spec.dayOfWeek.includes("Saturday"));
    assert.equal(saturday.closes, "01:00");
    // Nothing left waiting
    assert.deepEqual(world.sanity.drafts("venueDetails"), []);

    const again = await read();
    assert.equal(again.data.website, "live");
    assert.deepEqual(
      again.data.openingHours.days.map((day) => day.day),
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    );
  });

  it("a change replaces the hours the website shows", async () => {
    await save(GWENDA);
    const res = await save(
      GWENDA.map((day) => (day.day === "mon" ? { day: "mon", closed: false, opens: "12:00", closes: "18:00" } : day)),
    );
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const week = await websiteWeek();
    assert.equal(weekRows(week)[0].hours, "midday–6pm");
    assert.equal(todayLine(week, new Date("2026-11-09T10:00:00Z")), "Open today midday–6pm");
  });

  it("with website.auto_update off, the hours wait on the preview for Update website", async () => {
    world.baserow.insert("Config", { Name: "website.auto_update", Value: "off", Env: "dev", Service: "ops" });
    const res = await save(GWENDA);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, false);
    assert.equal(res.data.website, "preview");
    assert.equal(await websiteWeek("live"), null);
    assert.equal(weekRows(await websiteWeek("preview")).length, 6);
    assert.equal((await read()).data.website, "preview");

    // Update website on the Website page puts them live
    const published = await callApi(world, updateWebsite, {
      method: "POST",
      path: "/api/web/release",
      body: { confirm: "production" },
    });
    assert.equal(published.status, 200, JSON.stringify(published.data));
    assert.equal(weekRows(await websiteWeek("live")).length, 6);
    assert.equal((await read()).data.website, "live");
  });

  it("a week that doesn't add up is refused, saying which day, and nothing changes", async () => {
    const res = await save(GWENDA.map((day) => (day.day === "tue" ? { ...day, closes: "16:00" } : day)));
    assert.equal(res.status, 400);
    assert.match(res.data.error, /^Tuesday: It closes before it opens/);
    assert.deepEqual(Object.keys(res.data.problems), ["tue"]);
    assert.equal((await read()).data.openingHours, null);
    assert.equal(await websiteWeek(), null);

    const short = await save(GWENDA.slice(0, 6));
    assert.equal(short.status, 400);
    assert.match(short.data.error, /Sunday: Missing from the week/);
  });

  it("when the website can't be reached, the hours are still saved, and it says so", async () => {
    world.env.SANITY_API_TOKEN = "";
    const res = await save(GWENDA);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, false);
    assert.equal(res.data.website, "unknown");
    assert.match(res.data.warnings[0], /^Saved in ops, but the website didn't get it/);
    assert.equal((await read()).data.openingHours.days.length, 7);
  });
});

describe("party facts: ops to the party page", () => {
  const FACTS = {
    standing: "80",
    seated: "40",
    included: "No hire fee\nA booth held for you",
    replyWithin: "a day",
  };

  it("has none until they are saved, and the party page says nothing", async () => {
    const res = await read();
    assert.equal(res.status, 200);
    assert.equal(res.data.parties, null);
    assert.deepEqual(await partyPage(), []);
  });

  it("saving some puts just those on the party page", async () => {
    const res = await saveParties({ seated: "40", standing: "", included: "", replyWithin: "a day" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, true);
    assert.equal(res.data.website, "live");
    assert.deepEqual(res.data.warnings, []);
    assert.deepEqual(res.data.parties, {
      standing: null,
      seated: 40,
      included: "",
      replyWithin: "a day",
      updatedAt: res.data.parties.updatedAt,
      updatedBy: res.data.parties.updatedBy,
    });
    assert.deepEqual(await partyPage(), ["Up to 40 seated", "We reply within a day"]);
    assert.deepEqual(world.sanity.drafts("venueDetails"), []);
    assert.equal((await read()).data.website, "live");
  });

  it("published as ops' own document: only the facts filled in, beside the hours", async () => {
    await save(GWENDA);
    await saveParties(FACTS);
    const [doc] = world.sanity.view("published").filter((d) => d._id === "venueDetails");
    assert.deepEqual(doc.parties, {
      standing: 80,
      seated: 40,
      included: "No hire fee\nA booth held for you",
      replyWithin: "a day",
    });
    assert.equal(doc.openingHours.length, 7);
    assert.deepEqual(await partyPage(), [
      "Up to 80 standing, 40 seated",
      "No hire fee",
      "A booth held for you",
      "We reply within a day",
    ]);

    // Saving the hours again keeps the party facts there, and the other way round
    await save(GWENDA.map((day) => (day.day === "sun" ? { ...day, closes: "22:30" } : day)));
    assert.equal((await partyPage()).length, 4);
    await saveParties({ ...FACTS, standing: "" });
    assert.equal(weekRows(await websiteWeek()).at(-1).hours, "4–10:30pm");
  });

  it("saving them all blank takes them off the party page, and ops keeps who did it", async () => {
    await save(GWENDA);
    await saveParties(FACTS);
    const res = await saveParties({ standing: "", seated: "", included: "", replyWithin: "" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.website, "live");
    assert.deepEqual(await partyPage(), []);
    const [doc] = world.sanity.view("published").filter((d) => d._id === "venueDetails");
    assert.equal("parties" in doc, false);
    assert.equal(weekRows(await websiteWeek()).length, 6);
    const again = await read();
    assert.deepEqual(
      { ...again.data.parties, updatedAt: "" },
      { standing: null, seated: null, included: "", replyWithin: "", updatedAt: "", updatedBy: again.data.parties.updatedBy },
    );
    assert.ok(again.data.parties.updatedAt);
  });

  it("facts that don't add up are refused, saying which, and nothing changes", async () => {
    await saveParties(FACTS);
    const res = await saveParties({ ...FACTS, standing: "0", replyWithin: "x".repeat(41) });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /^Standing: Use a number above 0/);
    assert.deepEqual(Object.keys(res.data.problems), ["standing", "replyWithin"]);
    assert.equal((await read()).data.parties.standing, 80);
    assert.equal((await partyPage())[0], "Up to 80 standing, 40 seated");

    const empty = await callApi(world, putParties, { method: "PUT", path: "/api/venue/parties", body: {} });
    assert.equal(empty.status, 400);
  });

  it("with website.auto_update off, they wait on the preview for Update website", async () => {
    world.baserow.insert("Config", { Name: "website.auto_update", Value: "off", Env: "dev", Service: "ops" });
    const res = await saveParties(FACTS);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, false);
    assert.equal(res.data.website, "preview");
    assert.deepEqual(await partyPage("live"), []);
    assert.equal((await partyPage("preview")).length, 4);
  });
});
