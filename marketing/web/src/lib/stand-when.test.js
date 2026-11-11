import { describe, expect, it } from "vitest";
import { STAND_NIGHTS, standWhen, whenOnDay } from "./stand-when.js";

const night = (seriesId, date, extra = {}) => ({
  seriesId,
  date,
  startTime: "17:00",
  endTime: "18:30",
  ...extra,
});
/** How the card puts the days and a night's hours together (StandingCards). */
const line = (days, n) =>
  [days, `${n.startTime}–${n.endTime}`].filter(Boolean).join(", ");

describe("standWhen: a card's line over its coming nights", () => {
  const cocktail = {
    seriesId: "cocktail-hour",
    category: "promotion",
    recurrence: "Every Wednesday, Thursday, Friday and Saturday",
  };
  const pickle = { seriesId: "chez-pickle", category: "popup" };

  it("a deal on set weekdays keeps its pattern: one line, to its last night", () => {
    const nights = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map(
      (date) => night("cocktail-hour", date),
    );
    expect(standWhen("deal", cocktail, nights, "2026-11-11", line)).toEqual({
      timeline: [["2026-11-11", "Wed to Sat, 17:00–18:30"]],
      last: "2026-11-14",
    });
  });

  it("changes the line from the day after a night whose hours were different", () => {
    const nights = [
      night("cocktail-hour", "2026-11-11"),
      night("cocktail-hour", "2026-11-12", { endTime: "19:00" }),
    ];
    expect(
      standWhen("deal", cocktail, nights, "2026-11-11", line).timeline,
    ).toEqual([
      ["2026-11-11", "Wed to Sat, 17:00–18:30"],
      ["2026-11-12", "Wed to Sat, 17:00–19:00"],
    ]);
  });

  it("a pop-up's single night: its date, and it ends that day", () => {
    const nights = [night("chez-pickle", "2026-11-12", { endTime: "22:00" })];
    expect(standWhen("popup", pickle, nights, "2026-11-11", line)).toEqual({
      timeline: [["2026-11-12", "Thu 12 Nov, 17:00–22:00"]],
      last: "2026-11-12",
    });
  });

  it("a pop-up's run drops its 'from' once it has started", () => {
    // Built Wed 11: "Thursdays, from 12 Nov, until 26 Nov" on the page
    const nights = ["2026-11-12", "2026-11-19", "2026-11-26"].map((date) =>
      night("chez-pickle", date),
    );
    expect(standWhen("popup", pickle, nights, "2026-11-11", line)).toEqual({
      timeline: [["2026-11-12", "Thursdays, until 26 Nov, 17:00–18:30"]],
      last: "2026-11-26",
    });
  });

  it("looks only at its own nights from today, and the next few", () => {
    const nights = [
      night("cocktail-hour", "2026-11-07", { endTime: "20:00" }),
      night("someone-else", "2026-11-11", { endTime: "23:00" }),
      ...Array.from({ length: STAND_NIGHTS + 2 }, (_, i) =>
        night("cocktail-hour", `2026-11-${String(11 + i).padStart(2, "0")}`, {
          endTime: i === STAND_NIGHTS + 1 ? "21:00" : "18:30",
        }),
      ),
    ];
    const { timeline, last } = standWhen(
      "deal",
      cocktail,
      nights,
      "2026-11-11",
      line,
    );
    // The change on the tenth night ahead is past the ones it looks at
    expect(timeline).toEqual([["2026-11-11", "Wed to Sat, 17:00–18:30"]]);
    // It still runs to its last night
    expect(last).toBe("2026-11-20");
  });

  it("is empty with no night left", () => {
    expect(
      standWhen(
        "popup",
        pickle,
        [night("chez-pickle", "2026-11-05")],
        "2026-11-11",
        line,
      ),
    ).toEqual({ timeline: [], last: "" });
  });
});

describe("whenOnDay: what the card says on the visitor's day", () => {
  const timeline = [
    ["2026-11-12", "Thursdays, until 26 Nov"],
    ["2026-11-20", "Thu 26 Nov"],
  ];

  it("keeps the line it was built with until its first night", () => {
    expect(whenOnDay(timeline, "2026-11-26", "2026-11-11")).toBeUndefined();
  });

  it("then says the line in force that day", () => {
    expect(whenOnDay(timeline, "2026-11-26", "2026-11-12")).toBe(
      "Thursdays, until 26 Nov",
    );
    expect(whenOnDay(timeline, "2026-11-26", "2026-11-15")).toBe(
      "Thursdays, until 26 Nov",
    );
    expect(whenOnDay(timeline, "2026-11-26", "2026-11-26")).toBe("Thu 26 Nov");
  });

  it("is null once its last night has passed: the card goes", () => {
    expect(whenOnDay(timeline, "2026-11-26", "2026-11-27")).toBeNull();
    expect(whenOnDay([], "", "2026-11-11")).toBeNull();
  });
});
