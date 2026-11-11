/**
 * What the website relies on from ops' venue document (#240): its opening
 * hours module (marketing/web/src/lib/opening-hours.js) finds the document
 * with OPENING_HOURS_QUERY and reads it with readWeek. The website uses
 * nothing else of ops here, so a change to the document that breaks the
 * website fails in ops' own tests.
 */
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { describe, it } from "vitest";
import { OPENING_HOURS_QUERY, readWeek } from "../../../../../marketing/web/src/lib/opening-hours.js";
import { assertValidWeek } from "../hours-model.js";
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
  return readWeek(await (await evaluate(parse(OPENING_HOURS_QUERY), { dataset: docs })).get());
}

describe("the venue document, as the website reads it", () => {
  it("gives back every day as ops saved it, Monday first, a late close on its own day", async () => {
    const week = await websiteReads([venueDocument({ openingHours: WEEK }), { _id: "other", _type: "event" }]);
    assert.deepEqual(week, WEEK);
    assert.deepEqual(week[5], { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
    assert.deepEqual(week[0], { day: "mon", closed: true, opens: "", closes: "" });
  });

  it("hours never saved are no hours: the website says none", async () => {
    assert.equal(await websiteReads([venueDocument({ openingHours: null })]), null);
    assert.equal(await websiteReads([]), null);
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
    assert.deepEqual(await websiteReads([venueDocument({ openingHours: late })]), late);
  });
});
