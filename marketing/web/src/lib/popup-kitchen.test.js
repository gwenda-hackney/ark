import { describe, expect, it } from "vitest";
import {
  foodBoardLine,
  kitchenChaptersOn,
  kitchenHeader,
  kitchenLine,
  kitchenNow,
  popupIsBookedOrOn,
  popupKitchens,
  popupMenuHref,
  popupWhen,
} from "./popup-kitchen.js";

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

/** The kitchen menu's chapters, as the food page has them. */
const chapters = [
  {
    id: "burgers-and-more",
    title: "Chez Pickle",
    kind: "kitchen",
    popupSeriesId: "chez-pickle",
    items: [],
    subsections: [{ id: "burgers", title: "Burgers", items: [{ id: "og" }] }],
  },
  {
    id: "snacks",
    title: "Snacks",
    kind: "kitchen",
    items: [{ id: "olives" }],
  },
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
        logo: null,
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
      [],
      today,
    );
    expect(kitchen.logo).toEqual({ url: LOGO, width: 900, height: 900 });
    expect(kitchen.pageUrl).toBe("https://www.instagram.com/chezpickle");
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
        {
          id: "empty",
          kind: "kitchen",
          popupSeriesId: "chez-pickle",
          items: [],
        },
      ]),
    ).toBe("/kitchen");
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
  const kitchens = [
    ...series,
    { seriesId: "pasta-club", title: "Pasta Club", category: "popup" },
  ];

  it("counts from when it's booked through its last night, and not the day after", () => {
    // Booked: a night on the website, not started yet
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-01")).toBe(true);
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-12")).toBe(true);
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-14")).toBe(true);
    expect(popupIsBookedOrOn("chez-pickle", run, "2026-11-15")).toBe(false);
    expect(popupIsBookedOrOn("nobody", run, "2026-11-13")).toBe(false);
  });

  describe("kitchenChaptersOn", () => {
    const menu = [
      {
        id: "chez-pickle",
        title: "Chez Pickle",
        kind: "kitchen",
        popupSeriesId: "chez-pickle",
        items: [{ id: "og" }],
      },
      {
        id: "pasta",
        title: "Pasta Club",
        kind: "kitchen",
        popupSeriesId: "pasta-club",
        items: [{ id: "cacio" }],
      },
      {
        id: "snacks",
        title: "Snacks",
        kind: "kitchen",
        items: [{ id: "olives" }],
      },
    ];
    const ids = (list) => list.map((chapter) => chapter.id);

    it("shows a booked pop-up's menu ahead of its first night", () => {
      expect(ids(kitchenChaptersOn(menu, run, "2026-11-10"))).toEqual([
        "chez-pickle",
        "pasta",
        "snacks",
      ]);
    });

    it("drops a pop-up's menu the day after its last night", () => {
      expect(ids(kitchenChaptersOn(menu, run, "2026-11-15"))).toEqual([
        "pasta",
        "snacks",
      ]);
      expect(ids(kitchenChaptersOn(menu, run, "2026-12-05"))).toEqual([
        "snacks",
      ]);
    });

    it("always shows a chapter that belongs to no pop-up", () => {
      expect(ids(kitchenChaptersOn(menu, [], "2026-11-13"))).toEqual([
        "snacks",
      ]);
    });
  });

  describe("kitchenNow", () => {
    it("is the pop-up that's on, started", () => {
      expect(kitchenNow(kitchens, run, "2026-11-13")).toEqual({
        popup: {
          id: "chez-pickle",
          title: "Chez Pickle",
          href: "/whats-on/chez-pickle/",
          from: "Thu 12 Nov",
          started: true,
          when: "Wed to Sat",
          logo: null,
          pageUrl: "",
        },
      });
    });

    it("is the next one booked, and the day it starts, before it has", () => {
      expect(kitchenNow(kitchens, run, "2026-11-15").popup).toEqual({
        id: "pasta-club",
        title: "Pasta Club",
        href: "/whats-on/pasta-club/",
        from: "Thu 3 Dec",
        started: false,
        when: "Thu and Fri, from 3 Dec, until 4 Dec",
        logo: null,
        pageUrl: "",
      });
    });

    it("is nobody when nothing's booked", () => {
      expect(kitchenNow(kitchens, run, "2026-12-05")).toEqual({ popup: null });
    });

    it("has its logo, name and Instagram from its series in ops (#296)", () => {
      const withLogo = kitchens.map((row) =>
        row.seriesId === "chez-pickle"
          ? {
              ...row,
              pageUrl: "https://www.instagram.com/chezpickle",
              logo: { url: LOGO, width: 900, height: 900 },
            }
          : row,
      );
      expect(kitchenNow(withLogo, run, "2026-11-13").popup).toMatchObject({
        title: "Chez Pickle",
        logo: { url: LOGO, width: 900, height: 900 },
        pageUrl: "https://www.instagram.com/chezpickle",
      });
    });

    it("counts only pop-ups, not a night or a deal", () => {
      expect(
        kitchenNow(series, [night("open-decks", "2026-11-19")], today),
      ).toEqual({ popup: null });
    });
  });

  describe("kitchenLine", () => {
    const chez = (started) => ({
      id: "chez-pickle",
      title: "Chez Pickle",
      href: "/whats-on/chez-pickle/",
      from: "Thu 12 Nov",
      started,
    });
    const own = {
      id: "chez-pickle",
      title: "Chez Pickle",
      popupSeriesId: "chez-pickle",
      items: [{ id: "og" }],
    };
    const house = { id: "snacks", title: "Snacks", items: [{ id: "olives" }] };

    it("says who and from when over a booked pop-up's menu, before its first night", () => {
      expect(kitchenLine(chez(false), [own])).toBe("ahead");
    });

    it("says nothing over the menu once the pop-up has started", () => {
      expect(kitchenLine(chez(true), [own])).toBe("");
    });

    it("says who's next when the booked pop-up has no menu up", () => {
      expect(kitchenLine(chez(false), [])).toBe("next");
      expect(kitchenLine(chez(false), [house])).toBe("next");
    });

    it("says the list is on its way when the pop-up has started with no menu", () => {
      expect(kitchenLine(chez(true), [])).toBe("soon");
    });

    it("says nobody's in when nothing's booked and nothing's on the menu", () => {
      expect(kitchenLine(null, [])).toBe("none");
      // A chapter with nothing on it is no menu
      expect(kitchenLine(null, [{ ...house, items: [] }])).toBe("none");
    });

    it("says nothing over the house menu when nothing's booked", () => {
      expect(kitchenLine(null, [house])).toBe("");
    });
  });

  describe("the top of home's Food board (#296)", () => {
    const withLogo = kitchens.map((row) =>
      row.seriesId === "chez-pickle"
        ? { ...row, logo: { url: LOGO, width: 900, height: 900 } }
        : row,
    );
    const header = (list, day) =>
      kitchenHeader(kitchenNow(list, run, day).popup);

    it("shows the pop-up's logo, who's in and when, and the way to its page", () => {
      expect(header(withLogo, "2026-11-13")).toEqual({
        title: "Chez Pickle",
        logo: { url: LOGO, width: 900, height: 900 },
        line: "In the kitchen: Chez Pickle, Wed to Sat",
        href: "/whats-on/chez-pickle/",
      });
    });

    it("is there from when it's booked through its last night, as its menu is", () => {
      expect(header(withLogo, "2026-11-01")?.title).toBe("Chez Pickle");
      expect(header(withLogo, "2026-11-14")?.title).toBe("Chez Pickle");
      // The day after its last night: the next one booked
      expect(header(withLogo, "2026-11-15")?.title).toBe("Pasta Club");
    });

    it("says who's next before it has started", () => {
      expect(header(withLogo, "2026-11-01")?.line).toBe(
        "Next in the kitchen: Chez Pickle, Wed to Sat, from 12 Nov",
      );
    });

    it("is the name alone when the series has no logo", () => {
      expect(header(kitchens, "2026-11-13")).toMatchObject({
        logo: null,
        line: "In the kitchen: Chez Pickle, Wed to Sat",
      });
    });

    it("isn't there when nobody's booked", () => {
      expect(header(withLogo, "2026-12-05")).toBeNull();
      expect(kitchenHeader(null)).toBeNull();
    });

    describe("what the board says under it", () => {
      const own = {
        id: "chez-pickle",
        popupSeriesId: "chez-pickle",
        items: [{ id: "og" }],
      };
      const popup = (day) => kitchenNow(kitchens, run, day).popup;

      it("nothing over the menu: the top says who and when", () => {
        expect(foodBoardLine(popup("2026-11-01"), [own])).toBe("");
        expect(foodBoardLine(popup("2026-11-13"), [own])).toBe("");
      });

      it("the list is on its way in place of a menu", () => {
        expect(foodBoardLine(popup("2026-11-01"), [])).toBe("soon");
        expect(foodBoardLine(popup("2026-11-13"), [])).toBe("soon");
      });

      it("as before when nobody's booked", () => {
        expect(foodBoardLine(null, [])).toBe("none");
        expect(foodBoardLine(null, [own])).toBe("");
      });
    });
  });

  it("sends a booked pop-up's menu link to its chapter before it starts", () => {
    const linked = [
      {
        id: "pasta",
        title: "Pasta Club",
        kind: "kitchen",
        popupSeriesId: "pasta-club",
        items: [{ id: "cacio" }],
      },
    ];
    const card = popupKitchens(kitchens, run, linked, "2026-11-20").find(
      (row) => row.id === "pasta-club",
    );
    expect(card.menuHref).toBe("/kitchen#pasta");
  });
});
