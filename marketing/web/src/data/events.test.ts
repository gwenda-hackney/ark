import { describe, expect, it } from "vitest";
import {
  buildEventsPageModel,
  buildEventsStack,
  eventDescriptionParagraphs,
  eventWeekdayRank,
  eventWeekStart,
  formatEventDate,
  formatEventDiaryDate,
  formatEventRecurrence,
  formatEventWeek,
  formatEventWhen,
  formatPublicTime,
  getUpcomingEvents,
  groupEventSeries,
} from "./events";
import type { Event } from "../types/events";

const sampleEvents: Event[] = [
  {
    id: "grand-opening",
    title: "Grand Opening",
    date: "2026-08-01",
    description: "Details to follow.",
  },
  {
    id: "past-night",
    title: "Past Night",
    date: "2020-01-01",
    description: "Already happened.",
  },
  {
    id: "winter-supper",
    title: "Winter Supper",
    date: "2026-12-01",
    description: "Seasonal menu.",
  },
];

describe("formatEventDate", () => {
  it("formats ISO dates in en-GB long form", () => {
    expect(formatEventDate("2026-08-01")).toBe("Saturday, 1 August 2026");
  });
});

describe("eventDescriptionParagraphs", () => {
  it("keeps intentional paragraph breaks for event cards", () => {
    expect(
      eventDescriptionParagraphs(
        "Set the scene.\n\nShare the details.\n\nClose with the invitation.",
      ),
    ).toEqual([
      "Set the scene.",
      "Share the details.",
      "Close with the invitation.",
    ]);
  });

  it("puts extra sets in the description, formatted", () => {
    expect(
      eventDescriptionParagraphs(
        "Two sets of jazz.",
        "19:00–20:30 | 21:00–22:30",
      ),
    ).toEqual(["Two sets of jazz.", "7–8:30pm and 9–10:30pm"]);
  });

  it("formats clock ranges already written in the description", () => {
    expect(
      eventDescriptionParagraphs("Sets run 19:00–20:30 | 21:00–22:30."),
    ).toEqual(["Sets run 7–8:30pm and 9–10:30pm."]);
  });
});

describe("formatEventDiaryDate", () => {
  const now = new Date(2026, 8, 22, 15, 0, 0);

  it("uses today, tomorrow, and next weekday before a short date", () => {
    expect(formatEventDiaryDate("2026-09-22", now)).toBe("Today");
    expect(formatEventDiaryDate("2026-09-23", now)).toBe("Tomorrow");
    expect(formatEventDiaryDate("2026-09-24", now)).toBe("Next Thur");
    expect(formatEventDiaryDate("2026-09-29", now)).toBe("Next Tues");
    expect(formatEventDiaryDate("2026-10-06", now)).toBe("Tues 6 Oct");
    expect(formatEventDiaryDate("2026-10-10", now)).toBe("Sat 10 Oct");
    expect(formatEventDiaryDate("2027-01-06", now)).toBe("Wed 6 Jan 2027");
  });
});

describe("formatEventRecurrence", () => {
  it("shortens weekly recurrence copy", () => {
    expect(formatEventRecurrence("Every week on Wednesday")).toBe(
      "Every Wednesday",
    );
  });
});

describe("event week labels", () => {
  it("uses Monday as the beginning of the week", () => {
    expect(eventWeekStart("2026-09-23")).toBe("2026-09-21");
    expect(eventWeekStart("2026-09-27")).toBe("2026-09-21");
    expect(eventWeekStart("2026-09-28")).toBe("2026-09-28");
    expect(formatEventWeek("2026-09-23")).toBe("Week beginning 21 September");
  });
});

describe("formatPublicTime", () => {
  it("turns machine sets into a spoken time", () => {
    expect(formatPublicTime("19:00–20:30 | 21:00–22:30")).toBe(
      "7–8:30pm and 9–10:30pm",
    );
  });

  it("keeps the period when a range crosses noon", () => {
    expect(formatPublicTime("11:30-13:00")).toBe("11:30am–1pm");
  });

  it("leaves wording that is not a clock time", () => {
    expect(formatPublicTime("Doors at dusk")).toBe("Doors at dusk");
  });
});

describe("formatEventWhen", () => {
  it("includes door times when provided", () => {
    expect(formatEventWhen("2026-08-15", "17:00", "23:00")).toBe(
      "Saturday, 15 August 2026, 5–11pm",
    );
  });

  it("uses start and end, not a list of sets", () => {
    expect(
      formatEventWhen(
        "2026-08-15",
        "19:00",
        "22:30",
        "19:00–20:30 | 21:00–22:30",
      ),
    ).toBe("Saturday, 15 August 2026, 7–10:30pm");
  });
});

describe("getUpcomingEvents", () => {
  it("drops past events and sorts by date", () => {
    const now = new Date("2026-07-01T12:00:00");
    expect(getUpcomingEvents(sampleEvents, now)).toEqual([
      sampleEvents[0],
      sampleEvents[2],
    ]);
  });

  it("includes events happening today", () => {
    const now = new Date("2026-08-01T18:00:00");
    expect(
      getUpcomingEvents(sampleEvents, now).map((event) => event.id),
    ).toEqual(["grand-opening", "winter-supper"]);
  });
});

describe("buildEventsPageModel", () => {
  it("separates regular nights and keeps guest editions inside the residency", () => {
    const events: Event[] = [
      {
        id: "jazz-2026-09-23",
        seriesId: "jazz",
        recurrence: "Every Wednesday",
        title: "Jazz night",
        date: "2026-09-23",
        description: "The regular night.",
      },
      {
        id: "jazz-2026-09-30",
        seriesId: "jazz",
        recurrence: "Every Wednesday",
        isSpecialEdition: true,
        title: "Jazz night",
        artist: "Guest Quartet",
        date: "2026-09-30",
        description: "Guest set.",
      },
      {
        id: "jazz-2026-10-07",
        seriesId: "jazz",
        recurrence: "Every Wednesday",
        isSpecialEdition: true,
        title: "Jazz night",
        artist: "Later Guest",
        date: "2026-10-07",
        description: "Outside the two-week window.",
      },
      {
        id: "supper",
        title: "Autumn supper",
        date: "2026-10-02",
        description: "One night only.",
      },
    ];

    const model = buildEventsPageModel(events, new Date("2026-09-22T12:00:00"));

    expect(model.regularEvents).toHaveLength(1);
    expect(model.regularEvents[0]).toMatchObject({
      seriesId: "jazz",
      description: "The regular night.",
      guestEditions: [
        {
          artist: "Guest Quartet",
          date: "2026-09-30",
          weekLabel: "Next week",
        },
      ],
    });
    expect(model.datedEvents.map((event) => event.id)).toEqual(["supper"]);
  });

  it("orders residencies around the week and one-offs by date", () => {
    const events: Event[] = [
      {
        id: "jazz",
        seriesId: "jazz",
        recurrence: "Every Wednesday",
        title: "Jazz",
        date: "2026-09-23",
        description: "",
      },
      {
        id: "negroni",
        seriesId: "negroni",
        recurrence: "Every Tuesday",
        title: "Negroni",
        date: "2026-09-29",
        description: "",
      },
      {
        id: "late",
        title: "Late supper",
        date: "2026-10-20",
        description: "",
      },
      {
        id: "early",
        title: "Early supper",
        date: "2026-10-02",
        description: "",
      },
    ];

    const model = buildEventsPageModel(events, new Date("2026-09-22T12:00:00"));

    expect(model.regularEvents.map((event) => event.title)).toEqual([
      "Negroni",
      "Jazz",
    ]);
    expect(model.datedEvents.map((event) => event.id)).toEqual([
      "early",
      "late",
    ]);
    expect(buildEventsStack(model).map((item) => item.event.title)).toEqual([
      "Jazz",
      "Negroni",
      "Early supper",
      "Late supper",
    ]);
    expect(eventWeekdayRank("Every Friday and Tuesday")).toBe(1);
    expect(eventWeekdayRank("Every day")).toBe(-1);
  });
});

describe("groupEventSeries", () => {
  it("shows recurring occurrences as one series with ordered dates", () => {
    const events: Event[] = [
      {
        id: "jazz-2026-08-08",
        seriesId: "jazz",
        recurrence: "Every week on Saturday",
        title: "Jazz by the water",
        date: "2026-08-08",
        description: "Live music.",
      },
      {
        id: "jazz-2026-08-01",
        seriesId: "jazz",
        recurrence: "Every week on Saturday",
        title: "Jazz by the water",
        date: "2026-08-01",
        description: "Live music.",
      },
      {
        id: "supper",
        title: "Summer supper",
        date: "2026-08-04",
        description: "One night.",
      },
      {
        id: "jazz-2026-09-01",
        seriesId: "jazz",
        recurrence: "Every week on Saturday",
        title: "Jazz by the water",
        date: "2026-09-01",
        description: "Outside the rolling month.",
      },
      {
        id: "winter-one-off",
        title: "Winter one-off",
        date: "2026-12-01",
        description: "One-off events remain visible.",
      },
    ];

    const grouped = groupEventSeries(events, new Date("2026-07-15T12:00:00"));

    expect(grouped).toHaveLength(3);
    expect(grouped[0]).toMatchObject({
      seriesId: "jazz",
      date: "2026-08-01",
      dates: ["2026-08-01", "2026-08-08"],
    });
    expect(grouped[1].dates).toEqual(["2026-08-04"]);
    expect(grouped[2].dates).toEqual(["2026-12-01"]);
  });
});
