import { describe, expect, it } from "vitest";
import { londonToday } from "../../marketing/web/src/lib/london-day.js";
import { nightsOnly } from "../../marketing/web/src/lib/promotions.js";
import { weeklyEmailModel } from "./model.js";
import { night, testCatalog } from "./testing.js";

const names = (model) => model.nights.map((card) => `${card.sticker.weekday} ${card.title}`);

const also = (model) => Object.fromEntries(model.nights.map((card) => [card.title, card.also]));

describe("weeklyEmailModel: which nights are this month", () => {
  it("on the first Tuesday, has the rest of the month, each series once with its other dates", () => {
    const model = weeklyEmailModel(testCatalog(), { today: "2026-11-03" });
    expect(model.month).toEqual({ start: "2026-11-01", end: "2026-11-30", name: "November", span: "3 to 30 Nov" });
    expect(names(model)).toEqual(["Tue Negroni Society", "Thu Karaoke with Ross", "Sat–Sun EPIC Jam"]);
    expect(also(model)).toEqual({
      "Negroni Society": "Also 10, 17 and 24 Nov",
      "Karaoke with Ross": "Also 19 Nov",
      "EPIC Jam": "",
    });
  });

  it("later in the month, leaves out the nights that have passed", () => {
    const model = weeklyEmailModel(testCatalog(), { today: "2026-11-11" });
    expect(names(model)).toEqual(["Thu Karaoke with Ross", "Sat–Sun EPIC Jam", "Tue Negroni Society"]);
    expect(also(model)["Negroni Society"]).toBe("Also 24 Nov");
    expect(model.month.span).toBe("11 to 30 Nov");
  });

  it("an event still running counts, as tonight", () => {
    const model = weeklyEmailModel(testCatalog(), { today: "2026-11-15" });
    expect(names(model)).toEqual(["Sat–Sun EPIC Jam", "Tue Negroni Society", "Thu Karaoke with Ross"]);
    expect(model.nights[0].tonight).toBe(true);
  });

  it("takes the day from London, not from the machine's clock", () => {
    // 00:30 on 1 December in London (GMT) is still 30 November in New York.
    const today = londonToday(new Date("2026-12-01T00:30:00Z"));
    expect(today).toBe("2026-12-01");
    expect(weeklyEmailModel(testCatalog(), { today }).month.start).toBe("2026-12-01");
    // In summer London is an hour ahead: 23:30 UTC on the 31st is already the 1st.
    expect(londonToday(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08-01");
  });

  it("agrees with the website's What's on about the month's nights", () => {
    const catalog = testCatalog();
    const today = "2026-11-11";
    const onSite = new Set(
      nightsOnly(catalog.occurrences)
        .filter((row) => row.date >= today && row.date <= "2026-11-30")
        .map((row) => row.seriesId),
    );
    const inEmail = new Set(weeklyEmailModel(catalog, { today }).nights.map((card) => card.href.split("/").at(-1)));
    expect(inEmail).toEqual(onSite);
  });

  it("needs a day to go out on", () => {
    expect(() => weeklyEmailModel(testCatalog(), {})).toThrow(/today/);
  });
});

describe("weeklyEmailModel: what each entry says", () => {
  const model = weeklyEmailModel(testCatalog(), { today: "2026-11-03" });

  it("makes an event over several days one entry, with each day's hours", () => {
    const jam = model.nights.find((card) => card.title === "EPIC Jam");
    expect(jam).toMatchObject({
      start: "2026-11-14",
      end: "2026-11-15",
      sticker: { weekday: "Sat–Sun", day: "14–15", month: "Nov" },
      times: ["Sat noon–8pm", "Sun 1–6pm"],
    });
    expect(model.nights.filter((card) => card.title === "EPIC Jam")).toHaveLength(1);
  });

  it("carries the hours, the line, the offer, the picture and the page", () => {
    const karaoke = model.nights.find((card) => card.title === "Karaoke with Ross");
    expect(karaoke).toMatchObject({
      times: ["7–10pm"],
      note: "Bring a song",
      offer: "£6 beer",
      tonight: false,
      href: "https://gwenda.co.uk/whats-on/karaoke",
      photo: { whole: true, alt: "Karaoke with Ross" },
    });
    expect(karaoke.photo.url).not.toContain("#");
    expect(model.nights[0].photo).toBeNull();
  });

  it("marks tonight only on the day it goes out", () => {
    const tuesday = weeklyEmailModel(testCatalog(), { today: "2026-11-10" });
    expect(tuesday.nights.map((card) => card.tonight)).toEqual([true, false, false]);
  });

  it("shows a promotion once, under Deals, and never among the nights", () => {
    expect(model.deals).toEqual([
      {
        title: "Cocktail Hour",
        when: "Wed to Sat, 5–6:30pm",
        note: "20% off all cocktails",
        offer: "",
        photo: { url: "https://cdn.sanity.io/images/testproj/production/abc123-1132x1600.jpg", whole: true, alt: "Cocktail Hour" },
        href: "https://gwenda.co.uk/whats-on/cocktail-hour",
      },
    ]);
    expect(names(model).join()).not.toContain("Cocktail Hour");
  });

  it("links the pop-up kitchen's Instagram from its series in ops, and says nothing ops hasn't (#296)", () => {
    const catalog = testCatalog();
    const bare = weeklyEmailModel(catalog, { today: "2026-11-10" }).kitchens[0];
    expect(bare.note).toBe("");
    expect(bare.links).toEqual([{ href: "https://gwenda.co.uk/kitchen", text: "See the menu" }]);
    catalog.series = catalog.series.map((row) =>
      row.seriesId === "chez-pickle"
        ? { ...row, pageUrl: "https://www.instagram.com/chezpickle", shortDescription: "Smashed burgers." }
        : row,
    );
    const kitchen = weeklyEmailModel(catalog, { today: "2026-11-10" }).kitchens[0];
    expect(kitchen.note).toBe("Smashed burgers.");
    expect(kitchen.links[1]).toEqual({ href: "https://www.instagram.com/chezpickle", text: "Instagram" });
  });

  it("shows the pop-up kitchen once, with the way to its menu", () => {
    expect(model.kitchens).toHaveLength(1);
    expect(model.kitchens[0]).toMatchObject({
      title: "Chez Pickle",
      when: "Thu 12 Nov, 5–10pm",
      href: "https://gwenda.co.uk/whats-on/chez-pickle",
    });
    expect(model.kitchens[0].links[0]).toEqual({ href: "https://gwenda.co.uk/kitchen", text: "See the menu" });
    expect(names(model).join()).not.toContain("Chez Pickle");
  });

  /** The catalog with December's nights, and one in January. */
  function withDecember() {
    const catalog = testCatalog();
    catalog.occurrences.push(
      night("2026-12-01", "chess", "Negroni Society"),
      night("2026-12-03", "karaoke", "Karaoke with Ross"),
      night("2026-12-10", "karaoke", "Karaoke with Ross"),
      night("2027-01-05", "chess", "Negroni Society"),
    );
    return catalog;
  }

  it("teases next month: its nights, each series once, no further", () => {
    const next = weeklyEmailModel(withDecember(), { today: "2026-11-03" }).nextMonth;
    expect([next.start, next.name]).toEqual(["2026-12-01", "December"]);
    expect(next.nights.map((card) => `${card.sticker.weekday} ${card.sticker.day} ${card.title}`)).toEqual([
      "Tue 1 Negroni Society",
      "Thu 3 Karaoke with Ross",
    ]);
    expect(next.nights[1].also).toBe("Also 10 Dec");
    expect(next.more).toBe(0);
  });

  it("names a few of a busy next month and counts the rest", () => {
    const catalog = testCatalog();
    for (let day = 1; day <= 9; day += 1) {
      catalog.series.push({ seriesId: `one-${day}`, title: `One-off ${day}`, schedule: "once" });
      catalog.occurrences.push(night(`2026-12-0${day}`, `one-${day}`, `One-off ${day}`));
    }
    const busy = weeklyEmailModel(catalog, { today: "2026-11-03" });
    expect(busy.nextMonth.nights).toHaveLength(6);
    expect(busy.nextMonth.more).toBe(3);
  });

  it("points links at another site when asked (a preview)", () => {
    const preview = weeklyEmailModel(testCatalog(), { today: "2026-11-03", origin: "https://preview.example.com/" });
    expect(preview.nights[0].href).toBe("https://preview.example.com/whats-on/chess");
    expect(preview.site.whatsOn).toBe("https://preview.example.com/whats-on");
    expect(preview.site.booking).toMatch(/^https:\/\/www\.opentable\./);
    expect(preview.bookings.halves.map((half) => half.href)).toEqual([
      "https://preview.example.com/bookings#party",
      "https://preview.example.com/bookings#play",
    ]);
  });
});

describe("weeklyEmailModel: a quiet month", () => {
  it("has no nights, and still the deal and next month", () => {
    const catalog = testCatalog();
    catalog.occurrences = catalog.occurrences.filter((row) => row.category !== "event");
    catalog.occurrences.push(night("2026-12-01", "chess", "Negroni Society"));
    const model = weeklyEmailModel(catalog, { today: "2026-11-03" });
    expect(model.nights).toEqual([]);
    expect(model.deals).toHaveLength(1);
    expect(model.nextMonth.nights).toHaveLength(1);
  });

  it("copes with nothing at all", () => {
    for (const catalog of [undefined, {}, { series: [], occurrences: [] }]) {
      const model = weeklyEmailModel(catalog, { today: "2026-11-03" });
      expect(model).toMatchObject({ nights: [], deals: [], kitchens: [], nextMonth: { nights: [], more: 0 } });
    }
  });
});
