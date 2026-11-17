import { describe, expect, it } from "vitest";
import {
  popupIsBookedOrOn,
  popupKitchens,
  popupWhen,
} from "./popup-kitchen.js";
import { kitchenColourStyle } from "./kitchen-colour.js";

const today = "2026-11-10";

/** A logo as the series in Sanity has it. */
const LOGO = "https://cdn.sanity.io/images/p/production/abc123-900x900.png";

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

/** Where each pop-up's menus are on the food page (lib/menus.js popupMenuLinks). */
const menuLinks = new Map([["chez-pickle", "/kitchen#burgers-and-more"]]);

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
    expect(popupKitchens(series, occurrences, menuLinks, today)).toEqual([
      {
        id: "chez-pickle",
        title: "Chez Pickle",
        when: "Wed to Sat",
        startTime: "17:00",
        endTime: "22:00",
        time: "",
        note: "Smashed burgers, fries and dips.",
        pageUrl: "https://example.com/pickle",
        logo: null,
        colourStyle: "",
        photo: "pickle.png",
        photoPosition: "",
        next: "2026-11-11",
        href: "/whats-on/chez-pickle",
        menuHref: "/kitchen#burgers-and-more",
      },
    ]);
  });

  it("has their logo and their own link from the series in ops (#296)", () => {
    const [kitchen] = popupKitchens(
      [
        {
          ...series[2],
          pageUrl: "https://www.instagram.com/chezpickle",
          logo: { url: LOGO, width: 900, height: 900 },
        },
      ],
      [night("chez-pickle", "2026-11-12")],
      new Map(),
      today,
    );
    expect(kitchen.logo).toEqual({ url: LOGO, width: 900, height: 900 });
    expect(kitchen.pageUrl).toBe("https://www.instagram.com/chezpickle");
  });

  it("has their own colour from ops, for their card's tag (#319)", () => {
    const [kitchen] = popupKitchens(
      [{ ...series[2], accentColor: "#0f4d32" }],
      [night("chez-pickle", "2026-11-12")],
      new Map(),
      today,
    );
    expect(kitchen.colourStyle).toBe(kitchenColourStyle("#0f4d32"));
    expect(kitchen.colourStyle).toContain("--kitchen-fill: #0f4d32");
  });

  it("is empty once the pop-up has no night left", () => {
    expect(popupKitchens(series, occurrences, menuLinks, "2026-12-01")).toEqual(
      [],
    );
  });

  it("is empty when no series is a pop-up", () => {
    expect(
      popupKitchens(series.slice(0, 2), occurrences, menuLinks, today),
    ).toEqual([]);
    expect(popupKitchens([], [], new Map(), today)).toEqual([]);
  });

  it("leaves the line and the picture empty when ops has none", () => {
    const [kitchen] = popupKitchens(
      [{ seriesId: "chez-pickle", title: "Chez Pickle", category: "popup" }],
      [night("chez-pickle", "2026-11-12")],
      new Map(),
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
      new Map(),
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

describe("a pop-up and its menu", () => {
  // Chez Pickle cooks Thu 12 to Sat 14 Nov; Pasta Club is booked for December
  const run = [
    night("chez-pickle", "2026-11-12"),
    night("chez-pickle", "2026-11-13"),
    night("chez-pickle", "2026-11-14"),
    night("pasta-club", "2026-12-03"),
    night("pasta-club", "2026-12-04"),
    night("open-decks", "2026-11-19"),
  ];
  it("counts from when it's booked through its last night, and not the day after", () => {
    // Booked: a night on the website, not started yet
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-01")).toBe(true);
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-12")).toBe(true);
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-14")).toBe(true);
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-15")).toBe(false);
    expect(popupIsBookedOrOn("nobody", run, "2026-11-13")).toBe(false);
  });
});
