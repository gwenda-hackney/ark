/** The weekly email's rules: settings, when it's due (London wall clock), and test limits. */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_SEND,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  isStuck,
  londonNow,
  scheduleAt,
  settingsChange,
  settingsFromValues,
  testLimitReason,
} from "./weekly-email-model.js";

describe("weekly email settings", () => {
  it("with nothing set: off; Monday 11:00; sends by itself once switched on", () => {
    assert.deepEqual(settingsFromValues({}), { sending: false, mode: "auto", day: "mon", time: "11:00", notify: [] });
    assert.deepEqual(DEFAULT_SEND, { day: "mon", time: "11:00" });
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
    assert.deepEqual([odd.mode, odd.day, odd.time], ["auto", "mon", "11:00"]);
  });

  it("checks a change before it's stored", () => {
    assert.deepEqual(settingsChange({ sending: true, mode: "approve", day: "tue", time: "10:15", notify: "A@example.com b@example.com" }), {
      [SETTING_KEYS.sending]: "on",
      [SETTING_KEYS.mode]: "approve",
      [SETTING_KEYS.day]: "tue",
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

describe("weekly email schedule: 11:00 means 11:00 on the clock in London", () => {
  const monday11 = { ...DEFAULT_SETTINGS };

  it("knows the London wall clock, winter and summer", () => {
    assert.deepEqual(londonNow(new Date("2026-11-09T11:02:00Z")), { date: "2026-11-09", time: "11:02" });
    assert.deepEqual(londonNow(new Date("2026-07-06T10:02:00Z")), { date: "2026-07-06", time: "11:02" });
    assert.deepEqual(londonNow(new Date("2026-07-05T23:30:00Z")), { date: "2026-07-06", time: "00:30" });
  });

  it("is before, then due for six hours, then missed", () => {
    const at = (iso) => scheduleAt(monday11, new Date(iso));
    assert.deepEqual(at("2026-11-09T10:59:00Z"), {
      week: "2026-11-09",
      state: "before",
      scheduled: { date: "2026-11-09", time: "11:00" },
      next: { date: "2026-11-09", time: "11:00" },
    });
    assert.equal(at("2026-11-09T11:00:00Z").state, "due");
    assert.equal(at("2026-11-09T17:00:00Z").state, "due");
    assert.deepEqual(at("2026-11-09T17:01:00Z"), {
      week: "2026-11-09",
      state: "missed",
      scheduled: { date: "2026-11-09", time: "11:00" },
      next: { date: "2026-11-16", time: "11:00" },
    });
    // Sunday night still belongs to the week that began on Monday.
    assert.equal(at("2026-11-15T23:59:00Z").week, "2026-11-09");
    assert.equal(at("2026-11-16T00:00:00Z").week, "2026-11-16");
    assert.equal(at("2026-11-16T00:00:00Z").state, "before");
  });

  it("another day and time", () => {
    const thursday = { ...DEFAULT_SETTINGS, day: "thu", time: "16:30" };
    assert.deepEqual(scheduleAt(thursday, new Date("2026-11-09T12:00:00Z")).next, { date: "2026-11-12", time: "16:30" });
    assert.equal(scheduleAt(thursday, new Date("2026-11-12T16:30:00Z")).state, "due");
  });

  it("after the clocks go forward (29 March 2026), Monday 11:00 is 10:00 UTC", () => {
    assert.equal(scheduleAt(monday11, new Date("2026-03-30T09:59:00Z")).state, "before");
    assert.equal(scheduleAt(monday11, new Date("2026-03-30T10:00:00Z")).state, "due");
    // The Monday before, still winter time: 11:00 UTC.
    assert.equal(scheduleAt(monday11, new Date("2026-03-23T10:59:00Z")).state, "before");
    assert.equal(scheduleAt(monday11, new Date("2026-03-23T11:00:00Z")).state, "due");
  });

  it("after the clocks go back (25 October 2026), Monday 11:00 is 11:00 UTC", () => {
    assert.equal(scheduleAt(monday11, new Date("2026-10-26T10:59:00Z")).state, "before");
    assert.equal(scheduleAt(monday11, new Date("2026-10-26T11:00:00Z")).state, "due");
    // The Monday before, still summer time: 10:00 UTC.
    assert.equal(scheduleAt(monday11, new Date("2026-10-19T09:59:00Z")).state, "before");
    assert.equal(scheduleAt(monday11, new Date("2026-10-19T10:00:00Z")).state, "due");
  });

  it("on the Sundays the clocks change, a Sunday send still goes by the wall clock", () => {
    const sunday = { ...DEFAULT_SETTINGS, day: "sun", time: "11:00" };
    // 29 March: 11:00 BST is 10:00 UTC. The week is the one that began on Monday 23rd.
    assert.equal(scheduleAt(sunday, new Date("2026-03-29T09:59:00Z")).state, "before");
    assert.deepEqual(
      [scheduleAt(sunday, new Date("2026-03-29T10:00:00Z")).state, scheduleAt(sunday, new Date("2026-03-29T10:00:00Z")).week],
      ["due", "2026-03-23"],
    );
    // 25 October: 11:00 GMT is 11:00 UTC.
    assert.equal(scheduleAt(sunday, new Date("2026-10-25T10:59:00Z")).state, "before");
    assert.equal(scheduleAt(sunday, new Date("2026-10-25T11:00:00Z")).state, "due");
    // A time in the hour that happens twice (01:30 on 25 October) is due once it first comes round.
    const small = { ...DEFAULT_SETTINGS, day: "sun", time: "01:30" };
    assert.equal(scheduleAt(small, new Date("2026-10-25T00:29:00Z")).state, "before");
    assert.equal(scheduleAt(small, new Date("2026-10-25T00:30:00Z")).state, "due");
    assert.equal(scheduleAt(small, new Date("2026-10-25T01:30:00Z")).state, "due");
  });
});

describe("weekly email: cut-off runs and test limits", () => {
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
