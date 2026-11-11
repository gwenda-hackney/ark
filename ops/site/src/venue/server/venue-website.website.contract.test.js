/**
 * What the website relies on from ops' venue document (#240): its venue
 * details module (marketing/web/src/lib/venue-details.js) finds the
 * document with VENUE_DETAILS_QUERY and reads it with readVenueDetails: the
 * week (readWeek, opening-hours.js) and the party facts (readParties and
 * partyFactLines, party-facts.js). The website uses nothing else of ops
 * here, so a change to the document that breaks the website fails in ops'
 * own tests.
 */
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { describe, it } from "vitest";
import { partyFactLines } from "../../../../../marketing/web/src/lib/party-facts.js";
import { VENUE_DETAILS_QUERY, readVenueDetails } from "../../../../../marketing/web/src/lib/venue-details.js";
import { assertValidWeek } from "../hours-model.js";
import { assertValidParties } from "../parties-model.js";
import { venueDocument } from "./venue-website.js";

const WEEK = assertValidWeek([
  { day: "mon", closed: true },
  { day: "tue", opens: "17:00", closes: "22:00" },
  { day: "wed", opens: "17:00", closes: "22:30" },
  { day: "thu", opens: "17:00", closes: "22:30" },
  { day: "fri", opens: "16:00", closes: "23:30" },
  { day: "sat", opens: "16:00", closes: "01:00" },
  { day: "sun", opens: "16:00", closes: "22:00" },
]);

async function websiteReads(docs) {
  return readVenueDetails(await (await evaluate(parse(VENUE_DETAILS_QUERY), { dataset: docs })).get());
}

const websiteWeek = async (docs) => (await websiteReads(docs)).openingHours;
const partyLines = async (docs) => partyFactLines((await websiteReads(docs)).parties).map((line) => line.text);

describe("the venue document, as the website reads it", () => {
  it("gives back every day as ops saved it, Monday first, a late close on its own day", async () => {
    const week = await websiteWeek([venueDocument({ openingHours: WEEK }), { _id: "other", _type: "event" }]);
    assert.deepEqual(week, WEEK);
    assert.deepEqual(week[5], { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
    assert.deepEqual(week[0], { day: "mon", closed: true, opens: "", closes: "" });
  });

  it("hours never saved are no hours: the website says none", async () => {
    assert.equal(await websiteWeek([venueDocument({ openingHours: null })]), null);
    assert.equal(await websiteWeek([]), null);
  });

  it("every day ops accepts is a day the website accepts", async () => {
    // The latest close ops allows, and a close at midnight
    const late = assertValidWeek(
      WEEK.map((day) =>
        day.day === "fri"
          ? { day: "fri", opens: "20:00", closes: "05:59" }
          : day.day === "sun"
            ? { day: "sun", opens: "12:00", closes: "00:00" }
            : day,
      ),
    );
    assert.deepEqual(await websiteWeek([venueDocument({ openingHours: late })]), late);
  });
});

describe("the party facts, as the website reads them", () => {
  it("every fact ops saves is a line on the party page", async () => {
    const parties = assertValidParties({
      standing: "80",
      seated: "40",
      included: "No hire fee\nA booth held for you\nA free round for groups of 20",
      replyWithin: "a day",
    });
    assert.deepEqual(await partyLines([venueDocument({ openingHours: WEEK, parties })]), [
      "Up to 80 standing, 40 seated",
      "No hire fee",
      "A booth held for you",
      "A free round for groups of 20",
      "We reply within a day",
    ]);
    // The week is still the week beside them
    assert.deepEqual(await websiteWeek([venueDocument({ openingHours: WEEK, parties })]), WEEK);
  });

  it("a blank fact is no line; all blank, or never saved, is nothing", async () => {
    const some = assertValidParties({ seated: "40", replyWithin: "two days" });
    assert.deepEqual(await partyLines([venueDocument({ openingHours: WEEK, parties: some })]), [
      "Up to 40 seated",
      "We reply within two days",
    ]);
    const blank = assertValidParties({});
    assert.equal((await websiteReads([venueDocument({ openingHours: WEEK, parties: blank })])).parties, null);
    assert.equal((await websiteReads([venueDocument({ openingHours: WEEK })])).parties, null);
    // Party facts without hours: the hours stay none
    assert.equal(await websiteWeek([venueDocument({ openingHours: null, parties: some })]), null);
  });

  it("the longest facts ops accepts are facts the website shows", async () => {
    const parties = assertValidParties({
      standing: "1",
      included: ["a", "b", "c", "d", "e"].map((x) => x.repeat(55)).join("\n"),
      replyWithin: "x".repeat(40),
    });
    const lines = await partyLines([venueDocument({ openingHours: null, parties })]);
    assert.equal(lines.length, 7);
    assert.equal(lines[0], "Up to 1 standing");
    assert.equal(lines[6], `We reply within ${"x".repeat(40)}`);
  });
});
