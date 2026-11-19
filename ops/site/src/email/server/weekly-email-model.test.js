/** The monthly email's rules: settings, when it's due (London wall clock), and test limits. */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_SEND,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  isStuck,
  londonNow,
  monthStart,
  nextMonthStart,
  scheduleAt,
  scheduledFor,
  settingsChange,
  settingsFromValues,
  testLimitReason,
} from "./weekly-email-model.js";

describe("monthly email settings", () => {
  it("with nothing set: off; Tuesday 11:00; sends by itself once switched on", () => {
    assert.deepEqual(settingsFromValues({}), { sending: false, mode: "auto", day: "tue", time: "11:00", notify: [] });
    assert.deepEqual(DEFAULT_SEND, { day: "tue", time: "11:00" });
    assert.equal(DEFAULT_SETTINGS.day, DEFAULT_SEND.day);
    assert.equal(DEFAULT_SETTINGS.time, DEFAULT_SEND.time);
  });

  it("only the exact word on switches it on", () => {
    for (const value of ["", "off", "true", "yes", "1", "On please", "enabled"]) {
      assert.equal(settingsFromValues({ [SETTING_KEYS.sending]: value }).sending, false, value);
    }
    assert.equal(settingsFromValues({ [SETTING_KEYS.sending]: " ON " }).sending, true);
  });

  it("reads the mode, day, time and who to tell, and ignores nonsense", () => {
    assert.deepEqual(
      settingsFromValues({
        [SETTING_KEYS.mode]: "approve",
        [SETTING_KEYS.day]: "Thu",
        [SETTING_KEYS.time]: "09:30",
        [SETTING_KEYS.notify]: "A@example.com, b@example.com; nonsense",
      }),
      { sending: false, mode: "approve", day: "thu", time: "09:30", notify: ["a@example.com", "b@example.com"] },
    );
    const odd = settingsFromValues({ [SETTING_KEYS.mode]: "whenever", [SETTING_KEYS.day]: "someday", [SETTING_KEYS.time]: "25:00" });
    assert.deepEqual([odd.mode, odd.day, odd.time], ["auto", "tue", "11:00"]);
  });

  it("checks a change before it's stored", () => {
    assert.deepEqual(settingsChange({ sending: true, mode: "approve", day: "wed", time: "10:15", notify: "A@example.com b@example.com" }), {
      [SETTING_KEYS.sending]: "on",
      [SETTING_KEYS.mode]: "approve",
      [SETTING_KEYS.day]: "wed",
      [SETTING_KEYS.time]: "10:15",
      [SETTING_KEYS.notify]: "a@example.com, b@example.com",
    });
    assert.deepEqual(settingsChange({ sending: false }), { [SETTING_KEYS.sending]: "off" });
    assert.deepEqual(settingsChange({}), {});
    for (const bad of [{ sending: "on" }, { mode: "now" }, { day: "monday" }, { time: "9am" }, { time: "24:00" }, { notify: "not-an-address" }]) {
      assert.throws(() => settingsChange(bad), (error) => error.status === 400, JSON.stringify(bad));
    }
  });
});

describe("monthly email schedule: the first of a weekday, 11:00 on the clock in London", () => {
  const monday11 = { ...DEFAULT_SETTINGS, day: "mon", time: "11:00" };
  const byDefault = { ...DEFAULT_SETTINGS };

  it("finds the first of a weekday in a month", () => {
    assert.equal(monthStart("2026-12-17"), "2026-12-01");
    assert.equal(nextMonthStart("2026-12-01"), "2027-01-01");
    // December 2026 begins on a Tuesday.
    assert.deepEqual(scheduledFor("2026-12-01", byDefault), { date: "2026-12-01", time: "11:00" });
    assert.deepEqual(scheduledFor("2026-12-01", monday11), { date: "2026-12-07", time: "11:00" });
    assert.deepEqual(scheduledFor("2027-01-01", byDefault), { date: "2027-01-05", time: "11:00" });
    assert.deepEqual(scheduledFor("2026-11-01", { ...DEFAULT_SETTINGS, day: "sun" }), { date: "2026-11-01", time: "11:00" });
  });

  it("by default it's due on the month's first Tuesday at 11:00", () => {
    const at = (iso) => scheduleAt(byDefault, new Date(iso));
    assert.deepEqual(at("2026-11-02T11:00:00Z"), {
      month: "2026-11-01",
      state: "before",
      scheduled: { date: "2026-11-03", time: "11:00" },
      next: { date: "2026-11-03", time: "11:00" },
    });
    assert.equal(at("2026-11-03T10:59:00Z").state, "before");
    assert.equal(at("2026-11-03T11:00:00Z").state, "due");
    assert.equal(at("2026-11-03T17:00:00Z").state, "due");
    assert.equal(at("2026-11-03T17:01:00Z").state, "missed");
    assert.deepEqual(at("2026-11-03T17:01:00Z").next, { date: "2026-12-01", time: "11:00" });
    // The later Tuesdays of the month are nothing to it.
    assert.equal(at("2026-11-10T11:00:00Z").state, "missed");
  });

  it("the default first Tuesday 11:00, in summer and winter", () => {
    const at = (iso) => scheduleAt(byDefault, new Date(iso)).state;
    // Tuesday 7 April 2026, summer time: 11:00 is 10:00 UTC.
    assert.deepEqual([at("2026-04-07T09:59:00Z"), at("2026-04-07T10:00:00Z")], ["before", "due"]);
    // Tuesday 3 March, winter: 11:00 UTC.
    assert.deepEqual([at("2026-03-03T10:59:00Z"), at("2026-03-03T11:00:00Z")], ["before", "due"]);
    // Tuesday 6 October 2026, still summer: 10:00 UTC.
    assert.deepEqual([at("2026-10-06T09:59:00Z"), at("2026-10-06T10:00:00Z")], ["before", "due"]);
    // Tuesday 3 November, winter again: 11:00 UTC.
    assert.deepEqual([at("2026-11-03T10:59:00Z"), at("2026-11-03T11:00:00Z")], ["before", "due"]);
  });

  it("knows the London wall clock, winter and summer", () => {
    assert.deepEqual(londonNow(new Date("2026-11-09T11:02:00Z")), { date: "2026-11-09", time: "11:02" });
    assert.deepEqual(londonNow(new Date("2026-07-06T10:02:00Z")), { date: "2026-07-06", time: "11:02" });
    assert.deepEqual(londonNow(new Date("2026-07-05T23:30:00Z")), { date: "2026-07-06", time: "00:30" });
  });

  it("a first-Monday 11:00 send: before, then due for six hours, then missed", () => {
    const at = (iso) => scheduleAt(monday11, new Date(iso));
    assert.deepEqual(at("2026-12-07T10:59:00Z"), {
      month: "2026-12-01",
      state: "before",
      scheduled: { date: "2026-12-07", time: "11:00" },
      next: { date: "2026-12-07", time: "11:00" },
    });
    assert.equal(at("2026-12-07T11:00:00Z").state, "due");
    assert.equal(at("2026-12-07T17:00:00Z").state, "due");
    assert.deepEqual(at("2026-12-07T17:01:00Z"), {
      month: "2026-12-01",
      state: "missed",
      scheduled: { date: "2026-12-07", time: "11:00" },
      next: { date: "2027-01-04", time: "11:00" },
    });
    // New Year's Eve still belongs to December.
    assert.equal(at("2026-12-31T23:59:00Z").month, "2026-12-01");
    assert.equal(at("2027-01-01T00:00:00Z").month, "2027-01-01");
    assert.equal(at("2027-01-01T00:00:00Z").state, "before");
  });

  it("another day and time", () => {
    const thursday = { ...DEFAULT_SETTINGS, day: "thu", time: "16:30" };
    assert.deepEqual(scheduleAt(thursday, new Date("2026-12-01T12:00:00Z")).next, { date: "2026-12-03", time: "16:30" });
    assert.equal(scheduleAt(thursday, new Date("2026-12-03T16:30:00Z")).state, "due");
  });

  it("set to Mondays, in summer: 11:00 is 10:00 UTC", () => {
    // Monday 6 April 2026, the first Monday after the clocks went forward.
    assert.equal(scheduleAt(monday11, new Date("2026-04-06T09:59:00Z")).state, "before");
    assert.equal(scheduleAt(monday11, new Date("2026-04-06T10:00:00Z")).state, "due");
    // Monday 2 March, winter: 11:00 UTC.
    assert.equal(scheduleAt(monday11, new Date("2026-03-02T10:59:00Z")).state, "before");
    assert.equal(scheduleAt(monday11, new Date("2026-03-02T11:00:00Z")).state, "due");
  });

  it("a first-Sunday send goes by the wall clock too", () => {
    const sunday = { ...DEFAULT_SETTINGS, day: "sun", time: "11:00" };
    // Sunday 5 April 2026, summer: 10:00 UTC.
    assert.equal(scheduleAt(sunday, new Date("2026-04-05T09:59:00Z")).state, "before");
    assert.equal(scheduleAt(sunday, new Date("2026-04-05T10:00:00Z")).state, "due");
    // Sunday 1 November 2026, winter: 11:00 UTC.
    assert.equal(scheduleAt(sunday, new Date("2026-11-01T10:59:00Z")).state, "before");
    assert.equal(scheduleAt(sunday, new Date("2026-11-01T11:00:00Z")).state, "due");
  });
});

describe("monthly email: cut-off runs and test limits", () => {
  it("a run is stuck after two minutes preparing or sending, never otherwise", () => {
    const now = new Date("2026-11-09T11:10:00Z");
    const run = (status, updatedAt) => ({ status, updatedAt });
    assert.equal(isStuck(run("sending", "2026-11-09T11:07:59Z"), now), true);
    assert.equal(isStuck(run("sending", "2026-11-09T11:09:00Z"), now), false);
    assert.equal(isStuck(run("preparing", "2026-11-09T11:00:00Z"), now), true);
    assert.equal(isStuck(run("waiting", "2026-11-09T09:00:00Z"), now), false);
    assert.equal(isStuck(null, now), false);
  });

  it("limits tests per person and overall", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const ago = (minutes, email = "someone@example.com") => ({ email, sentAt: new Date(now.getTime() - minutes * 60_000).toISOString() });
    assert.equal(testLimitReason([], "someone@example.com", now), "");
    assert.match(testLimitReason([ago(0.5)], "Someone@Example.com", now), /Give it a minute/);
    assert.equal(testLimitReason([ago(0.5, "other@example.com")], "someone@example.com", now), "");
    assert.match(testLimitReason([2, 10, 20, 30, 40].map((m) => ago(m)), "someone@example.com", now), /five tests in an hour/);
    const crowd = Array.from({ length: 20 }, (_, i) => ago(100 + i, `p${i}@example.com`));
    assert.match(testLimitReason(crowd, "someone@example.com", now), /enough tests for today/);
  });
});
