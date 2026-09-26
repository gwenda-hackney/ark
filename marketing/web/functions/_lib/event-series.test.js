import { describe, expect, it } from "vitest";
import {
  buildPublicSchedule,
  buildSeriesDetail,
  buildWhatsOnHome,
  buildWhatsOnStack,
  isRecurringSeries,
  nightPagePaths,
  nightPublicDescription,
  occurrencePathParams,
  parseOccurrenceSlug,
  seriesCardNextLine,
  seriesMarketingCopy,
  seriesRedirects,
  seriesUsesRichDetail,
} from "./event-series.js";

const now = new Date(2026, 8, 22, 15, 0, 0);

function night(partial) {
  return {
    id: partial.id,
    title: partial.title || partial.id,
    date: partial.date,
    seriesId: partial.seriesId || partial.id,
    seriesTitle: partial.seriesTitle || "",
    recurrence: partial.recurrence || "",
    isSpecialEdition: Boolean(partial.isSpecialEdition),
    description: partial.description || "Details.",
    shortDescription: partial.shortDescription || "",
    heroImageUrl: partial.heroImageUrl || null,
    artist: partial.artist || "",
    pageUrl: partial.pageUrl || "",
  };
}

const gwendaSeries = {
  seriesId: "gwenda-nights",
  title: "Gwenda Nights",
  description: "Saturday nights by the water. Live music, vinyl, and guests.",
  shortDescription: "",
  schedule: "manual",
  recurrence: "",
  heroImageUrl: "https://cdn.example/series-default.jpg",
};

const negroniSeries = {
  seriesId: "negroni-night",
  title: "Negroni Night",
  description: "£10 NEGRONI. Tuesday nights, stirred slowly. Chess from 7.",
  shortDescription: "£10 NEGRONI.",
  schedule: "repeating",
  recurrence: "Every Tuesday",
};

const radioSeries = {
  seriesId: "gwenda-radio",
  title: "Gwenda Radio",
  description: "Sunday afternoons.",
  schedule: "repeating",
  recurrence: "Every Sunday",
};

describe("buildWhatsOnStack", () => {
  it("shows one card per series ordered by weekday, Gwenda Nights before Radio", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "radio-2026-09-27",
          seriesId: "gwenda-radio",
          seriesTitle: "Gwenda Radio",
          title: "Gwenda Radio",
          date: "2026-09-27",
          recurrence: "Every Sunday",
        }),
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          description: "Guest DJ copy that must not leak onto the series card.",
        }),
        night({
          id: "negroni-2026-10-06",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-10-06",
          recurrence: "Every Tuesday",
        }),
        night({
          id: "gwenda-nights-2026-10-10",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Vbrave Vinyl Session",
          date: "2026-10-10",
          description: "Vinyl until late.",
          heroImageUrl: "https://cdn.example/vbrave.jpg",
        }),
        night({
          id: "gwenda-nights-2026-10-24",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "The Bohemianauts",
          date: "2026-10-24",
          artist: "Rafa",
          isSpecialEdition: true,
          description: "The Bohemianauts, live at Gwenda.",
          heroImageUrl: "https://cdn.example/bohemianauts.jpg",
        }),
        night({
          id: "gwenda-nights-2026-10-31",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Halloween",
          date: "2026-10-31",
          artist: "Saif",
          isSpecialEdition: true,
          description: "Live band.",
          heroImageUrl: "https://cdn.example/halloween.jpg",
        }),
      ],
      {
        now,
        series: [gwendaSeries, negroniSeries, radioSeries],
      },
    );

    expect(stack.map((row) => row.title)).toEqual([
      "Negroni Night",
      "Gwenda Nights",
      "Gwenda Radio",
    ]);
    expect(stack[0].description).toBe("£10 NEGRONI.");
    expect(stack[1].regular).toBe(false);
    expect(stack[1].schedule).toBe("manual");
    expect(stack[1].description).toBe(
      "Saturday nights by the water. Live music, vinyl, and guests.",
    );
    expect(stack[1].description).not.toBe("Vinyl until late.");
    expect(stack[1].scheduleLabel).toBe("Saturdays");
    expect(stack[1].weekdayRank).toBe(5);
    expect(stack[1].href).toBe("/whats-on/gwenda-nights");
    expect(stack[1].nightCount).toBe(3);
    expect(stack[1].heroImageUrl).toBe("https://cdn.example/vbrave.jpg");
    expect(stack[1].imageCaption).toBe("Hosting");
    expect(stack[1].imageCaptionName).toBe("Vbrave Vinyl Session");
    expect(stack[1].hostName).toBe("Vbrave Vinyl Session");
    expect(stack[1].hostDate).toBe("2026-10-10");
    expect(stack[1].hostThisWeek).toBe(false);
    expect(stack[1].thisWeekName).toBe("");
    expect(stack[1].upcoming).toBe("Next · Sat 24 Oct · The Bohemianauts");
    expect(stack[1].upcomingName).toBe("The Bohemianauts");
    expect(stack[1].upcomingDate).toBe("2026-10-24");
    expect(stack[1].artist).toBe("Rafa");
  });

  it("treats Night/Sessions rename leftovers as the series, not a Next title", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Sessions",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          artist: "Dan",
          isSpecialEdition: true,
        }),
      ],
      {
        now,
        series: [
          {
            ...negroniSeries,
            title: "Negroni Sessions",
          },
        ],
      },
    );
    expect(stack[0].upcoming).toBe("Next · Tues 29 Sep · Special guest · Dan");
    // Dan leads the card ("With Dan"), so no Next line repeats him.
    expect(stack[0].upcomingName).toBe("");
    expect(stack[0].artist).toBe("Dan");
  });

  it("teases the night after the featured next night on manual series", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "gwenda-nights-2026-10-10",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Vbrave Vinyl Session",
          date: "2026-10-10",
        }),
        night({
          id: "gwenda-nights-2026-10-24",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "The Bohemianauts",
          date: "2026-10-24",
          artist: "Rafa",
          isSpecialEdition: true,
        }),
        night({
          id: "gwenda-nights-2026-10-31",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Halloween",
          date: "2026-10-31",
          artist: "Saif",
          isSpecialEdition: true,
        }),
      ],
      { now, series: [gwendaSeries] },
    );
    expect(stack[0].hostName).toBe("Vbrave Vinyl Session");
    expect(stack[0].hostDate).toBe("2026-10-10");
    expect(stack[0].upcoming).toBe("Next · Sat 24 Oct · The Bohemianauts");
    expect(stack[0].upcoming).not.toBe("Vbrave Vinyl Session");
    expect(stack[0].artist).toBe("Rafa");
    expect(stack[0].upcoming).not.toContain("Halloween");
  });

  it("keeps Special guest when the next repeating night has no own title", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          artist: "Maya",
          isSpecialEdition: true,
        }),
      ],
      { now, series: [negroniSeries] },
    );
    expect(stack[0].upcoming).toBe("Next · Tues 29 Sep · Special guest · Maya");
    expect(stack[0].artist).toBe("Maya");
  });

  it("uses the series default image only when the next night has no flyer", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "gwenda-nights-2026-10-10",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Vbrave Vinyl Session",
          date: "2026-10-10",
        }),
      ],
      { now, series: [gwendaSeries] },
    );
    expect(stack[0].heroImageUrl).toBe(
      "https://cdn.example/series-default.jpg",
    );
    expect(stack[0].imageCaptionName).toBe("");
    expect(stack[0].hostName).toBe("Vbrave Vinyl Session");
    expect(stack[0].hostDate).toBe("2026-10-10");
    expect(stack[0].upcomingName).toBe("");
  });

  it("marks a guest artist's own flyer as next at Gwenda", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "gwenda-nights-2026-10-24",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "The Bohemianauts",
          date: "2026-10-24",
          artist: "Rafa",
          isSpecialEdition: true,
          heroImageUrl: "https://cdn.example/bohemianauts.jpg",
        }),
      ],
      { now, series: [gwendaSeries] },
    );
    expect(stack[0].heroImageUrl).toBe("https://cdn.example/bohemianauts.jpg");
    expect(stack[0].imageCaption).toBe("Hosting");
    expect(stack[0].imageCaptionName).toBe("The Bohemianauts");
  });

  it("names the artist when the night title is still the series", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          artist: "Maya",
          isSpecialEdition: true,
          heroImageUrl: "https://cdn.example/maya.jpg",
        }),
      ],
      { now, series: [negroniSeries] },
    );
    expect(stack[0].imageCaption).toBe("");
    expect(stack[0].imageCaptionName).toBe("");
  });

  it("leaves a guest without their own flyer unlabelled", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          artist: "Maya",
          isSpecialEdition: true,
        }),
      ],
      { now, series: [negroniSeries] },
    );
    expect(stack[0].imageCaption).toBe("");
    expect(stack[0].imageCaptionName).toBe("");
  });

  it("adds the scheduled night's short description under the series line", () => {
    const line = "On Sat 10 Oct we are excited to host Vbrave Vinyl.";
    const stack = buildWhatsOnStack(
      [
        night({
          id: "gwenda-nights-2026-10-10",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Vbrave Vinyl Session",
          date: "2026-10-10",
          description:
            "Vbrave on the decks. Vinyl until late by the water, and the rest of the night.",
          shortDescription: line,
          heroImageUrl: "https://cdn.example/vbrave.jpg",
        }),
      ],
      { now, series: [gwendaSeries] },
    );
    expect(stack[0].hostThisWeek).toBe(false);
    expect(stack[0].hostName).toBe("Vbrave Vinyl Session");
    expect(stack[0].description).toBe(`${gwendaSeries.description}\n\n${line}`);
    expect(stack[0].description).not.toContain("Vbrave on the decks");
  });

  it("calls a hosted night this week when it falls in the current week", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "gwenda-nights-2026-09-26",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Vbrave Vinyl Session",
          date: "2026-09-26",
        }),
        night({
          id: "gwenda-nights-2026-10-10",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "The Bohemianauts",
          date: "2026-10-10",
          artist: "Rafa",
          isSpecialEdition: true,
        }),
      ],
      { now, series: [gwendaSeries] },
    );
    expect(stack[0].hostName).toBe("Vbrave Vinyl Session");
    expect(stack[0].hostDate).toBe("2026-09-26");
    expect(stack[0].hostThisWeek).toBe(true);
    expect(stack[0].description).toBe(
      "Saturday nights by the water. Live music, vinyl, and guests.",
    );
    expect(stack[0].upcomingName).toBe("The Bohemianauts");
    expect(stack[0].upcomingDate).toBe("2026-10-10");
  });

  it("skips this week's guest (already on the card) and teases the next", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "negroni-2026-09-22",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-22",
          recurrence: "Every Tuesday",
          artist: "Maya",
          isSpecialEdition: true,
        }),
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          artist: "Dan",
          isSpecialEdition: true,
        }),
      ],
      { now, series: [negroniSeries] },
    );
    expect(stack[0].hostName).toBe("");
    expect(stack[0].guestName).toBe("Maya");
    expect(stack[0].thisWeekName).toBe("");
    expect(stack[0].thisWeekDate).toBe("");
    expect(stack[0].upcomingName).toBe("Special guest · Dan");
    expect(stack[0].upcomingDate).toBe("2026-09-29");
  });
});

describe("isRecurringSeries", () => {
  it("is about auto-schedule, not whether a series exists", () => {
    expect(isRecurringSeries("")).toBe(false);
    expect(isRecurringSeries("Scheduled")).toBe(false);
    expect(isRecurringSeries({ schedule: "manual" })).toBe(false);
    expect(isRecurringSeries("Every Tuesday")).toBe(true);
    expect(isRecurringSeries({ schedule: "repeating" })).toBe(true);
    expect(isRecurringSeries({ schedule: "once" })).toBe(false);
  });
});

describe("a weekly night's own short line", () => {
  const nights = [
    night({
      id: "negroni-night-2026-09-29",
      seriesId: "negroni-night",
      seriesTitle: "Negroni Night",
      title: "Negroni Night",
      date: "2026-09-29",
      recurrence: "Every Tuesday",
      shortDescription: "This week: chess tournament from 7.",
    }),
    night({
      id: "negroni-night-2026-10-06",
      seriesId: "negroni-night",
      seriesTitle: "Negroni Night",
      title: "Negroni Night",
      date: "2026-10-06",
      recurrence: "Every Tuesday",
      shortDescription: "£10 NEGRONI.",
    }),
  ];

  it("follows the series line on the What's on card", () => {
    const [card] = buildWhatsOnStack(nights, { now, series: [negroniSeries] });
    expect(card.description).toBe(
      "£10 NEGRONI.\n\nThis week: chess tournament from 7.",
    );
  });

  it("shows under its date on the series page, not the series line copy", () => {
    const detail = buildSeriesDetail(nights, "negroni-night", {
      now,
      limit: 10,
      series: [negroniSeries],
    });
    expect(detail.upcomingDates.map((row) => row.note)).toEqual([
      "This week: chess tournament from 7.",
      "",
    ]);
  });
});

describe("What's on card offer", () => {
  it("shows the next night's offer when the series has none", () => {
    const [card] = buildWhatsOnStack(
      [
        { ...night({ id: "negroni-night-2026-09-29", seriesId: "negroni-night", date: "2026-09-29", recurrence: "Every Tuesday" }), offer: "£10 Negroni all night" },
        { ...night({ id: "negroni-night-2026-10-06", seriesId: "negroni-night", date: "2026-10-06", recurrence: "Every Tuesday" }), offer: "" },
      ],
      { now, series: [negroniSeries] },
    );
    expect(card.offer).toBe("£10 Negroni all night");
  });
});

describe("buildSeriesDetail", () => {
  it("keeps Gwenda Nights as a series and lists scheduled nights under it", () => {
    const detail = buildSeriesDetail(
      [
        night({
          id: "gwenda-nights-2026-10-10",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Vbrave Vinyl Session",
          date: "2026-10-10",
          description: "Vinyl until late.",
        }),
        night({
          id: "gwenda-nights-2026-10-24",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Bohemianauts",
          date: "2026-10-24",
          description: "The Bohemianauts, live at Gwenda.",
        }),
        night({
          id: "gwenda-nights-2026-10-31",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Halloween",
          date: "2026-10-31",
        }),
      ],
      "gwenda-nights",
      { now, limit: 10, series: [gwendaSeries] },
    );
    expect(detail.title).toBe("Gwenda Nights");
    expect(detail.description).toContain("Saturday nights by the water");
    expect(detail.richDetail).toBe(true);
    expect(detail.nights.map((row) => row.title)).toEqual([
      "Vbrave Vinyl Session",
      "Bohemianauts",
      "Halloween",
    ]);
    expect(detail.nights[0].description).toContain(
      "Saturday nights by the water",
    );
    expect(detail.nights[0].description).not.toBe("Vinyl until late.");
    expect(detail.nights[1].description).toContain(
      "The Bohemianauts, live at Gwenda.",
    );
  });

  it("shows the next night and the nights ahead for repeating series with guest in main", () => {
    const detail = buildSeriesDetail(
      [
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          isSpecialEdition: true,
          artist: "Maya",
        }),
        night({
          id: "negroni-2026-10-06",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-10-06",
          recurrence: "Every Tuesday",
        }),
        night({
          id: "negroni-2026-10-13",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-10-13",
          recurrence: "Every Tuesday",
        }),
      ],
      "negroni-night",
      { now, series: [negroniSeries] },
    );
    expect(detail.richDetail).toBe(false);
    expect(detail.nights).toHaveLength(3);
    expect(detail.featuredGuest.artist).toBe("Maya");
    expect(detail.featuredGuest.imageCaptionName).toBe("");
    expect(detail.upcomingDates).toHaveLength(3);
  });

  it("captions a scheduled night only when the flyer is the guest's", () => {
    const detail = buildSeriesDetail(
      [
        night({
          id: "gwenda-nights-2026-10-10",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Vbrave Vinyl Session",
          date: "2026-10-10",
          heroImageUrl: "https://cdn.example/vbrave.jpg",
        }),
        night({
          id: "gwenda-nights-2026-10-24",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "The Bohemianauts",
          date: "2026-10-24",
          artist: "Rafa",
          isSpecialEdition: true,
          heroImageUrl: "https://cdn.example/bohemianauts.jpg",
        }),
        night({
          id: "gwenda-nights-2026-10-31",
          seriesId: "gwenda-nights",
          seriesTitle: "Gwenda Nights",
          title: "Halloween",
          date: "2026-10-31",
          artist: "Saif",
          isSpecialEdition: true,
        }),
      ],
      "gwenda-nights",
      { now, limit: 10, series: [gwendaSeries] },
    );
    expect(detail.nights[0].imageCaptionName).toBe("");
    expect(detail.nights[0].description).toContain(
      "Saturday nights by the water",
    );
    expect(detail.nights[2].heroImageUrl).toBe(
      "https://cdn.example/series-default.jpg",
    );
  });
});

describe("seriesUsesRichDetail", () => {
  it("lists nights for manual series, not because they fail to be a series", () => {
    expect(seriesUsesRichDetail({ schedule: "manual", recurrence: "" })).toBe(
      true,
    );
    expect(seriesUsesRichDetail({ recurrence: "Scheduled" })).toBe(true);
    expect(seriesUsesRichDetail({ recurrence: "Every Tuesday" })).toBe(false);
  });
});

describe("buildWhatsOnHome", () => {
  it("pages the series list", () => {
    const home = buildWhatsOnHome(
      [
        night({
          id: "halloween-2026-10-31",
          seriesId: "halloween",
          seriesTitle: "Halloween",
          title: "Halloween",
          date: "2026-10-31",
        }),
      ],
      {
        now,
        limit: 6,
        series: [
          { seriesId: "halloween", title: "Halloween", schedule: "manual" },
        ],
      },
    );
    expect(home.nights).toHaveLength(1);
    expect(home.nights[0].title).toBe("Halloween");
  });
});

describe("seriesMarketingCopy", () => {
  it("does not stack a short description on the long copy", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "negroni-2026-09-29",
          seriesId: "negroni-night",
          seriesTitle: "Negroni Night",
          title: "Negroni Night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
        }),
      ],
      {
        now,
        series: [
          {
            ...negroniSeries,
            shortDescription: "£10 Negronis. Open decks from four.",
            description:
              "Tuesday, stirred slowly.\n\nA £10 Negroni, open decks from four, and chess from seven.",
          },
        ],
      },
    );
    expect(stack[0].description).toBe("£10 Negronis. Open decks from four.");
    expect(stack[0].description).not.toContain("stirred slowly");
  });

  it("keeps the lead and drops Hours / The room sections", () => {
    const copy = seriesMarketingCopy(
      [
        "Friday, shaped by who is in.",
        "Guest DJs take the night through disco, house, funk, Afro and Latin. Visiting Italian selectors. Live sets when the night asks for them.",
        "Hours",
        "• Doors 4pm\n• Guests from 7pm\n• Until 1.30am",
        "The room",
        "A later Friday. Built for a name in the booth and a crowd that came to move.",
      ].join("\n\n"),
    );
    expect(copy).toBe(
      [
        "Friday, shaped by who is in.",
        "Guest DJs take the night through disco, house, funk, Afro and Latin. Visiting Italian selectors. Live sets when the night asks for them.",
      ].join("\n\n"),
    );
    expect(copy).not.toContain("Hours");
    expect(copy).not.toContain("Doors");
    expect(copy).not.toContain("The room");
  });
});

describe("nightPublicDescription", () => {
  const series = {
    shortDescription: "Saturday vinyl until late.",
    description: [
      "Saturday nights by the water.",
      "Vinyl DJs, Italian music, jazz, soul, disco.",
      "Hours",
      "Doors 4pm",
      "The room",
      "Late, warm, and a little harder to leave.",
    ].join("\n\n"),
  };

  it("falls back to series marketing copy for thin night stubs", () => {
    const copy = nightPublicDescription(
      { description: "Vinyl until late." },
      series,
    );
    expect(copy).toContain("Saturday nights by the water.");
    expect(copy).toContain("Vinyl DJs");
    expect(copy).not.toContain("Hours");
    expect(copy).not.toBe("Vinyl until late.");
  });

  it("keeps a guest blurb above the series body", () => {
    const copy = nightPublicDescription(
      { description: "The Bohemianauts, live at Gwenda." },
      series,
    );
    expect(copy).toBe(
      "The Bohemianauts, live at Gwenda.\n\nSaturday nights by the water.",
    );
  });

  it("keeps a long night-specific description", () => {
    const own =
      "A Halloween set with live band energy. Costumes welcome, dancing essential, and the bar stays open late.";
    expect(nightPublicDescription({ description: own }, series)).toBe(own);
  });
});

const amoSeries = {
  seriesId: "amo-mas",
  title: "Amo MAS",
  schedule: "once",
  shortDescription: "A night of records.",
  recurrence: "",
};

function radioNights() {
  return [
    "2026-09-27",
    "2026-10-04",
    "2026-10-11",
    "2026-10-18",
    "2026-10-25",
  ].map((date) =>
    night({
      id: `radio-${date}`,
      seriesId: "gwenda-radio",
      seriesTitle: "Gwenda Radio",
      title: "Gwenda Radio",
      date,
      recurrence: "Every Sunday",
    }),
  );
}

describe("one-off cards", () => {
  const amo = night({
    id: "amo-mas-2026-10-18",
    seriesId: "amo-mas",
    seriesTitle: "Amo MAS",
    title: "Amo MAS",
    date: "2026-10-18",
    shortDescription: "A night of records.",
  });

  it("lists the one-off after the residencies with its date", () => {
    const stack = buildWhatsOnStack([...radioNights(), amo], {
      now,
      series: [radioSeries, amoSeries],
    });
    expect(stack.map((row) => row.title)).toEqual(["Gwenda Radio", "Amo MAS"]);
    const radio = stack.find((row) => row.seriesId === "gwenda-radio");
    const card = stack.find((row) => row.seriesId === "amo-mas");
    expect(radio.hostName).toBe("");
    expect(card.scheduleLabel).toBe("Sun 18 Oct");
    expect(card.href).toBe("/whats-on/amo-mas");
  });

  it("puts their page on the diary card when one is set", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          ...amo,
          pageUrl: "https://partiful.com/e/example",
        }),
      ],
      { now, series: [amoSeries] },
    );
    expect(stack[0].pageUrl).toBe("https://partiful.com/e/example");
    const plain = buildWhatsOnStack([amo], { now, series: [amoSeries] });
    expect(plain[0].pageUrl).toBe("");
  });

  it("points the residency at the one-off only when it is the replacement", () => {
    const stack = buildWhatsOnStack([...radioNights(), amo], {
      now,
      series: [radioSeries, { ...amoSeries, replacesSeriesId: "gwenda-radio" }],
    });
    expect(stack.map((row) => row.seriesId)).toEqual([
      "gwenda-radio",
      "amo-mas",
    ]);
    const radio = stack.find((row) => row.seriesId === "gwenda-radio");
    expect(radio.hostName).toBe("Amo MAS");
    expect(radio.hostDate).toBe("2026-10-18");
    expect(radio.hostHref).toBe("/whats-on/amo-mas");
  });

  it("keeps the residency when the one-off date is the next Sunday", () => {
    const stack = buildWhatsOnStack([...radioNights(), amo], {
      now: new Date(2026, 9, 12, 15, 0, 0),
      series: [radioSeries, amoSeries],
    });
    expect(stack.map((row) => row.seriesId)).toEqual([
      "gwenda-radio",
      "amo-mas",
    ]);
    expect(stack[1].scheduleLabel).toBe("Sun 18 Oct");
  });

  it("returns the residency card after the one-off date", () => {
    const stack = buildWhatsOnStack([...radioNights(), amo], {
      now: new Date(2026, 9, 19, 15, 0, 0),
      series: [radioSeries, amoSeries],
    });
    const titles = stack.map((row) => row.title);
    expect(titles).toContain("Gwenda Radio");
    expect(titles).not.toContain("Amo MAS");
    const radio = stack.find((row) => row.seriesId === "gwenda-radio");
    expect(radio.hostName).toBe("");
  });

  it("is the card immediately when that weekday has no residency", () => {
    const stack = buildWhatsOnStack([amo], {
      now,
      series: [amoSeries],
    });
    expect(stack).toHaveLength(1);
    expect(stack[0].title).toBe("Amo MAS");
    expect(stack[0].scheduleLabel).toBe("Sun 18 Oct");
  });

  it("does not mention the one-off on the residency until it is the replacement", () => {
    const detail = buildSeriesDetail([...radioNights(), amo], "gwenda-radio", {
      now,
      series: [radioSeries, amoSeries],
    });
    expect(detail.upcomingDates.some((row) => row.displaced)).toBe(false);
  });

  it("lists the replacement in nights ahead with the return date", () => {
    const detail = buildSeriesDetail([...radioNights(), amo], "gwenda-radio", {
      now,
      series: [radioSeries, { ...amoSeries, replacesSeriesId: "gwenda-radio" }],
    });
    const line = detail.upcomingDates.find((row) => row.displaced);
    expect(line.date).toBe("2026-10-18");
    expect(line.href).toBe("/whats-on/amo-mas");
    expect(line.line).toBe(
      "No Gwenda Radio on Sun 18 Oct. Instead, Amo MAS. A night of records. Don't worry, Gwenda Radio will be back on Sun 25 Oct.",
    );
    const dates = detail.upcomingDates.map((row) => row.date);
    expect(dates).toEqual([
      "2026-09-27",
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
    ]);
  });
});

describe("buildPublicSchedule", () => {
  it("lists every upcoming night in Monday weeks, and drops a replaced residency", () => {
    const amo = night({
      id: "amo-mas-2026-10-18",
      seriesId: "amo-mas",
      seriesTitle: "Amo MAS",
      title: "Amo MAS",
      date: "2026-10-18",
      startTime: "16:00",
      endTime: "20:00",
    });
    const named = night({
      id: "gwenda-nights-2026-09-26",
      seriesId: "gwenda-nights",
      seriesTitle: "Gwenda Nights",
      title: "Vbrave Vinyl Session",
      date: "2026-09-26",
      artist: "Vbrave",
      isSpecialEdition: true,
      startTime: "21:00",
    });
    const past = night({
      id: "radio-2026-09-20",
      seriesId: "gwenda-radio",
      seriesTitle: "Gwenda Radio",
      title: "Gwenda Radio",
      date: "2026-09-20",
      recurrence: "Every Sunday",
    });
    const { weeks } = buildPublicSchedule(
      [...radioNights(), amo, named, past],
      {
        now,
        series: [
          radioSeries,
          gwendaSeries,
          { ...amoSeries, replacesSeriesId: "gwenda-radio" },
        ],
      },
    );

    expect(weeks.map((week) => week.label)).toEqual([
      "This week · 21 Sep–27 Sep",
      "Next week · 28 Sep–4 Oct",
      "5 Oct–11 Oct",
      "12 Oct–18 Oct",
      "19 Oct–25 Oct",
    ]);
    const thisWeek = weeks[0].nights.map((row) => row.date);
    expect(thisWeek).toEqual(["2026-09-26", "2026-09-27"]);
    expect(weeks[0].nights[0]).toMatchObject({
      title: "Vbrave Vinyl Session",
      seriesTitle: "Gwenda Nights",
      artist: "Vbrave",
      href: "/whats-on/gwenda-nights",
    });
    const october = weeks.find((week) => week.id === "2026-10-12");
    expect(october.nights.map((row) => row.title)).toEqual(["Amo MAS"]);
    expect(october.nights[0].href).toBe("/whats-on/amo-mas");
    expect(
      weeks
        .flatMap((week) => week.nights)
        .some((row) => row.date === "2026-09-20"),
    ).toBe(false);
    expect(
      weeks
        .flatMap((week) => week.nights)
        .some(
          (row) => row.seriesId === "gwenda-radio" && row.date === "2026-10-18",
        ),
    ).toBe(false);
  });

  it("keeps both nights when the one-off is not a replacement", () => {
    const amo = night({
      id: "amo-mas-2026-10-18",
      seriesId: "amo-mas",
      seriesTitle: "Amo MAS",
      title: "Amo MAS",
      date: "2026-10-18",
    });
    const { weeks } = buildPublicSchedule([...radioNights(), amo], {
      now,
      series: [radioSeries, amoSeries],
    });
    const thatSunday = weeks
      .flatMap((week) => week.nights)
      .filter((row) => row.date === "2026-10-18")
      .map((row) => row.seriesId)
      .sort();
    expect(thatSunday).toEqual(["amo-mas", "gwenda-radio"]);
  });
});

describe("parseOccurrenceSlug", () => {
  it("splits series and date", () => {
    expect(parseOccurrenceSlug("negroni-night-2026-09-29")).toEqual({
      seriesId: "negroni-night",
      date: "2026-09-29",
    });
  });
});

describe("a series with a new web address", () => {
  const series = [
    { seriesId: "negroni-hour", formerSlugs: ["negroni-night", "jazz"] },
    { seriesId: "jazz", formerSlugs: [] },
  ];

  it("a night page follows its series, not the slug it was made with", () => {
    expect(
      occurrencePathParams({ slug: "negroni-night-2026-09-29", seriesId: "negroni-hour" }),
    ).toEqual({ series: "negroni-hour", date: "2026-09-29" });
    // Older documents without their own seriesId.
    expect(
      occurrencePathParams({ slug: "negroni-night-2026-09-29", seriesId: "negroni-night-2026-09-29" }),
    ).toEqual({ series: "negroni-night", date: "2026-09-29" });
  });

  it("old series addresses redirect, never over a series that has that address now", () => {
    expect(seriesRedirects(series)).toEqual([{ from: "negroni-night", to: "negroni-hour" }]);
  });

  it("old night addresses redirect to the new ones", () => {
    const { pages, redirects } = nightPagePaths(
      [
        { slug: "negroni-night-2026-09-29", seriesId: "negroni-hour", date: "2026-09-29" },
        { slug: "negroni-hour-2026-10-06", seriesId: "negroni-hour", date: "2026-10-06" },
      ],
      series,
    );
    expect(pages.map((page) => `${page.series}/${page.date}`)).toEqual([
      "negroni-hour/2026-09-29",
      "negroni-hour/2026-10-06",
    ]);
    expect(redirects).toEqual([
      { series: "negroni-night", date: "2026-09-29", to: "/whats-on/negroni-hour/2026-09-29" },
      { series: "negroni-night", date: "2026-10-06", to: "/whats-on/negroni-hour/2026-10-06" },
    ]);
  });
});

describe("series with no dates yet", () => {
  const pending = {
    seriesId: "vinyl-club",
    title: "Vinyl Club",
    description: "Records from the bar's own shelves.",
    schedule: "manual",
    datesPending: true,
  };

  it("lists it on What's on with Check back soon for the next date", () => {
    const stack = buildWhatsOnStack([], { now, series: [pending] });
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({
      seriesId: "vinyl-club",
      scheduleLabel: "Dates to be announced",
      datesPending: true,
      date: "",
      href: "/whats-on/vinyl-club",
    });
    expect(seriesCardNextLine(stack[0], "19:00–late")).toBe(
      "Check back soon for the next date",
    );
  });

  it("keeps a weekly series' day before its start date is set", () => {
    const stack = buildWhatsOnStack([], {
      now,
      series: [
        pending,
        {
          seriesId: "jazz",
          title: "Jazz",
          schedule: "repeating",
          recurrence: "Every Wednesday",
          datesPending: true,
        },
      ],
    });
    expect(stack.map((card) => card.seriesId)).toEqual(["jazz", "vinyl-club"]);
    expect(stack[0]).toMatchObject({
      scheduleLabel: "Every Wednesday",
      datesPending: true,
      regular: true,
    });
    expect(seriesCardNextLine(stack[0])).toBe(
      "Check back soon for the next date",
    );
  });

  it("leaves out a series with no dates that is not waiting for any", () => {
    const { datesPending: _flag, ...ended } = pending;
    expect(buildWhatsOnStack([], { now, series: [ended] })).toEqual([]);
    expect(buildSeriesDetail([], "vinyl-club", { now, series: [ended] })).toBe(
      null,
    );
  });

  it("gives it a series page with no nights", () => {
    const detail = buildSeriesDetail([], "vinyl-club", {
      now,
      series: [pending],
    });
    expect(detail).toMatchObject({
      title: "Vinyl Club",
      datesPending: true,
      scheduleLabel: "Dates to be announced",
      description: "Records from the bar's own shelves.",
      nights: [],
      upcomingDates: [],
    });
  });

  it("shows the nights once one is published", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "vinyl-club-2026-10-03",
          seriesId: "vinyl-club",
          seriesTitle: "Vinyl Club",
          title: "Vinyl Club",
          date: "2026-10-03",
        }),
      ],
      { now, series: [pending] },
    );
    expect(stack).toHaveLength(1);
    expect(stack[0].datesPending).toBe(false);
    expect(stack[0].scheduleLabel).toBe("Saturdays");
    expect(stack[0].date).toBe("2026-10-03");
  });
});

describe("seriesCardNextLine", () => {
  it("names the next night with its times", () => {
    expect(
      seriesCardNextLine(
        { schedule: "repeating", date: "2026-09-30" },
        "19:00–late",
      ),
    ).toBe("Next: Wed 30 Sep · 19:00–late");
    expect(seriesCardNextLine({ schedule: "manual", date: "2026-10-03" })).toBe(
      "Next: Sat 3 Oct",
    );
  });

  it("leaves a one-off's date to its label", () => {
    expect(
      seriesCardNextLine({ schedule: "once", date: "2026-10-31" }, "20:00"),
    ).toBe("20:00");
  });
});

describe("What's on card guest", () => {
  it("names the next night's guest with their link", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "negroni-night-2026-09-29",
          seriesId: "negroni-night",
          date: "2026-09-29",
          recurrence: "Every Tuesday",
          artist: "Vbrave",
          pageUrl: "https://www.instagram.com/vbrave/",
        }),
      ],
      { now, series: [negroniSeries] },
    );
    expect(stack[0]).toMatchObject({
      guestName: "Vbrave",
      guestUrl: "https://www.instagram.com/vbrave/",
      pageUrl: "https://www.instagram.com/vbrave/",
    });
  });

  it("keeps a link with no guest as the card's own page link", () => {
    const stack = buildWhatsOnStack(
      [
        night({
          id: "amo-mas-2026-10-18",
          seriesId: "amo-mas",
          date: "2026-10-18",
          pageUrl: "https://partiful.com/e/amo",
        }),
      ],
      {
        now,
        series: [{ seriesId: "amo-mas", title: "Amo más", schedule: "once" }],
      },
    );
    expect(stack[0]).toMatchObject({
      guestName: "",
      guestUrl: "",
      pageUrl: "https://partiful.com/e/amo",
    });
  });
});
