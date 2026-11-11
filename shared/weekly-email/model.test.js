import { describe, expect, it } from "vitest";
import { londonToday } from "../../marketing/web/src/lib/london-day.js";
import { nightWeeks } from "../../marketing/web/src/lib/night-cards.js";
import { nightsOnly } from "../../marketing/web/src/lib/promotions.js";
import { weeklyEmailModel } from "./model.js";
import { night, testCatalog } from "./testing.js";

const names = (model) => model.nights.map((card) => `${card.sticker.weekday} ${card.title}`);

describe("weeklyEmailModel: which nights are this week", () => {
  it("on a Monday, has the whole week to Sunday and none of next week's", () => {
    const model = weeklyEmailModel(testCatalog(), { today: "2026-11-09" });
    expect(model.week).toEqual({ start: "2026-11-09", end: "2026-11-15", span: "9 to 15 Nov" });
    expect(names(model)).toEqual(["Tue Negroni Society", "Thu Karaoke with Ross", "Sat–Sun EPIC Jam"]);
  });

  it("on a Wednesday, leaves out the nights that have passed", () => {
    const model = weeklyEmailModel(testCatalog(), { today: "2026-11-11" });
    expect(names(model)).toEqual(["Thu Karaoke with Ross", "Sat–Sun EPIC Jam"]);
    expect(model.week.span).toBe("11 to 15 Nov");
  });

  it("on a Sunday, has that day only, and an event still running counts", () => {
    const model = weeklyEmailModel(testCatalog(), { today: "2026-11-15" });
    expect(names(model)).toEqual(["Sat–Sun EPIC Jam"]);
    expect(model.nights[0].tonight).toBe(true);
    expect(model.week.span).toBe("15 Nov");
    expect(model.nextWeek.nights.map((card) => card.title)).toEqual(["Negroni Society", "Karaoke with Ross"]);
  });

  it("takes the day from London, not from the machine's clock", () => {
    // 00:30 on Monday in London (GMT) is still Sunday evening in New York.
    const today = londonToday(new Date("2026-11-16T00:30:00Z"));
    expect(today).toBe("2026-11-16");
    expect(weeklyEmailModel(testCatalog(), { today }).week.start).toBe("2026-11-16");
    // In summer London is an hour ahead: 23:30 UTC on Sunday is already Monday.
    expect(londonToday(new Date("2026-07-12T23:30:00Z"))).toBe("2026-07-13");
  });

  it("agrees with the website's What's on about this week's nights", () => {
    const catalog = testCatalog();
    const today = "2026-11-11";
    const nights = nightsOnly(catalog.occurrences);
    const [thisWeek] = nightWeeks(
      nights.map((row) => row.date),
      today,
    );
    expect(thisWeek.label).toBe("This week");
    const onSite = new Set(thisWeek.indexes.map((index) => nights[index].seriesId));
    const inEmail = new Set(weeklyEmailModel(catalog, { today }).nights.map((card) => card.href.split("/").at(-1)));
    expect(inEmail).toEqual(onSite);
  });

  it("needs a day to go out on", () => {
    expect(() => weeklyEmailModel(testCatalog(), {})).toThrow(/today/);
  });
});

describe("weeklyEmailModel: what each entry says", () => {
  const model = weeklyEmailModel(testCatalog(), { today: "2026-11-09" });

  it("makes an event over several days one entry, with each day's hours", () => {
    const jam = model.nights.find((card) => card.title === "EPIC Jam");
    expect(jam).toMatchObject({
      start: "2026-11-14",
      end: "2026-11-15",
      sticker: { weekday: "Sat–Sun", day: "14–15", month: "Nov" },
      times: ["Sat 12–8pm", "Sun 1–6pm"],
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

  it("teases next week: Monday to Sunday after this one, no further", () => {
    expect(model.nextWeek.start).toBe("2026-11-16");
    expect(model.nextWeek.span).toBe("16 to 22 Nov");
    expect(model.nextWeek.nights.map((card) => `${card.sticker.weekday} ${card.sticker.day} ${card.title}`)).toEqual([
      "Tue 17 Negroni Society",
      "Thu 19 Karaoke with Ross",
    ]);
    expect(model.nextWeek.more).toBe(0);
  });

  it("names a few of a busy next week and counts the rest", () => {
    const catalog = testCatalog();
    for (let day = 16; day <= 22; day += 1) {
      catalog.series.push({ seriesId: `one-${day}`, title: `One-off ${day}`, schedule: "once" });
      catalog.occurrences.push(night(`2026-11-${day}`, `one-${day}`, `One-off ${day}`));
    }
    const busy = weeklyEmailModel(catalog, { today: "2026-11-09" });
    expect(busy.nextWeek.nights).toHaveLength(6);
    expect(busy.nextWeek.more).toBe(3);
  });

  it("points links at another site when asked (a preview)", () => {
    const preview = weeklyEmailModel(testCatalog(), { today: "2026-11-09", origin: "https://preview.example.com/" });
    expect(preview.nights[0].href).toBe("https://preview.example.com/whats-on/chess");
    expect(preview.site.whatsOn).toBe("https://preview.example.com/whats-on");
    expect(preview.site.booking).toMatch(/^https:\/\/www\.opentable\./);
  });
});

describe("weeklyEmailModel: a quiet week", () => {
  it("has no nights, and still the deal and next week", () => {
    const catalog = testCatalog();
    catalog.occurrences = catalog.occurrences.filter(
      (row) => row.category !== "event" || row.date < "2026-11-09" || row.date > "2026-11-15",
    );
    const model = weeklyEmailModel(catalog, { today: "2026-11-09" });
    expect(model.nights).toEqual([]);
    expect(model.deals).toHaveLength(1);
    expect(model.nextWeek.nights).toHaveLength(2);
  });

  it("copes with nothing at all", () => {
    for (const catalog of [undefined, {}, { series: [], occurrences: [] }]) {
      const model = weeklyEmailModel(catalog, { today: "2026-11-09" });
      expect(model).toMatchObject({ nights: [], deals: [], kitchens: [], nextWeek: { nights: [], more: 0 } });
    }
  });
});
