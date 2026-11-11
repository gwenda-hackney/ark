import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DAYS,
  assertValidWeek,
  closesAfterMidnight,
  dayHoursLabel,
  dayProblem,
  openingDay,
  timeLabel,
  validateWeek,
} from "./hours-model.js";

/** The venue's hours from its Google listing (#240). */
const GWENDA_WEEK = [
  { day: "mon", closed: true },
  { day: "tue", opens: "17:00", closes: "22:00" },
  { day: "wed", opens: "17:00", closes: "22:30" },
  { day: "thu", opens: "17:00", closes: "22:30" },
  { day: "fri", opens: "16:00", closes: "23:30" },
  { day: "sat", opens: "16:00", closes: "01:00" },
  { day: "sun", opens: "16:00", closes: "22:00" },
];

const open = (opens, closes, day = "tue") => openingDay({ day, opens, closes });

describe("opening hours: a day", () => {
  it("a closed day keeps no times", () => {
    assert.deepEqual(openingDay({ day: "Mon", closed: true, opens: "17:00", closes: "22:00" }), {
      day: "mon",
      closed: true,
      opens: "",
      closes: "",
    });
  });

  it("closes after it opens, or after midnight before 6am", () => {
    assert.equal(dayProblem(open("17:00", "22:00")), "");
    assert.equal(dayProblem(open("16:00", "01:00")), "");
    assert.equal(dayProblem(open("18:00", "00:00")), "");
    assert.equal(dayProblem(open("20:00", "05:59")), "");
    assert.match(dayProblem(open("17:00", "16:00")), /closes before it opens/);
    assert.match(dayProblem(open("20:00", "06:00")), /before 6am/);
    assert.match(dayProblem(open("17:00", "17:00")), /closes when it opens/);
  });

  it("needs both times on an open day, written as times", () => {
    assert.match(dayProblem(open("17:00", "")), /both times/);
    assert.match(dayProblem(open("", "")), /both times/);
    assert.match(dayProblem(open("5pm", "22:00")), /like 5pm or 17:00/);
    assert.match(dayProblem(open("17:00", "24:00")), /like 5pm or 17:00/);
  });

  it("knows a close after midnight", () => {
    assert.equal(closesAfterMidnight(open("16:00", "01:00")), true);
    assert.equal(closesAfterMidnight(open("17:00", "22:00")), false);
    assert.equal(closesAfterMidnight(openingDay({ day: "mon", closed: true })), false);
  });
});

describe("opening hours: the week", () => {
  it("takes the days in any order and gives them back Monday first", () => {
    const { days, problems } = validateWeek([...GWENDA_WEEK].reverse());
    assert.deepEqual(problems, {});
    assert.deepEqual(
      days.map((day) => day.day),
      DAYS,
    );
    assert.deepEqual(days[5], { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
  });

  it("names each day that's wrong, and a missing one", () => {
    const week = GWENDA_WEEK.filter((day) => day.day !== "sun").map((day) =>
      day.day === "tue" ? { ...day, closes: "16:00" } : day,
    );
    const { problems } = validateWeek(week);
    assert.deepEqual(Object.keys(problems), ["tue", "sun"]);
    assert.throws(() => assertValidWeek(week), (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /^Tuesday: It closes before it opens\..* Sunday: Missing from the week\.$/);
      assert.deepEqual(Object.keys(error.problems), ["tue", "sun"]);
      return true;
    });
  });

  it("refuses a day that isn't one, or one given twice", () => {
    assert.throws(() => validateWeek([...GWENDA_WEEK, { day: "funday", closed: true }]), /not a day of the week/);
    assert.throws(() => validateWeek([...GWENDA_WEEK, GWENDA_WEEK[1]]), /Tuesday is in the week twice/);
  });
});

describe("opening hours in words, for staff", () => {
  it("writes times the British casual way", () => {
    assert.equal(timeLabel("17:00"), "5pm");
    assert.equal(timeLabel("22:30"), "10:30pm");
    assert.equal(timeLabel("01:00"), "1am");
    assert.equal(timeLabel("00:00"), "midnight");
    assert.equal(timeLabel("12:00"), "midday");
  });

  it("says which morning a late close falls on", () => {
    const days = assertValidWeek(GWENDA_WEEK);
    assert.deepEqual(days.map(dayHoursLabel), [
      "Closed",
      "5pm – 10pm",
      "5pm – 10:30pm",
      "5pm – 10:30pm",
      "4pm – 11:30pm",
      "4pm – 1am (Sunday morning)",
      "4pm – 10pm",
    ]);
    assert.equal(dayHoursLabel(open("18:00", "00:00")), "6pm – midnight");
    assert.equal(dayHoursLabel(open("20:00", "02:00", "sun")), "8pm – 2am (Monday morning)");
  });
});
