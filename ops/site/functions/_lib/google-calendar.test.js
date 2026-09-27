import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CALENDAR_LOCATION,
  buildCalendarEvent,
  calendarEventHash,
  calendarLinkValue,
  calendarSummary,
  chooseCalendarEvent,
  eventFallsOnDate,
  formatCalendarLink,
  normalizeCalendarId,
  parseCalendarLink,
} from "./google-calendar.js";

const SETTINGS_TOKEN =
  "Y181ZjhjYzIxZDg2NTQwMjMwZTQzMGNjNWQwZmRiNThjZGE1MjVjZmJmNjczZDg0YjFmMGJmNTk2ZDQwMWM4NTk0QGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20";
const CALENDAR_ID =
  "c_5f8cc21d86540230e430cc5d0fdb58cda525cfbf673d84b1f0bf596d401c8594@group.calendar.google.com";

describe("google calendar ids", () => {
  it("reads a calendar id from a settings link", () => {
    const link = `https://calendar.google.com/calendar/u/0/r/settings/calendar/${SETTINGS_TOKEN}`;
    assert.equal(normalizeCalendarId(link), CALENDAR_ID);
    assert.equal(normalizeCalendarId(CALENDAR_ID), CALENDAR_ID);
  });

  it("stores an event id with its content hash", () => {
    assert.deepEqual(parseCalendarLink("abc|deadbeef"), {
      id: "abc",
      hash: "deadbeef",
    });
    assert.equal(formatCalendarLink("abc", "deadbeef"), "abc|deadbeef");
    assert.equal(formatCalendarLink("", "deadbeef"), "");
    assert.equal(parseCalendarLink("staff note").id, "");
    assert.equal(calendarLinkValue("abc|deadbeef"), "abc|deadbeef");
    assert.equal(calendarLinkValue("Open decks at 16:00"), "");
  });
});

describe("google calendar event body", () => {
  it("uses the night title, guest, venue, and public copy", () => {
    const event = buildCalendarEvent({
      occurrenceId: "12",
      title: "Tuesday residency",
      artist: "Ada",
      offer: "House pours",
      description: "A long table.",
      nightSchedule: [
        { label: "Open decks", startTime: "16:00", endTime: "22:00" },
        { label: "Chess", startTime: "", endTime: "" },
      ],
      date: "2026-09-29",
      startTime: "18:00",
      endTime: "23:00",
      seriesSlug: "tuesday-residency",
    });
    assert.equal(event.summary, "Tuesday residency · Ada");
    assert.equal(event.location, CALENDAR_LOCATION);
    assert.equal(event.start.dateTime, "2026-09-29T18:00:00");
    assert.equal(event.start.timeZone, "Europe/London");
    assert.equal(event.end.dateTime, "2026-09-29T23:00:00");
    assert.match(event.description, /House pours/);
    assert.match(event.description, /16:00-22:00 Open decks/);
    assert.match(event.description, /Chess/);
    assert.match(
      event.description,
      /https:\/\/gwenda\.co\.uk\/whats-on\/tuesday-residency/,
    );
    assert.equal(event.extendedProperties.private.gwendaOccurrenceId, "12");
    assert.equal(calendarSummary("Tuesday residency", "Tuesday"), "Tuesday residency");
  });

  it("rolls an end time past midnight onto the next day", () => {
    const event = buildCalendarEvent({
      occurrenceId: "3",
      title: "Late",
      date: "2026-09-29",
      startTime: "22:00",
      endTime: "01:00",
    });
    assert.equal(event.end.dateTime, "2026-09-30T01:00:00");
  });

  it("changes the hash when the public copy changes", () => {
    const first = buildCalendarEvent({
      occurrenceId: "3",
      title: "Late",
      date: "2026-09-29",
      startTime: "18:00",
      endTime: "23:00",
    });
    const second = buildCalendarEvent({
      occurrenceId: "3",
      title: "Later",
      date: "2026-09-29",
      startTime: "18:00",
      endTime: "23:00",
    });
    assert.notEqual(calendarEventHash(first), calendarEventHash(second));
    assert.equal(calendarEventHash(first), calendarEventHash(first));
  });
});

describe("chooseCalendarEvent", () => {
  it("adopts the one event whose title matches the night", () => {
    const choice = chooseCalendarEvent(
      [
        { id: "a", summary: "Other" },
        { id: "b", summary: "Tuesday residency" },
      ],
      { summary: "Tuesday residency", seriesName: "Tuesday residency", occurrenceId: "9" },
    );
    assert.equal(choice.action, "adopt");
    assert.equal(choice.event.id, "b");
  });

  it("inserts when several events on that day share the title", () => {
    const choice = chooseCalendarEvent(
      [
        { id: "a", summary: "Tuesday residency" },
        { id: "b", summary: "Tuesday residency" },
      ],
      { summary: "Tuesday residency", seriesName: "Tuesday residency", occurrenceId: "9" },
    );
    assert.equal(choice.action, "insert");
    assert.equal(choice.ambiguous, true);
  });

  it("keeps the event already marked with this night", () => {
    const choice = chooseCalendarEvent(
      [
        {
          id: "owned",
          summary: "Renamed",
          extendedProperties: { private: { gwendaOccurrenceId: "9" } },
        },
      ],
      { summary: "Tuesday residency", seriesName: "Tuesday residency", occurrenceId: "9" },
    );
    assert.equal(choice.event.id, "owned");
  });

  it("recognises a London evening on that calendar date", () => {
    assert.equal(
      eventFallsOnDate(
        {
          start: {
            dateTime: "2026-09-29T17:00:00+01:00",
            timeZone: "Europe/London",
          },
        },
        "2026-09-29",
      ),
      true,
    );
  });
});
