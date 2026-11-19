import { describe, expect, it } from "vitest";
import { dayIsOn, whatsOnDays } from "./whats-on-days.js";

const series = [
  {
    seriesId: "karaoke",
    title: "Karaoke",
    schedule: "repeating",
    recurrence: "every week on Thursday",
  },
  {
    seriesId: "cocktail-hour",
    title: "Cocktail Hour",
    category: "promotion",
    recurrence: "every Wednesday and Thursday",
  },
  {
    seriesId: "chez-pickle",
    title: "Chez Pickle",
    category: "popup",
    recurrence: "every Wednesday and Thursday",
  },
  { seriesId: "epic-jam", title: "Epic Jam" },
];
const night = (seriesId, date, extra = {}) => ({
  seriesId,
  date,
  title: series.find((row) => row.seriesId === seriesId).title,
  ...extra,
});

describe("What's on by date", () => {
  it("puts tonight's event, deal and pop-up on one day, the event apart", () => {
    const days = whatsOnDays({
      today: "2026-11-19",
      series,
      occurrences: [
        night("chez-pickle", "2026-11-19"),
        night("karaoke", "2026-11-19"),
        night("cocktail-hour", "2026-11-19"),
      ],
    });
    expect(days).toHaveLength(1);
    const [day] = days;
    expect(day.date).toBe("2026-11-19");
    expect(day.week).toBe("2026-11-16");
    expect(day.events.map((run) => run.nights[0].seriesId)).toEqual([
      "karaoke",
    ]);
    expect(
      day.stands.map((stand) => [stand.kind, stand.night.seriesId]),
    ).toEqual([
      ["deal", "cocktail-hour"],
      ["popup", "chez-pickle"],
    ]);
  });

  it("lists a day with only a deal and a pop-up", () => {
    const [day] = whatsOnDays({
      today: "2026-11-18",
      series,
      occurrences: [
        night("cocktail-hour", "2026-11-18"),
        night("chez-pickle", "2026-11-18"),
      ],
    });
    expect(day.events).toEqual([]);
    expect(day.stands).toHaveLength(2);
  });

  it("gives an event over several days one card, on its first day, kept until its last", () => {
    const days = whatsOnDays({
      today: "2026-11-22",
      series,
      occurrences: [
        night("epic-jam", "2026-11-21"),
        night("epic-jam", "2026-11-22"),
      ],
    });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-11-21", end: "2026-11-22" });
    expect(days[0].events[0].nights).toHaveLength(2);
    expect(dayIsOn(days[0], "2026-11-22")).toBe(true);
    expect(dayIsOn(days[0], "2026-11-23")).toBe(false);
  });

  it("leaves out days that have passed", () => {
    const days = whatsOnDays({
      today: "2026-11-19",
      series,
      occurrences: [
        night("karaoke", "2026-11-12"),
        night("cocktail-hour", "2026-11-18"),
        night("karaoke", "2026-11-26"),
      ],
    });
    expect(days.map((day) => day.date)).toEqual(["2026-11-26"]);
  });

  it("lists deals and pop-ups for the next few weeks only, events as far as they go", () => {
    const days = whatsOnDays({
      today: "2026-11-19",
      series,
      standWeeks: 1,
      occurrences: [
        night("cocktail-hour", "2026-11-25"),
        night("cocktail-hour", "2026-11-26"),
        night("karaoke", "2026-12-31"),
      ],
    });
    expect(
      days.map((day) => [day.date, day.stands.length, day.events.length]),
    ).toEqual([
      ["2026-11-25", 1, 0],
      ["2026-12-31", 0, 1],
    ]);
  });

  it("follows the series' category for nights written before categories", () => {
    const [day] = whatsOnDays({
      today: "2026-11-19",
      series,
      occurrences: [night("cocktail-hour", "2026-11-19", { category: "" })],
    });
    expect(day.stands[0].kind).toBe("deal");
  });

  it("only shows the deals and pop-ups that have a card", () => {
    const [day] = whatsOnDays({
      today: "2026-11-19",
      series,
      stands: new Set(["chez-pickle"]),
      occurrences: [
        night("cocktail-hour", "2026-11-19"),
        night("chez-pickle", "2026-11-19"),
      ],
    });
    expect(day.stands.map((stand) => stand.night.seriesId)).toEqual([
      "chez-pickle",
    ]);
  });
});
