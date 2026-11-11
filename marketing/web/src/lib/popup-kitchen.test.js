import { describe, expect, it } from "vitest";
import { popupKitchens, popupMenuHref, popupWhen } from "./popup-kitchen.js";

const today = "2026-11-10";

const series = [
  { seriesId: "open-decks", title: "Open Decks", recurrence: "Every Thursday" },
  { seriesId: "cocktail-hour", title: "Cocktail Hour", category: "promotion" },
  {
    seriesId: "chez-pickle",
    title: "Chez Pickle",
    category: "popup",
    schedule: "repeating",
    recurrence: "Every Wednesday and Thursday and Friday and Saturday",
    shortDescription: "Smashed burgers, fries and dips.",
    heroImageUrl: "pickle.png",
  },
];

const night = (seriesId, date, extra = {}) => ({
  id: `${seriesId}-${date}`,
  seriesId,
  date,
  title: seriesId,
  ...extra,
});

const chapters = [
  {
    id: "burgers-and-more",
    title: "Chez Pickle",
    popupSeriesId: "chez-pickle",
    items: [],
    subsections: [{ id: "burgers", title: "Burgers", items: [{ id: "og" }] }],
  },
  { id: "snacks", title: "Snacks", items: [{ id: "olives" }] },
];

describe("popupKitchens", () => {
  const occurrences = [
    night("chez-pickle", "2026-11-05", { startTime: "12:00" }),
    night("chez-pickle", "2026-11-11", {
      startTime: "17:00",
      endTime: "22:00",
      pageUrl: "https://example.com/pickle",
    }),
    night("chez-pickle", "2026-11-12", { startTime: "17:00" }),
    night("open-decks", "2026-11-12"),
    night("cocktail-hour", "2026-11-11"),
  ];

  it("shows who's in the kitchen, when, their page and the way to their menu", () => {
    expect(popupKitchens(series, occurrences, chapters, today)).toEqual([
      {
        id: "chez-pickle",
        title: "Chez Pickle",
        when: "Wed to Sat",
        startTime: "17:00",
        endTime: "22:00",
        time: "",
        note: "Smashed burgers, fries and dips.",
        pageUrl: "https://example.com/pickle",
        photo: "pickle.png",
        photoPosition: "",
        next: "2026-11-11",
        href: "/whats-on/chez-pickle",
        menuHref: "/kitchen#burgers-and-more",
      },
    ]);
  });

  it("is empty once the pop-up has no night left", () => {
    expect(popupKitchens(series, occurrences, chapters, "2026-12-01")).toEqual(
      [],
    );
  });

  it("is empty when no series is a pop-up", () => {
    expect(
      popupKitchens(series.slice(0, 2), occurrences, chapters, today),
    ).toEqual([]);
    expect(popupKitchens([], [], [], today)).toEqual([]);
  });

  it("leaves the line and the picture empty when ops has none", () => {
    const [kitchen] = popupKitchens(
      [{ seriesId: "chez-pickle", title: "Chez Pickle", category: "popup" }],
      [night("chez-pickle", "2026-11-12")],
      [],
      today,
    );
    expect(kitchen).toMatchObject({
      when: "Thu 12 Nov",
      note: "",
      pageUrl: "",
      photo: "",
      href: "/whats-on/chez-pickle",
      menuHref: "/kitchen",
    });
  });

  it("escapes the series' id in the way to its page", () => {
    const [kitchen] = popupKitchens(
      [{ seriesId: "chez pickle", title: "Chez Pickle", category: "popup" }],
      [night("chez pickle", "2026-11-12")],
      [],
      today,
    );
    expect(kitchen.href).toBe("/whats-on/chez%20pickle");
  });
});

describe("popupWhen", () => {
  const nights = (...dates) => dates.map((date) => night("pop", date));

  it("names the day of a single night", () => {
    expect(popupWhen({}, nights("2026-11-12"), today)).toBe("Thu 12 Nov");
  });

  it("gives the days of a rolling run, and when it starts", () => {
    const row = {
      schedule: "repeating",
      recurrence: "Every Friday and Saturday",
    };
    expect(popupWhen(row, nights("2026-11-06", "2026-11-13"), today)).toBe(
      "Fri and Sat",
    );
    expect(popupWhen(row, nights("2026-11-13", "2026-11-14"), today)).toBe(
      "Fri and Sat, from 13 Nov",
    );
  });

  it("says when a fixed run ends, reading the days off its nights", () => {
    expect(
      popupWhen(
        { schedule: "manual" },
        nights("2026-11-06", "2026-11-13", "2026-11-14", "2026-11-21"),
        today,
      ),
    ).toBe("Fri and Sat, until 21 Nov");
  });

  it("is empty when every night has passed", () => {
    expect(popupWhen({}, nights("2026-11-01"), today)).toBe("");
  });
});

describe("popupMenuHref", () => {
  it("goes to the chapter that points at the series", () => {
    expect(popupMenuHref("chez-pickle", chapters)).toBe(
      "/kitchen#burgers-and-more",
    );
  });

  it("goes to the food page when no chapter does, or it's empty", () => {
    expect(popupMenuHref("someone-else", chapters)).toBe("/kitchen");
    expect(
      popupMenuHref("chez-pickle", [
        { id: "empty", popupSeriesId: "chez-pickle", items: [] },
      ]),
    ).toBe("/kitchen");
  });
});
