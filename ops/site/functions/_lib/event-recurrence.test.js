import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandOccurrenceDates,
  expandSeriesOccurrenceDates,
  planOccurrenceMove,
} from "./event-recurrence.js";

const today = "2026-09-22";

describe("expandOccurrenceDates", () => {
  it("includes a future one-off and skips a past one", () => {
    assert.deepEqual(
      expandOccurrenceDates({ startsOn: "2026-10-03", repeatUnit: "none" }, { today }),
      ["2026-10-03"],
    );
    assert.deepEqual(
      expandOccurrenceDates({ startsOn: "2026-09-01", repeatUnit: "none" }, { today }),
      [],
    );
  });

  it("expands a once event to its single start date", () => {
    assert.deepEqual(
      expandOccurrenceDates({ startsOn: "2026-10-18", repeatUnit: "once" }, { today }),
      ["2026-10-18"],
    );
    assert.deepEqual(
      expandSeriesOccurrenceDates({ startsOn: "2026-10-18", repeatUnit: "once" }),
      ["2026-10-18"],
    );
    assert.deepEqual(
      expandOccurrenceDates({ startsOn: "2026-09-01", repeatUnit: "once" }, { today }),
      [],
    );
  });

  it("includes a one-off beyond the 12 week window", () => {
    assert.deepEqual(
      expandOccurrenceDates({ startsOn: "2027-03-01", repeatUnit: "none" }, { today }),
      ["2027-03-01"],
    );
  });

  it("repeats every day until the horizon", () => {
    const dates = expandOccurrenceDates(
      { startsOn: "2026-09-22", repeatUnit: "day", repeatEvery: 1 },
      { today },
    );
    assert.equal(dates[0], "2026-09-22");
    assert.equal(dates.at(-1), "2026-12-15");
    assert.equal(dates.length, 85);
  });

  it("aligns every two days to the start date", () => {
    const dates = expandOccurrenceDates(
      { startsOn: "2026-09-21", repeatUnit: "day", repeatEvery: 2 },
      { today },
    );
    assert.equal(dates[0], "2026-09-23");
    assert.equal(dates[1], "2026-09-25");
  });

  it("repeats every Thursday, including a start on another weekday", () => {
    const dates = expandOccurrenceDates(
      {
        startsOn: "2026-09-23",
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["thu"],
      },
      { today },
    );
    assert.equal(dates[0], "2026-09-24");
    assert.ok(dates.every((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 4));
  });

  it("repeats every two weeks on Thursday", () => {
    const dates = expandOccurrenceDates(
      {
        startsOn: "2026-09-24",
        repeatUnit: "week",
        repeatEvery: 2,
        weekdays: ["thu"],
      },
      { today },
    );
    assert.deepEqual(dates.slice(0, 3), ["2026-09-24", "2026-10-08", "2026-10-22"]);
  });

  it("repeats every week on Monday and Thursday", () => {
    const dates = expandOccurrenceDates(
      {
        startsOn: "2026-09-22",
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["mon", "thu"],
      },
      { today },
    );
    assert.deepEqual(dates.slice(0, 4), [
      "2026-09-24",
      "2026-09-28",
      "2026-10-01",
      "2026-10-05",
    ]);
  });

  it("repeats every month on the 1st and skips a missing day", () => {
    const firsts = expandOccurrenceDates(
      {
        startsOn: "2026-09-01",
        repeatUnit: "month",
        repeatEvery: 1,
        monthDay: 1,
      },
      { today },
    );
    assert.deepEqual(firsts, ["2026-10-01", "2026-11-01", "2026-12-01"]);

    const thirtyFirst = expandOccurrenceDates(
      {
        startsOn: "2026-01-31",
        repeatUnit: "month",
        repeatEvery: 1,
        monthDay: 31,
        endsOn: "2026-05-31",
      },
      { today: "2026-01-01", horizonDays: 200 },
    );
    assert.deepEqual(thirtyFirst, ["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("omits skipped dates from a weekly series", () => {
    const dates = expandOccurrenceDates(
      {
        startsOn: "2026-09-24",
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["thu"],
        skippedDates: ["2026-10-01"],
      },
      { today },
    );
    assert.equal(dates[0], "2026-09-24");
    assert.equal(dates[1], "2026-10-08");
    assert.ok(!dates.includes("2026-10-01"));
  });

  it("keeps extra dates outside the weekday rule", () => {
    const dates = expandOccurrenceDates(
      {
        startsOn: "2026-09-24",
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["thu"],
        extraDates: ["2026-09-26"],
      },
      { today },
    );
    assert.ok(dates.includes("2026-09-24"));
    assert.ok(dates.includes("2026-09-26"));
  });

  it("repeats every two months on the 15th and stops on the end date", () => {
    const dates = expandOccurrenceDates(
      {
        startsOn: "2026-09-15",
        repeatUnit: "month",
        repeatEvery: 2,
        monthDay: 15,
        endsOn: "2026-11-15",
      },
      { today },
    );
    assert.deepEqual(dates, ["2026-11-15"]);
  });
});

describe("expandSeriesOccurrenceDates", () => {
  it("materializes the complete rule through its end date", () => {
    assert.deepEqual(
      expandSeriesOccurrenceDates({
        startsOn: "2026-09-02",
        endsOn: "2026-09-30",
        repeatEvery: 1,
        repeatUnit: "week",
        weekdays: ["wed"],
      }),
      [
        "2026-09-02",
        "2026-09-09",
        "2026-09-16",
        "2026-09-23",
        "2026-09-30",
      ],
    );
  });
});

describe("planOccurrenceMove", () => {
  const weekly = {
    startsOn: "2026-09-24",
    endsOn: "2026-12-31",
    repeatUnit: "week",
    weekdays: ["thu"],
    skippedDates: [],
    extraDates: [],
  };

  it("skips the old rule night and adds an extra when moving off-weekday", () => {
    const plan = planOccurrenceMove(weekly, "2026-10-01", "2026-10-03");
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.skippedDates, ["2026-10-01"]);
    assert.deepEqual(plan.extraDates, ["2026-10-03"]);
    assert.equal(plan.startsOn, "2026-09-24");
  });

  it("moves a once event by changing starts on", () => {
    const plan = planOccurrenceMove(
      { startsOn: "2026-10-18", repeatUnit: "once" },
      "2026-10-18",
      "2026-10-25",
    );
    assert.equal(plan.oneOff, true);
    assert.equal(plan.startsOn, "2026-10-25");
  });

  it("moves a one-off by changing starts on", () => {
    const plan = planOccurrenceMove(
      { startsOn: "2026-10-03", repeatUnit: "none" },
      "2026-10-03",
      "2026-10-10",
    );
    assert.equal(plan.oneOff, true);
    assert.equal(plan.startsOn, "2026-10-10");
  });
});
