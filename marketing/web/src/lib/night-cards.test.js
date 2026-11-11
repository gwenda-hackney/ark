import { describe, expect, it } from "vitest";
import {
  flyerShape,
  frameRatio,
  nightDay,
  nightLabel,
  nightRuns,
  nightsToShow,
  nightWeeks,
  runDay,
  runTimes,
  weekLabel,
} from "./night-cards.js";

describe("nightDay", () => {
  it("splits a date for the date sticker", () => {
    expect(nightDay("2026-11-10")).toEqual({
      weekday: "Tue",
      day: 10,
      month: "Nov",
    });
  });
});

describe("nightLabel", () => {
  it("names today and tomorrow, and calls the rest next up", () => {
    expect(nightLabel("2026-11-10", "2026-11-10")).toBe("Tonight");
    expect(nightLabel("2026-11-11", "2026-11-10")).toBe("Tomorrow");
    expect(nightLabel("2026-11-12", "2026-11-10")).toBe("Next up");
  });
});

describe("nightsToShow", () => {
  const dates = ["2026-11-10", "2026-11-12", "2026-11-13", "2026-11-15"];

  it("shows the nights in order, as many as fit", () => {
    expect(nightsToShow(dates, "2026-11-10", 3)).toEqual([0, 1, 2]);
  });

  it("shows every night to come when there is no limit", () => {
    expect(nightsToShow(dates, "2026-11-10")).toEqual([0, 1, 2, 3]);
  });

  it("drops a night that passed since the site was built", () => {
    expect(nightsToShow(dates, "2026-11-11", 3)).toEqual([1, 2, 3]);
  });

  it("shows nothing when every night has passed", () => {
    expect(nightsToShow(dates, "2026-12-01")).toEqual([]);
  });
});

describe("flyerShape", () => {
  const cdn = "https://cdn.sanity.io/images/p/production/abc123";

  it("is the flyer's own shape, from the size in its address", () => {
    expect(flyerShape(`${cdn}-1080x1528.jpg?w=640#whole`)).toBe("1080 / 1528");
    expect(flyerShape(`${cdn}-1080x1350.png`)).toBe("1080 / 1350");
  });

  it("leaves a landscape or very thin image to the card's own frame", () => {
    expect(flyerShape(`${cdn}-1600x1000.jpg`)).toBe("");
    expect(flyerShape(`${cdn}-1080x1920.jpg`)).toBe("");
  });

  it("is blank for an address with no size in it", () => {
    expect(flyerShape("https://example.com/flyer.jpg")).toBe("");
    expect(flyerShape("")).toBe("");
  });
});

describe("frameRatio", () => {
  const cdn = "https://cdn.sanity.io/images/p/production/abc123";

  it("is a whole flyer's own width for its height", () => {
    expect(frameRatio(`${cdn}-1132x1600.jpg#whole`, true)).toBe(0.7075);
    expect(frameRatio(`${cdn}-1920x1920.jpg#whole`, true)).toBe(1);
  });

  it("is 4:5 for a photo that's cropped to fit, and for no photo", () => {
    expect(frameRatio(`${cdn}-1132x1600.jpg`, false)).toBe(0.8);
    expect(frameRatio("", false)).toBe(0.8);
  });

  it("is 4:5 for a flyer too wide or too thin for a card", () => {
    expect(frameRatio(`${cdn}-1448x1086.png#whole`, true)).toBe(0.8);
    expect(frameRatio(`${cdn}-1080x1920.jpg#whole`, true)).toBe(0.8);
  });
});

describe("weekLabel", () => {
  it("names this week and the next, and dates the rest by their Monday", () => {
    // Today is Wednesday 11 Nov; its week began on Monday the 9th.
    expect(weekLabel("2026-11-09", "2026-11-11")).toBe("This week");
    expect(weekLabel("2026-11-16", "2026-11-11")).toBe("Next week");
    expect(weekLabel("2026-11-23", "2026-11-11")).toBe("Week of 23 Nov");
  });
});

describe("nightWeeks", () => {
  it("groups the nights by week, Monday to Sunday, mid-week", () => {
    const dates = [
      "2026-11-11", // Wed
      "2026-11-15", // Sun, the same week
      "2026-11-16", // Mon, the next
      "2026-11-22", // Sun
      "2026-11-24", // Tue
    ];
    expect(nightWeeks(dates, "2026-11-11")).toEqual([
      { start: "2026-11-09", label: "This week", indexes: [0, 1] },
      { start: "2026-11-16", label: "Next week", indexes: [2, 3] },
      { start: "2026-11-23", label: "Week of 23 Nov", indexes: [4] },
    ]);
  });

  it("on a Sunday, this week is only tonight", () => {
    const dates = ["2026-11-15", "2026-11-16", "2026-11-20"];
    expect(nightWeeks(dates, "2026-11-15")).toEqual([
      { start: "2026-11-09", label: "This week", indexes: [0] },
      { start: "2026-11-16", label: "Next week", indexes: [1, 2] },
    ]);
  });

  it("carries on over the new year", () => {
    const dates = ["2026-12-31", "2027-01-02", "2027-01-04", "2027-01-13"];
    expect(nightWeeks(dates, "2026-12-30")).toEqual([
      { start: "2026-12-28", label: "This week", indexes: [0, 1] },
      { start: "2027-01-04", label: "Next week", indexes: [2] },
      { start: "2027-01-11", label: "Week of 11 Jan", indexes: [3] },
    ]);
  });

  it("skips a week with nothing on, and one whose nights have passed", () => {
    const dates = ["2026-11-10", "2026-11-11", "2026-11-25"];
    // Nothing next week: no heading for it.
    expect(nightWeeks(dates, "2026-11-11")).toEqual([
      { start: "2026-11-09", label: "This week", indexes: [1] },
      { start: "2026-11-23", label: "Week of 23 Nov", indexes: [2] },
    ]);
    // A week later the first week has gone altogether.
    expect(nightWeeks(dates, "2026-11-17")).toEqual([
      { start: "2026-11-23", label: "Next week", indexes: [2] },
    ]);
    expect(nightWeeks([], "2026-11-17")).toEqual([]);
  });
});

describe("nightRuns", () => {
  const series = [
    { seriesId: "epic-jam", schedule: "manual", recurrence: "" },
    {
      seriesId: "karaoke",
      schedule: "repeating",
      recurrence: "Every Thursday",
    },
    { seriesId: "daily", schedule: "repeating", recurrence: "Every day" },
    { seriesId: "match-day", schedule: "manual", recurrence: "" },
  ];

  it("joins a one-off's nights on days in a row into one run", () => {
    const nights = [
      { date: "2026-11-19", seriesId: "karaoke" },
      { date: "2026-11-21", seriesId: "epic-jam" },
      { date: "2026-11-22", seriesId: "epic-jam" },
      { date: "2026-11-26", seriesId: "karaoke" },
    ];
    expect(nightRuns(nights, series)).toEqual([
      { start: "2026-11-19", end: "2026-11-19", indexes: [0] },
      { start: "2026-11-21", end: "2026-11-22", indexes: [1, 2] },
      { start: "2026-11-26", end: "2026-11-26", indexes: [3] },
    ]);
  });

  it("keeps a run going past two days, with other nights in between", () => {
    const nights = [
      { date: "2026-11-30", seriesId: "epic-jam" },
      { date: "2026-12-01", seriesId: "karaoke" },
      { date: "2026-12-01", seriesId: "epic-jam" },
      { date: "2026-12-02", seriesId: "epic-jam" },
    ];
    expect(nightRuns(nights, series)).toEqual([
      { start: "2026-11-30", end: "2026-12-02", indexes: [0, 2, 3] },
      { start: "2026-12-01", end: "2026-12-01", indexes: [1] },
    ]);
  });

  it("never joins a repeating series, even on days in a row", () => {
    const nights = [
      { date: "2026-11-11", seriesId: "daily" },
      { date: "2026-11-12", seriesId: "daily" },
    ];
    expect(nightRuns(nights, series).map((run) => run.indexes)).toEqual([
      [0],
      [1],
    ]);
  });

  it("leaves a one-off's nights apart when there is a day between them", () => {
    const nights = [
      { date: "2026-11-14", seriesId: "match-day" },
      { date: "2026-11-16", seriesId: "match-day" },
      { date: "2026-11-17", seriesId: "match-day" },
    ];
    expect(nightRuns(nights, series)).toEqual([
      { start: "2026-11-14", end: "2026-11-14", indexes: [0] },
      { start: "2026-11-16", end: "2026-11-17", indexes: [1, 2] },
    ]);
  });

  it("leaves nights with no series, or one it doesn't know, alone", () => {
    const nights = [
      { date: "2026-11-14" },
      { date: "2026-11-15" },
      { date: "2026-11-15", seriesId: "gone" },
      { date: "2026-11-16", seriesId: "gone" },
    ];
    expect(nightRuns(nights, series)).toHaveLength(4);
  });
});

describe("a run over several days", () => {
  // Sat 21 and Sun 22 Nov, one card
  const dates = ["2026-11-19", "2026-11-21", "2026-11-24"];
  const ends = [undefined, "2026-11-22", undefined];

  it("shows until its last day is over", () => {
    expect(nightsToShow(dates, "2026-11-20", Infinity, ends)).toEqual([1, 2]);
    expect(nightsToShow(dates, "2026-11-21", Infinity, ends)).toEqual([1, 2]);
    expect(nightsToShow(dates, "2026-11-22", Infinity, ends)).toEqual([1, 2]);
    expect(nightsToShow(dates, "2026-11-23", Infinity, ends)).toEqual([2]);
  });

  it("counts as one of the nights that fit", () => {
    expect(nightsToShow(dates, "2026-11-19", 2, ends)).toEqual([0, 1]);
  });

  it("is tonight on each of its days", () => {
    expect(nightLabel("2026-11-21", "2026-11-19", "2026-11-22")).toBe(
      "Next up",
    );
    expect(nightLabel("2026-11-21", "2026-11-20", "2026-11-22")).toBe(
      "Tomorrow",
    );
    expect(nightLabel("2026-11-21", "2026-11-21", "2026-11-22")).toBe(
      "Tonight",
    );
    expect(nightLabel("2026-11-21", "2026-11-22", "2026-11-22")).toBe(
      "Tonight",
    );
  });

  it("stays in the week of its first day, which is on now once that's past", () => {
    // Sun 22 into Mon 23; today is the Monday
    expect(
      nightWeeks(["2026-11-22", "2026-11-24"], "2026-11-23", ["2026-11-23"]),
    ).toEqual([
      { start: "2026-11-16", label: "On now", indexes: [0] },
      { start: "2026-11-23", label: "This week", indexes: [1] },
    ]);
  });
});

describe("runDay", () => {
  it("is one day's sticker for one day", () => {
    expect(runDay("2026-11-21")).toEqual({
      weekday: "Sat",
      day: "21",
      month: "Nov",
    });
  });

  it("gives the first and last day of a run", () => {
    expect(runDay("2026-11-21", "2026-11-22")).toEqual({
      weekday: "Sat–Sun",
      day: "21–22",
      month: "Nov",
    });
    expect(runDay("2026-11-20", "2026-11-22").weekday).toBe("Fri–Sun");
  });

  it("names both months over a month end", () => {
    expect(runDay("2026-11-30", "2026-12-01")).toEqual({
      weekday: "Mon–Tue",
      day: "30–1",
      month: "Nov–Dec",
    });
  });
});

describe("runTimes", () => {
  it("gives the hours day by day when they differ", () => {
    expect(
      runTimes([
        { date: "2026-11-21", span: "12–8pm" },
        { date: "2026-11-22", span: "1–6pm" },
      ]),
    ).toEqual(["Sat 12–8pm", "Sun 1–6pm"]);
  });

  it("gives them once when every day is the same, or there is one day", () => {
    expect(
      runTimes([
        { date: "2026-11-21", span: "12–8pm" },
        { date: "2026-11-22", span: "12–8pm" },
      ]),
    ).toEqual(["12–8pm"]);
    expect(runTimes([{ date: "2026-11-21", span: "7–10pm" }])).toEqual([
      "7–10pm",
    ]);
  });

  it("leaves out a day with no hours", () => {
    expect(
      runTimes([
        { date: "2026-11-21", span: "" },
        { date: "2026-11-22", span: "1–6pm" },
      ]),
    ).toEqual(["Sun 1–6pm"]);
    expect(runTimes([{ date: "2026-11-21", span: "" }])).toEqual([]);
  });
});
