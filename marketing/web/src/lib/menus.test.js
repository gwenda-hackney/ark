import { describe, expect, it } from "vitest";
import {
  addDays,
  boardCards,
  boardPick,
  daysWords,
  menuDayKey,
  menuRunsOn,
  menuShelf,
  popupMenuLinks,
  weekdayOf,
} from "./menus.js";

/** Mon 23 Nov 2026 … Sun 29 Nov 2026 */
const MON = "2026-11-23";
const TUE = "2026-11-24";
const THU = "2026-11-26";
const SAT = "2026-11-28";

const item = (name, price = "10") => ({ id: name, name, price });
const chapter = (id, menuId, kind = "kitchen", extra = {}) => ({
  id,
  title: id,
  kind,
  ...(menuId ? { menuId } : {}),
  items: [item(`${id} dish`)],
  ...extra,
});
const menuInfo = (id, name, kind, extra = {}) => ({
  id,
  name,
  kind,
  startsOn: "",
  endsOn: "",
  days: [],
  ...extra,
});
const popup = (seriesId, title) => ({ seriesId, title, category: "popup" });

/** A pop-up's nights on these weekdays for three weeks from Mon 16 Nov. */
function nights(seriesId, days) {
  const out = [];
  for (let n = 0; n < 21; n += 1) {
    const date = addDays("2026-11-16", n);
    if (days.includes(weekdayOf(date)))
      out.push({ seriesId, date, category: "popup" });
  }
  return out;
}

/** Chez Pickle Wed–Sun and a second kitchen on Mondays, each with a menu, and Drinks. */
function twoKitchens() {
  return {
    menu: {
      menus: [
        menuInfo("drinks", "Drinks", "bar"),
        menuInfo("chez-pickle", "Chez Pickle", "kitchen", {
          days: ["wed", "thu", "fri", "sat", "sun"],
          popupSeriesId: "chez-pickle",
        }),
        menuInfo("dumplings", "Dumplings", "kitchen", {
          days: ["mon"],
          popupSeriesId: "monday-dumplings",
        }),
      ],
      sections: [
        chapter("cocktails", "drinks", "bar"),
        chapter("burgers", "chez-pickle"),
        chapter("dumpling-plates", "dumplings"),
      ],
    },
    catalog: {
      series: [
        popup("chez-pickle", "Chez Pickle"),
        popup("monday-dumplings", "Monday Dumplings"),
      ],
      occurrences: [
        ...nights("chez-pickle", ["wed", "thu", "fri", "sat", "sun"]),
        ...nights("monday-dumplings", ["mon"]),
      ],
    },
  };
}

describe("when a menu runs", () => {
  it("runs between its dates on its days; no days is every day", () => {
    const brunch = menuInfo("brunch", "Brunch", "kitchen", { days: ["sat"] });
    expect(menuRunsOn(brunch, SAT)).toBe(true);
    expect(menuRunsOn(brunch, THU)).toBe(false);
    const winter = menuInfo("winter", "Winter", "bar", {
      startsOn: "2026-12-01",
      endsOn: "2027-01-31",
    });
    expect(menuRunsOn(winter, "2026-11-30")).toBe(false);
    expect(menuRunsOn(winter, "2026-12-01")).toBe(true);
    expect(menuRunsOn(winter, "2027-01-31")).toBe(true);
    expect(menuRunsOn(winter, "2027-02-01")).toBe(false);
  });

  it("says its days the way ops does", () => {
    expect(daysWords([])).toBe("Every day");
    expect(daysWords(["sat"])).toBe("Sat");
    expect(daysWords(["thu", "fri"])).toBe("Thu & Fri");
    expect(daysWords(["wed", "thu", "fri", "sat", "sun"])).toBe("Wed–Sun");
    expect(daysWords(["mon", "wed", "fri"])).toBe("Mon, Wed & Fri");
    expect(daysWords(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).toBe(
      "Every day",
    );
  });
});

describe("two pop-up kitchens in one week", () => {
  const { menu, catalog } = twoKitchens();

  it("shows each kitchen in week order, the same every day, with today's marked", () => {
    for (const [day, today] of [
      [MON, ["monday-dumplings"]],
      [TUE, []],
      [THU, ["chez-pickle"]],
    ]) {
      const shelf = menuShelf("kitchen", menu, catalog, day);
      expect(shelf.kitchens.map((kitchen) => kitchen.id)).toEqual([
        "monday-dumplings",
        "chez-pickle",
      ]);
      expect(
        shelf.kitchens.filter((kitchen) => kitchen.today).map((k) => k.id),
      ).toEqual(today);
    }
  });

  it("has a week line of who cooks when, each leading to its menu", () => {
    const shelf = menuShelf("kitchen", menu, catalog, THU);
    expect(shelf.week).toEqual([
      {
        days: "Mon",
        title: "Monday Dumplings",
        href: "/kitchen#dumplings",
        today: false,
      },
      {
        days: "Wed–Sun",
        title: "Chez Pickle",
        href: "/kitchen#chez-pickle",
        today: true,
      },
    ]);
  });

  it("gives every menu its own link by its slug, ahead of its chapters", () => {
    const shelf = menuShelf("kitchen", menu, catalog, THU);
    expect(shelf.menus.map((view) => [view.id, view.href, view.label])).toEqual(
      [
        ["dumplings", "/kitchen#dumplings", "Dumplings · Mon"],
        ["chez-pickle", "/kitchen#chez-pickle", "Chez Pickle · Wed–Sun"],
      ],
    );
    expect(popupMenuLinks(menu, catalog, THU).get("chez-pickle")).toBe(
      "/kitchen#chez-pickle",
    );
  });

  it("leads home's Food board with whoever cooks today, the other under Also", () => {
    const monday = boardPick(menuShelf("kitchen", menu, catalog, MON), MON);
    expect(monday.line).toBe("In the kitchen: Monday Dumplings");
    expect(monday.menu.id).toBe("dumplings");
    expect(monday.menuLabel).toBe("");
    expect(monday.also).toEqual([
      { text: "Wed–Sun, Chez Pickle", href: "/kitchen#chez-pickle" },
    ]);

    const thursday = boardPick(menuShelf("kitchen", menu, catalog, THU), THU);
    expect(thursday.line).toBe("In the kitchen: Chez Pickle");
    expect(thursday.menu.id).toBe("chez-pickle");
    expect(thursday.also).toEqual([
      { text: "Mon, Monday Dumplings", href: "/kitchen#dumplings" },
    ]);
  });

  it("orders the kitchens for home's Food board, the one cooking next first", () => {
    const cards = (day) =>
      boardCards(menuShelf("kitchen", menu, catalog, day), day).map((card) => [
        card.id,
        card.when,
        card.menu?.id,
      ]);
    expect(cards(MON)).toEqual([
      ["monday-dumplings", "Today", "dumplings"],
      ["chez-pickle", "Wednesday", "chez-pickle"],
    ]);
    expect(cards(TUE)).toEqual([
      ["chez-pickle", "Wednesday", "chez-pickle"],
      ["monday-dumplings", "Monday", "dumplings"],
    ]);
    expect(cards(THU)[0][0]).toBe("chez-pickle");
    // The lead card is what the board led with before
    const lead = boardCards(menuShelf("kitchen", menu, catalog, TUE), TUE)[0];
    expect(lead.line).toBe("Wednesday: Chez Pickle");
  });

  it("with nobody cooking today, leads with the next one, labelled with its day", () => {
    const tuesday = boardPick(menuShelf("kitchen", menu, catalog, TUE), TUE);
    expect(tuesday.line).toBe("Wednesday: Chez Pickle");
    expect(tuesday.menu.id).toBe("chez-pickle");
    expect(tuesday.menuLabel).toBe("");
  });

  it("drops a kitchen the day after its last night", () => {
    const after = "2026-12-08";
    const shelf = menuShelf("kitchen", menu, catalog, after);
    expect(shelf.kitchens).toEqual([]);
    expect(boardPick(shelf, after)).toBeNull();
  });
});

describe("a pop-up with a menu for each day", () => {
  const menu = {
    menus: [
      menuInfo("chez-pickle-dinner", "Dinner", "kitchen", {
        days: ["thu", "fri"],
        popupSeriesId: "chez-pickle",
      }),
      menuInfo("chez-pickle-brunch", "Brunch", "kitchen", {
        days: ["sat"],
        popupSeriesId: "chez-pickle",
      }),
    ],
    sections: [
      chapter("small-plates", "chez-pickle-dinner"),
      chapter("brunch-plates", "chez-pickle-brunch"),
    ],
  };
  const catalog = {
    series: [popup("chez-pickle", "Chez Pickle")],
    occurrences: nights("chez-pickle", ["thu", "fri", "sat"]),
  };

  it("shows both every day in the order ops sets, today's marked", () => {
    const monday = menuShelf("kitchen", menu, catalog, MON);
    expect(monday.menus.map((view) => [view.label, view.today])).toEqual([
      ["Dinner · Thu & Fri", false],
      ["Brunch · Sat", false],
    ]);
    const saturday = menuShelf("kitchen", menu, catalog, SAT);
    expect(saturday.menus.map((view) => [view.label, view.today])).toEqual([
      ["Dinner · Thu & Fri", false],
      ["Brunch · Sat", true],
    ]);
    expect(saturday.menus.map((view) => view.href)).toEqual([
      "/kitchen#chez-pickle-dinner",
      "/kitchen#chez-pickle-brunch",
    ]);
  });

  it("shows the menu for the night it leads with: Dinner on Thursday, Brunch on Saturday", () => {
    const thursday = boardPick(menuShelf("kitchen", menu, catalog, THU), THU);
    expect(thursday.menu.name).toBe("Dinner");
    expect(thursday.menuLabel).toBe("");
    const saturday = boardPick(menuShelf("kitchen", menu, catalog, SAT), SAT);
    expect(saturday.menu.name).toBe("Brunch");
    // Monday, nobody cooks: Thursday is next, and its board is Thursday's dinner
    const monday = boardPick(menuShelf("kitchen", menu, catalog, MON), MON);
    expect(monday.line).toBe("Thursday: Chez Pickle");
    expect(monday.menu.name).toBe("Dinner");
  });

  it("on Saturday the board shows brunch, with dinner under Also", () => {
    const pick = boardPick(menuShelf("kitchen", menu, catalog, SAT), SAT);
    expect(pick.menu.name).toBe("Brunch");
    expect(pick.also).toEqual([
      { text: "Dinner, Thu & Fri", href: "/kitchen#chez-pickle-dinner" },
    ]);
  });

  it("on a cooking day with no menu of its own, labels the next day's menu", () => {
    const wednesdayToo = {
      ...catalog,
      occurrences: nights("chez-pickle", ["wed", "thu", "fri", "sat"]),
    };
    const wed = "2026-11-25";
    const pick = boardPick(menuShelf("kitchen", menu, wednesdayToo, wed), wed);
    expect(pick.line).toBe("In the kitchen: Chez Pickle");
    expect(pick.menu.name).toBe("Dinner");
    expect(pick.menuLabel).toBe("Thursday’s menu");
  });
});

describe("drinks menus with dates", () => {
  const menu = {
    menus: [
      menuInfo("drinks", "Drinks", "bar"),
      menuInfo("winter-specials", "Winter specials", "bar", {
        startsOn: "2026-12-01",
        endsOn: "2027-01-31",
      }),
    ],
    sections: [
      chapter("cocktails", "drinks", "bar"),
      chapter("warmers", "winter-specials", "bar"),
    ],
  };

  it("lists one that hasn't started as a line at the foot", () => {
    const shelf = menuShelf("bar", menu, {}, MON);
    expect(shelf.menus.map((view) => view.id)).toEqual(["drinks"]);
    expect(shelf.coming).toEqual([
      { id: "winter-specials", name: "Winter specials", from: "1 Dec" },
    ]);
  });

  it("shows it in full while it runs, and not the day after it ends", () => {
    expect(
      menuShelf("bar", menu, {}, "2026-12-01").menus.map((view) => view.id),
    ).toEqual(["drinks", "winter-specials"]);
    const after = menuShelf("bar", menu, {}, "2027-02-01");
    expect(after.menus.map((view) => view.id)).toEqual(["drinks"]);
    expect(after.coming).toEqual([]);
  });
});

describe("before ops sends menus", () => {
  it("groups the chapters as before, with the links they always had", () => {
    const menu = {
      sections: [
        chapter("our-cocktails", "", "bar"),
        chapter("burgers", "", "kitchen", { popupSeriesId: "chez-pickle" }),
      ],
    };
    const catalog = {
      series: [popup("chez-pickle", "Chez Pickle")],
      occurrences: nights("chez-pickle", ["wed", "thu", "fri", "sat", "sun"]),
    };
    const bar = menuShelf("bar", menu, catalog, THU);
    expect(
      bar.menus.map((view) => [view.name, view.anchor, view.href]),
    ).toEqual([["Drinks", "", "/bar#our-cocktails"]]);
    const kitchen = menuShelf("kitchen", menu, catalog, THU);
    expect(kitchen.kitchens.map((k) => k.popup?.title)).toEqual([
      "Chez Pickle",
    ]);
    expect(kitchen.where(menu.sections[1]).href).toBe("/kitchen#burgers");
  });
});

describe("menuDayKey", () => {
  const { menu, catalog } = twoKitchens();

  it("changes when the day changes what the site shows, and not otherwise", () => {
    const key = (day) => menuDayKey(menu, catalog, day);
    expect(key(MON)).not.toBe(key(TUE));
    expect(key(TUE)).not.toBe(key(THU));
    // Thursday and Friday: Chez Pickle cooks both, the board reads the same
    expect(key(THU)).toBe(key("2026-11-27"));
  });
});
