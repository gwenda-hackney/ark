import { describe, expect, it } from "vitest";
import {
  closedDays,
  hoursText,
  openNow,
  openingHoursSpecification,
  readWeek,
  timeText,
  todayLine,
  weekRows,
} from "./opening-hours.js";

/** The venue's week as ops publishes it (openingHours.days). */
const GWENDA = [
  { day: "mon", closed: true },
  { day: "tue", closed: false, opens: "17:00", closes: "22:00" },
  { day: "wed", closed: false, opens: "17:00", closes: "22:30" },
  { day: "thu", closed: false, opens: "17:00", closes: "22:30" },
  { day: "fri", closed: false, opens: "16:00", closes: "23:30" },
  { day: "sat", closed: false, opens: "16:00", closes: "01:00" },
  { day: "sun", closed: false, opens: "16:00", closes: "22:00" },
];
const week = readWeek(GWENDA);

/** November 2026 is GMT, so these instants are London wall-clock times too. */
const at = (iso) => new Date(iso);

describe("readWeek", () => {
  it("reads the seven days, Monday first, whatever order they come in", () => {
    const shuffled = [...GWENDA].reverse();
    expect(readWeek(shuffled)).toEqual(week);
    expect(week.map((day) => day.day)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
      "sun",
    ]);
    expect(week[0]).toEqual({
      day: "mon",
      closed: true,
      opens: "",
      closes: "",
    });
    expect(week[5]).toEqual({
      day: "sat",
      closed: false,
      opens: "16:00",
      closes: "01:00",
    });
  });

  it("never invents hours: anything missing or odd means no week at all", () => {
    expect(readWeek(null)).toBeNull();
    expect(readWeek(undefined)).toBeNull();
    expect(readWeek([])).toBeNull();
    // A day missing
    expect(readWeek(GWENDA.slice(1))).toBeNull();
    // A day twice
    expect(readWeek([...GWENDA, GWENDA[1]])).toBeNull();
    // An open day without a closing time
    expect(
      readWeek(GWENDA.map((d) => (d.day === "tue" ? { ...d, closes: "" } : d))),
    ).toBeNull();
    // A time that isn't one
    expect(
      readWeek(
        GWENDA.map((d) => (d.day === "tue" ? { ...d, opens: "5pm" } : d)),
      ),
    ).toBeNull();
    // Opens and closes at the same minute
    expect(
      readWeek(
        GWENDA.map((d) => (d.day === "tue" ? { ...d, closes: "17:00" } : d)),
      ),
    ).toBeNull();
  });
});

describe("times, the British casual way", () => {
  it("drops :00 and says am or pm", () => {
    expect(timeText("17:00")).toBe("5pm");
    expect(timeText("22:30")).toBe("10:30pm");
    expect(timeText("01:00")).toBe("1am");
    expect(timeText("09:15")).toBe("9:15am");
    expect(timeText("00:00")).toBe("midnight");
    expect(timeText("12:00")).toBe("midday");
    expect(timeText("12:30")).toBe("12:30pm");
    expect(timeText("00:30")).toBe("12:30am");
  });

  it("says pm once when both ends are in the evening", () => {
    const day = (d) => week.find((row) => row.day === d);
    expect(hoursText(day("tue"))).toBe("5–10pm");
    expect(hoursText(day("wed"))).toBe("5–10:30pm");
    expect(hoursText(day("fri"))).toBe("4–11:30pm");
    // Past midnight: both ends say which
    expect(hoursText(day("sat"))).toBe("4pm–1am");
    expect(hoursText({ opens: "12:00", closes: "23:00" })).toBe("midday–11pm");
    expect(hoursText({ opens: "18:00", closes: "00:00" })).toBe("6pm–midnight");
  });
});

describe("todayLine", () => {
  it("before opening: today's hours", () => {
    // Tuesday 10am
    expect(todayLine(week, at("2026-11-10T10:00:00Z"))).toBe(
      "Open today 5–10pm",
    );
    expect(todayLine(week, at("2026-11-14T12:00:00Z"))).toBe(
      "Open today 4pm–1am",
    );
  });

  it("while open: open now, and till when", () => {
    // Wednesday 8pm
    expect(todayLine(week, at("2026-11-11T20:00:00Z"))).toBe(
      "Open now till 10:30pm",
    );
  });

  it("Monday, closed: says when it opens next", () => {
    expect(todayLine(week, at("2026-11-09T12:00:00Z"))).toBe(
      "Closed today, open Tuesday from 5pm",
    );
  });

  it("after closing: closed now, and the next opening", () => {
    // Tuesday 10:15pm
    expect(todayLine(week, at("2026-11-10T22:15:00Z"))).toBe(
      "Closed now, open Wednesday from 5pm",
    );
    // Sunday 11pm: the next opening skips Monday
    expect(todayLine(week, at("2026-11-15T23:00:00Z"))).toBe(
      "Closed now, open Tuesday from 5pm",
    );
  });

  it("Saturday past midnight: at 00:30 on Sunday it is still Saturday's night", () => {
    expect(todayLine(week, at("2026-11-15T00:30:00Z"))).toBe(
      "Open now till 1am",
    );
    // At 1am it's over; Sunday opens at 4pm
    expect(todayLine(week, at("2026-11-15T01:00:00Z"))).toBe(
      "Open today 4–10pm",
    );
  });

  it("a week with no opening at all just says closed", () => {
    const shut = readWeek(GWENDA.map((d) => ({ day: d.day, closed: true })));
    expect(todayLine(shut, at("2026-11-10T12:00:00Z"))).toBe("Closed today");
  });

  it("no week, no line", () => {
    expect(todayLine(null, at("2026-11-10T12:00:00Z"))).toBe("");
  });
});

describe("openNow", () => {
  it("says till when, and whose night it is", () => {
    expect(openNow(week, at("2026-11-14T23:00:00Z"))).toEqual({
      open: true,
      day: "sat",
      closes: "01:00",
    });
    expect(openNow(week, at("2026-11-15T00:30:00Z"))).toEqual({
      open: true,
      day: "sat",
      closes: "01:00",
    });
    expect(openNow(week, at("2026-11-09T20:00:00Z"))).toEqual({ open: false });
    expect(openNow(null, at("2026-11-09T20:00:00Z"))).toEqual({ open: false });
  });

  it("opens on the minute and closes on the minute", () => {
    expect(openNow(week, at("2026-11-10T17:00:00Z")).open).toBe(true);
    expect(openNow(week, at("2026-11-10T16:59:00Z")).open).toBe(false);
    expect(openNow(week, at("2026-11-10T22:00:00Z")).open).toBe(false);
  });

  it("goes by the clock in London, not the visitor's or UTC", () => {
    // Sunday 9:30pm UTC in July is 10:30pm in London: Sunday closed at 10
    expect(openNow(week, at("2026-07-05T21:30:00Z")).open).toBe(false);
    // Saturday 11:30pm UTC in July is 00:30 Sunday in London: still Saturday's night
    expect(openNow(week, at("2026-07-04T23:30:00Z"))).toEqual({
      open: true,
      day: "sat",
      closes: "01:00",
    });
  });

  it("the night the clocks go back (25 October 2026)", () => {
    // 00:30 BST: Saturday's night
    expect(openNow(week, at("2026-10-24T23:30:00Z")).open).toBe(true);
    // 01:15 BST, then 01:15 again in GMT: closed both times
    expect(openNow(week, at("2026-10-25T00:15:00Z")).open).toBe(false);
    expect(openNow(week, at("2026-10-25T01:15:00Z")).open).toBe(false);
  });

  it("the night the clocks go forward (28 March 2027)", () => {
    // 00:30 GMT: open
    expect(openNow(week, at("2027-03-28T00:30:00Z")).open).toBe(true);
    // An hour later it is 02:00 BST: closed
    expect(openNow(week, at("2027-03-28T01:00:00Z")).open).toBe(false);
    expect(todayLine(week, at("2027-03-28T01:00:00Z"))).toBe(
      "Open today 4–10pm",
    );
  });
});

describe("weekRows", () => {
  it("lists the week Monday first, days with the same hours together", () => {
    expect(weekRows(week)).toEqual([
      { days: "Mon", hours: "Closed", closed: true },
      { days: "Tue", hours: "5–10pm", closed: false },
      { days: "Wed–Thu", hours: "5–10:30pm", closed: false },
      { days: "Fri", hours: "4–11:30pm", closed: false },
      { days: "Sat", hours: "4pm–1am", closed: false },
      { days: "Sun", hours: "4–10pm", closed: false },
    ]);
  });

  it("is empty without a week", () => {
    expect(weekRows(null)).toEqual([]);
  });
});

describe("closedDays", () => {
  it("names the days it's shut, for 'Shut Mondays'", () => {
    expect(closedDays(week)).toBe("Mondays");
    const twoOff = readWeek(
      GWENDA.map((d) => (d.day === "tue" ? { day: "tue", closed: true } : d)),
    );
    expect(closedDays(twoOff)).toBe("Mondays and Tuesdays");
    const open = readWeek(
      GWENDA.map((d) => (d.closed ? { ...GWENDA[1], day: d.day } : d)),
    );
    expect(closedDays(open)).toBe("");
    expect(closedDays(null)).toBe("");
  });
});

describe("openingHoursSpecification (schema.org)", () => {
  it("one entry per run of days with the same hours; closed days left out", () => {
    expect(openingHoursSpecification(week)).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Tuesday"],
        opens: "17:00",
        closes: "22:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Wednesday", "Thursday"],
        opens: "17:00",
        closes: "22:30",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Friday"],
        opens: "16:00",
        closes: "23:30",
      },
      // Closing after midnight: closes earlier than it opens, on Saturday's spec
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "16:00",
        closes: "01:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Sunday"],
        opens: "16:00",
        closes: "22:00",
      },
    ]);
  });

  it("nothing without a week", () => {
    expect(openingHoursSpecification(null)).toEqual([]);
  });
});
