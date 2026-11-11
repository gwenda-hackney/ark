import { describe, expect, it } from "vitest";
import {
  categoryOf,
  daysLabel,
  nightsOnly,
  promotionDeals,
  withSeriesCategory,
} from "./promotions.js";

const series = [
  { seriesId: "open-decks", title: "Open Decks", recurrence: "Every Thursday" },
  {
    seriesId: "cocktail-hour",
    title: "Cocktail Hour",
    category: "promotion",
    recurrence: "Every Wednesday and Thursday and Friday and Saturday",
    shortDescription: "20% off all cocktails",
  },
  { seriesId: "chez-pickle", title: "Chez Pickle", category: "popup" },
];

const night = (seriesId, date, extra = {}) => ({
  id: `${seriesId}-${date}`,
  seriesId,
  date,
  title: seriesId,
  ...extra,
});

describe("categoryOf", () => {
  it("is a night unless ops says promotion or pop-up", () => {
    expect(categoryOf({})).toBe("event");
    expect(categoryOf({ category: "event" })).toBe("event");
    expect(categoryOf({ category: "something" })).toBe("event");
    expect(categoryOf({ category: "promotion" })).toBe("promotion");
    expect(categoryOf({ category: "popup" })).toBe("popup");
  });
});

describe("What's on shows nights only", () => {
  const occurrences = withSeriesCategory(
    [
      night("cocktail-hour", "2026-11-11", { category: "promotion" }),
      // Written before ops knew about categories: follows its series.
      night("cocktail-hour", "2026-11-12"),
      night("open-decks", "2026-11-12"),
      night("chez-pickle", "2026-11-12", { category: "popup" }),
      night("one-off-party", "2026-11-14"),
    ],
    series,
  );

  it("gives each night its series' category", () => {
    expect(occurrences.map((row) => row.category)).toEqual([
      "promotion",
      "promotion",
      "event",
      "popup",
      "event",
    ]);
  });

  it("leaves promotions and pop-up kitchens out", () => {
    expect(nightsOnly(occurrences).map((row) => row.id)).toEqual([
      "open-decks-2026-11-12",
      "one-off-party-2026-11-14",
    ]);
  });
});

describe("daysLabel", () => {
  it("shortens a run of days", () => {
    expect(
      daysLabel("Every Wednesday and Thursday and Friday and Saturday"),
    ).toBe("Wed to Sat");
    expect(daysLabel("Every Friday and Saturday and Sunday and Monday")).toBe(
      "Fri to Mon",
    );
  });

  it("names two days, a scatter, one day, and every day", () => {
    expect(daysLabel("Every Friday and Saturday")).toBe("Fri and Sat");
    expect(daysLabel("Every Monday and Wednesday and Friday")).toBe(
      "Mon, Wed and Fri",
    );
    expect(daysLabel("Every Thursday")).toBe("Thursdays");
    expect(daysLabel("Every day")).toBe("Every day");
  });

  it("says nothing when no day is named", () => {
    expect(daysLabel("")).toBe("");
    expect(daysLabel("First of the month")).toBe("");
  });
});

describe("promotionDeals", () => {
  const today = "2026-11-10";
  const occurrences = [
    night("cocktail-hour", "2026-11-07", { startTime: "16:00" }),
    night("cocktail-hour", "2026-11-11", {
      startTime: "17:00",
      endTime: "18:30",
      offer: "20% off",
    }),
    night("cocktail-hour", "2026-11-12", {
      startTime: "17:00",
      endTime: "18:30",
    }),
    night("open-decks", "2026-11-12"),
    night("chez-pickle", "2026-11-12"),
  ];

  it("shows each promotion once, with when it runs and what it is", () => {
    expect(promotionDeals(series, occurrences, today)).toEqual([
      {
        id: "cocktail-hour",
        title: "Cocktail Hour",
        days: "Wed to Sat",
        startTime: "17:00",
        endTime: "18:30",
        time: "",
        // The card line already says the offer.
        offer: "",
        note: "20% off all cocktails",
        photo: "",
        photoPosition: "",
        next: "2026-11-11",
        href: "/whats-on/cocktail-hour",
      },
    ]);
  });

  it("keeps the offer when the card line says something else", () => {
    const [deal] = promotionDeals(
      [{ ...series[1], shortDescription: "Bring a friend" }],
      occurrences,
      today,
    );
    expect(deal).toMatchObject({ offer: "20% off", note: "Bring a friend" });
  });

  it("carries the series' picture, else its next night's", () => {
    const [own] = promotionDeals(
      [{ ...series[1], heroImageUrl: "a.jpg", heroObjectPosition: "50% 20%" }],
      occurrences,
      today,
    );
    expect(own).toMatchObject({ photo: "a.jpg", photoPosition: "50% 20%" });
    const [nights] = promotionDeals(
      [series[1]],
      occurrences.map((row) => ({ ...row, seriesHeroImageUrl: "b.jpg" })),
      today,
    );
    expect(nights.photo).toBe("b.jpg");
  });

  it("drops a promotion with no night left", () => {
    expect(promotionDeals(series, occurrences, "2026-12-01")).toEqual([]);
  });

  it("is empty when nothing is a promotion", () => {
    expect(promotionDeals([series[0]], occurrences, today)).toEqual([]);
    expect(promotionDeals([], [], today)).toEqual([]);
  });
});
