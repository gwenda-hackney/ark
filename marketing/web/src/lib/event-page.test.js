import { describe, expect, it } from "vitest";
import {
  MORE_DATES,
  eventPageModel,
  renderEventPage,
  siteFormLink,
} from "./event-page.js";
import { oversizedPictures } from "../../scripts/ci/smoke-test-lib.mjs";
import { bookingUrl, bookingUrlFor } from "../config/booking";

const TODAY = "2099-01-06";
/** What the built shell hands over when bookings are on: the button's words. */
const BOOKINGS_ON = ["book", "Book a table"];
const FLYER =
  "https://cdn.sanity.io/images/p/d/abc-1080x1528.jpg?w=1600&auto=format&q=86#whole";

const night = (date, extra = {}) => ({
  date,
  title: "Karaoke",
  startTime: "19:00",
  endTime: "22:00",
  ...extra,
});

/** A repeating night, as buildSeriesDetail gives it. */
const karaoke = (extra = {}) => ({
  seriesId: "karaoke",
  title: "Karaoke",
  schedule: "repeating",
  recurrence: "every week on Thursday",
  heroImageUrl: FLYER,
  fullDescription: "The mic is open.\n\n**No talent** needed.",
  nights: [night("2099-01-08", { offer: "£6 beer" }), night("2099-01-15")],
  upcomingDates: [{ date: "2099-01-08" }, { date: "2099-01-15" }],
  ...extra,
});

const page = (detail, options = {}) => {
  const model = eventPageModel(detail, { today: TODAY, ...options });
  return { model, html: renderEventPage(model) };
};

describe("an ordinary night", () => {
  it("shows the next date, its time, the offer and the words", () => {
    const { model, html } = page(karaoke());
    expect(model.kicker).toBe("Every Thursday");
    expect(html).toContain("<span>Thu</span><b>8</b><span>Jan</span>");
    expect(html).toContain('<p class="ch-night-label">Next up</p>');
    expect(html).toContain('<p class="ch-night-time">Thu 8 Jan, 7–10pm</p>');
    expect(html).toContain('<p class="ch-night-offer">£6 beer</p>');
    expect(html).toContain("<strong>No talent</strong> needed.");
  });

  it("shows a flyer whole, at its own shape", () => {
    const { html } = page(karaoke());
    expect(html).toContain("ch-night-photo--whole");
    expect(html).toContain("--shape: 0.7068");
  });

  it("offers the flyer in sizes, so a phone doesn't download a poster (#240)", () => {
    // The flyer's address comes with w=1600 on it already (FLYER).
    const { html } = page(karaoke());
    const [img] = /<img\b[^>]*>/.exec(html);
    const offered = /\ssrcset="([^"]*)"/
      .exec(img)?.[1]
      .replace(/&amp;/g, "&")
      .split(/,\s+/)
      .map((candidate) => {
        const [url, width] = candidate.split(" ");
        return {
          asks: Number(new URL(url).searchParams.get("w")),
          says: Number.parseInt(width, 10),
        };
      });
    expect(offered?.length).toBeGreaterThan(2);
    // Each address asks the image CDN for the width it says it is...
    for (const { asks, says } of offered) expect(asks).toBe(says);
    // ...from a thumbnail up to the file's own 1080px, and no further.
    expect(offered[0].says).toBeLessThanOrEqual(320);
    expect(offered.at(-1).says).toBe(1080);
    expect(img).toMatch(/\ssizes="[^"]+"/);
    // The rule the deploy check holds every page to.
    expect(oversizedPictures(html)).toEqual([]);
  });

  it("has the logo where there is no flyer", () => {
    const { html } = page(karaoke({ heroImageUrl: "" }), {
      parts: new Map([
        ["mark", '<img class="ch-night-mark" src="/logo.webp">'],
      ]),
    });
    expect(html).toContain('src="/logo.webp"');
    expect(html).toContain("<span>Thu</span><b>8</b>");
  });

  it("says Tonight on the day, on red", () => {
    const { html } = page(karaoke(), { today: "2099-01-08" });
    expect(html).toContain('<p class="ch-night-label">Tonight</p>');
    expect(html).toContain("ch-night--tonight");
  });

  it("books a table for that night: OpenTable opened on its date and start time", () => {
    const { model, html } = page(karaoke(), { parts: new Map([BOOKINGS_ON]) });
    expect(model.lead.book).toEqual({
      href: bookingUrlFor({ date: "2099-01-08", time: "19:00" }),
      label: "Book a table for Thu 8 Jan",
    });
    expect(model.lead.book.href).not.toBe(bookingUrl);
    expect(html).toContain(">Book a table for Thu 8 Jan</a>");
    expect(html).toContain("dateTime=2099-01-08T19:00");
    expect(html).toMatch(
      /<a class="ch-btn ch-btn--solid" href="[^"]+" target="_blank" rel="noopener noreferrer">Book a table for Thu 8 Jan<\/a>/,
    );
  });

  it("says tonight or tomorrow on the button, as the page does", () => {
    const parts = new Map([BOOKINGS_ON]);
    expect(
      page(karaoke(), { today: "2099-01-08", parts }).model.lead.book.label,
    ).toBe("Book a table for tonight");
    expect(
      page(karaoke(), { today: "2099-01-07", parts }).model.lead.book.label,
    ).toBe("Book a table for tomorrow");
  });

  it("books the special night it leads with, at that night's time", () => {
    const special = night("2099-01-08", {
      startTime: "20:15",
      artist: "Ross",
      isSpecialEdition: true,
    });
    const { model } = page(
      karaoke({ featuredGuest: special, nights: [special] }),
      { parts: new Map([BOOKINGS_ON]) },
    );
    expect(model.lead.book.href).toBe(
      bookingUrlFor({ date: "2099-01-08", time: "20:15" }),
    );
  });

  it("has no Book a table when bookings are off", () => {
    const { model, html } = page(karaoke());
    expect(model.lead.book).toBeNull();
    expect(html).not.toContain("Book a table");
  });

  it("has no Book a table for a night that's been and gone", () => {
    const { model } = page(karaoke({ nights: [night("2099-01-05")] }), {
      parts: new Map([BOOKINGS_ON]),
    });
    expect(model.lead.book).toBeNull();
  });

  it("lists the dates after the next one, from every night it has", () => {
    const nights = Array.from({ length: 12 }, (_, week) =>
      night(`2099-01-${String(8 + week * 7).padStart(2, "0")}`),
    ).filter((row) => row.date <= "2099-01-29");
    const later = [night("2099-02-05"), night("2099-02-12")];
    const { model, html } = page(karaoke(), { nights: [...nights, ...later] });
    expect(model.moreDates.map((row) => row.date)).toEqual([
      "2099-01-15",
      "2099-01-22",
      "2099-01-29",
      "2099-02-05",
      "2099-02-12",
    ]);
    expect(model.moreDates.length).toBeLessThanOrEqual(MORE_DATES);
    expect(html).toContain("More dates");
    expect(html).toContain('<time datetime="2099-01-22">Thu 22 Jan</time>');
    // The usual time isn't said again on every line.
    expect(html).not.toContain("ch-event-date-time");
  });

  it("links the one-off that takes a night's place", () => {
    const { html } = page(
      karaoke({
        upcomingDates: [
          { date: "2099-01-08" },
          {
            date: "2099-01-15",
            displaced: true,
            href: "/whats-on/big-one",
            line: "Thur 15 Jan: Big One instead",
          },
        ],
      }),
    );
    expect(html).toContain(
      '<a href="/whats-on/big-one">Thur 15 Jan: Big One instead</a>',
    );
  });

  it("escapes what ops typed", () => {
    const { html } = page(
      karaoke({
        nights: [night("2099-01-08", { offer: "<b>x</b>", artist: '"Ross"' })],
      }),
    );
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("With &quot;Ross&quot;");
  });
});

describe("an event over several days", () => {
  const jam = {
    seriesId: "jam",
    title: "EPIC Jam",
    schedule: "manual",
    heroImageUrl: FLYER,
    fullDescription: "Saturday: DJs.\n\nSunday: films.",
    nights: [
      night("2099-01-10", {
        title: "EPIC Jam",
        startTime: "12:00",
        endTime: "20:00",
        description: "DJs and a live band.",
        heroImageUrl: FLYER,
      }),
      night("2099-01-11", {
        title: "EPIC Jam",
        startTime: "13:00",
        endTime: "18:00",
        description: "A film and a Q&A.",
        heroImageUrl: FLYER,
      }),
    ],
  };

  it("shows each day with its own time and words", () => {
    const { model, html } = page(jam, { nights: jam.nights });
    expect(model.kicker).toBe("2 dates");
    expect(html).toContain("Sat 10 Jan to Sun 11 Jan");
    expect(html).toContain("Day by day");
    expect(model.days.map((day) => [day.date, day.when])).toEqual([
      ["2099-01-10", "12–8pm"],
      ["2099-01-11", "1–6pm"],
    ]);
    expect(html).toContain("DJs and a live band.");
    expect(html).toContain("A film and a Q&amp;A.");
    // The same flyer isn't shown again beside each day.
    expect(html).not.toContain("ch-event-day-flyer");
    expect(html).not.toContain("More dates");
  });

  /** The flyer's own sticker: the one in the lead, ahead of the days'. */
  const flyerSticker = (html) =>
    html.slice(0, html.indexOf("Day by day")).replace(/\s+/g, " ");

  it("has the whole run on the flyer's sticker, as its card has", () => {
    const { model, html } = page(jam, { nights: jam.nights });
    expect(model.lead.date).toEqual({
      weekday: "Sat–Sun",
      day: "10–11",
      month: "Jan",
    });
    expect(flyerSticker(html)).toContain(
      "<span>Sat–Sun</span><b>10–11</b><span>Jan</span>",
    );
  });

  it("keeps one sticker for each day in the list", () => {
    const { html } = page(jam, { nights: jam.nights });
    const list = html.slice(html.indexOf("Day by day"));
    expect(list).toContain("<span>Sat</span><b>10</b><span>Jan</span>");
    expect(list).toContain("<span>Sun</span><b>11</b><span>Jan</span>");
    expect(list).not.toContain("Sat–Sun");
  });

  it("books each day for itself, at its own time, and not the run as a whole", () => {
    const { model, html } = page(jam, {
      nights: jam.nights,
      parts: new Map([BOOKINGS_ON]),
    });
    expect(model.lead.book).toBeNull();
    expect(model.days.map((day) => day.book)).toEqual([
      {
        href: bookingUrlFor({ date: "2099-01-10", time: "12:00" }),
        label: "Book a table for Sat 10 Jan",
      },
      {
        href: bookingUrlFor({ date: "2099-01-11", time: "13:00" }),
        label: "Book a table for Sun 11 Jan",
      },
    ]);
    const list = html.slice(html.indexOf("Day by day"));
    expect(list).toContain(">Book a table for Sat 10 Jan</a>");
    expect(list).toContain(">Book a table for Sun 11 Jan</a>");
    expect(flyerSticker(html)).not.toContain("Book a table");
  });

  it("has only the next day on the sticker when the days aren't in a row", () => {
    const apart = {
      ...jam,
      nights: [jam.nights[0], { ...jam.nights[1], date: "2099-01-17" }],
    };
    const { html } = page(apart, { nights: apart.nights });
    expect(flyerSticker(html)).toContain(
      "<span>Sat</span><b>10</b><span>Jan</span>",
    );
    expect(flyerSticker(html)).not.toContain("10–");
  });
});

describe("a promotion", () => {
  const deal = karaoke({
    title: "Cocktail Hour",
    recurrence: "Every Wednesday and Thursday and Friday and Saturday",
    nights: [
      night("2099-01-07", {
        startTime: "17:00",
        endTime: "18:30",
        offer: "20% off",
      }),
    ],
  });

  it("shows the days and hours and the offer, with no dates or nights", () => {
    const { model, html } = page(deal, { category: "promotion" });
    expect(model.kicker).toBe("");
    expect(html).toContain('<span class="ch-stand-tag">Deal</span>');
    expect(html).toContain("ch-stand--deal");
    expect(html).toContain('<p class="ch-night-time">Wed to Sat, 5–6:30pm</p>');
    expect(html).toContain("20% off");
    expect(html).not.toContain("ch-night-date");
    expect(html).not.toMatch(/night\b(?!-)/i);
  });

  it("has no Book a table of its own: it names no night (the menu bar's covers it)", () => {
    const { model, html } = page(deal, {
      category: "promotion",
      parts: new Map([BOOKINGS_ON]),
    });
    expect(model.lead.book).toBeNull();
    expect(html).not.toContain("Book a table");
  });
});

describe("a pop-up kitchen", () => {
  const kitchen = {
    seriesId: "chez-pickle",
    title: "Chez Pickle",
    schedule: "once",
    heroImageUrl: FLYER,
    fullDescription: "",
    nights: [night("2099-01-08", { title: "Chez Pickle", artist: "POP UP" })],
  };
  const parts = new Map([
    ["logo:chez pickle", '<img src="/chez-pickle.webp" alt="Chez Pickle">'],
    ["line:chez pickle", "Smashed burgers and fries."],
    ["page:chez pickle", "https://www.instagram.com/chezpickle"],
    ["menu:chez-pickle", "/kitchen#chez-pickle"],
    BOOKINGS_ON,
  ]);

  it("shows when they're in, their mark, their menu and their page", () => {
    const { html } = page(kitchen, {
      category: "popup",
      nights: kitchen.nights,
      parts,
    });
    expect(html).toContain('<span class="ch-stand-tag">Pop-up kitchen</span>');
    expect(html).toContain("ch-stand-photo--logo");
    expect(html).toContain('src="/chez-pickle.webp"');
    expect(html).toContain('<p class="ch-night-time">Thu 8 Jan, 7–10pm</p>');
    expect(html).toContain("Smashed burgers and fries.");
    expect(html).toContain(
      '<a class="ch-btn" href="/kitchen#chez-pickle">See the menu</a>',
    );
    expect(html).toContain('href="https://www.instagram.com/chezpickle"');
    expect(html).not.toContain("With POP UP");
  });

  it("books a table for the next night they're in", () => {
    const { model } = page(kitchen, {
      category: "popup",
      nights: kitchen.nights,
      parts,
    });
    expect(model.lead.book).toEqual({
      href: bookingUrlFor({ date: "2099-01-08", time: "19:00" }),
      label: "Book a table for Thu 8 Jan",
    });
  });

  it("leads to the food page when it has no chapter of its own", () => {
    const { html } = page(kitchen, {
      category: "popup",
      nights: kitchen.nights,
    });
    expect(html).toContain(
      '<a class="ch-btn" href="/kitchen">See the menu</a>',
    );
  });
});

describe("a series with no dates yet", () => {
  it("keeps the shell's check-back line, and no night to book a table for", () => {
    const model = eventPageModel(
      { seriesId: "jazz", title: "Jazz", datesPending: true, nights: [] },
      { today: TODAY, parts: new Map([BOOKINGS_ON]) },
    );
    expect(model.kicker).toBe("Dates to be announced");
    expect(model.lead.book).toBeNull();
    expect(
      renderEventPage(model, { pending: "<p>Check back soon</p>" }),
    ).toContain("<p>Check back soon</p>");
  });
});

describe("an event that sends people to a form", () => {
  const parts = new Map([
    BOOKINGS_ON,
    ["form:party", "Book your party"],
    ["form:tom", "Tom &amp; Jerry&#39;s"],
  ]);

  it("knows this site's forms, however the link was typed in ops", () => {
    const party = { href: "/contact/party", label: "Book your party" };
    expect(siteFormLink("https://gwenda.co.uk/contact/party", parts)).toEqual(
      party,
    );
    expect(
      siteFormLink("https://www.gwenda.co.uk/contact/party/", parts),
    ).toEqual(party);
    expect(siteFormLink("/contact/party", parts)).toEqual(party);
    expect(siteFormLink("/contact/tom", parts)?.label).toBe("Tom & Jerry's");
  });

  it("is not fooled by other sites, other pages, or a form we don't have", () => {
    for (const link of [
      "",
      "https://example.com/contact/party",
      "https://gwenda.co.uk.evil.example/contact/party",
      "//evil.example/contact/party",
      "https://gwenda.co.uk/whats-on",
      "https://gwenda.co.uk/contact/verify",
      "https://gwenda.co.uk/contact/nope",
      "javascript:alert(1)",
    ]) {
      expect(siteFormLink(link, parts), link).toBeNull();
    }
  });

  it("puts the form's button on a night whose link is the form", () => {
    const { html } = page(
      karaoke({
        nights: [night("2099-01-08", { pageUrl: "/contact/party" })],
      }),
      { parts },
    );
    expect(html).toContain(
      '<a class="ch-btn ch-btn--solid" href="/contact/party">Book your party</a>',
    );
    expect(html).not.toContain("Book a table");
  });

  it("leaves any other link as it was: their page, beside Book a table", () => {
    const { html } = page(
      karaoke({
        nights: [night("2099-01-08", { pageUrl: "https://partiful.com/e/x" })],
      }),
      { parts },
    );
    expect(html).toContain("Book a table");
    expect(html).toContain('href="https://partiful.com/e/x"');
    expect(html).not.toContain("Book your party");
  });
});
