/**
 * The weekly "what's on" email as ops sees it (#240): its settings, when
 * it's due, and what can happen to a week's email. Plain objects and rules;
 * no I/O, no tables, no Mailchimp.
 *
 * A week is named by its Monday in London ("2026-11-09"); weeks at the bar
 * run Monday to Sunday (marketing/web/src/lib/london-day.js).
 */
import { weekStart } from "../../../../../marketing/web/src/lib/london-day.js";

// ------------------------------------------------------------- settings

/** The settings' names in the config database (shared/config.js SETTINGS). */
export const SETTING_KEYS = {
  sending: "weekly_email.sending",
  mode: "weekly_email.mode",
  day: "weekly_email.day",
  time: "weekly_email.time",
  notify: "weekly_email.notify_emails",
};

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const MODES = ["approve", "auto"];

/** When the email goes out unless the settings say otherwise: the one place this default lives. */
export const DEFAULT_SEND = Object.freeze({ day: "tue", time: "11:00" });

/**
 * With nothing set: off. Once an admin switches it on, it sends by itself at
 * its time, Tuesday late morning (the venue is shut on Mondays, so the week's
 * first night is still ahead), unless an admin has asked to approve each one
 * first. The email covers Monday to Sunday of the week it's sent in.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  sending: false,
  mode: "auto",
  day: DEFAULT_SEND.day,
  time: DEFAULT_SEND.time,
  notify: Object.freeze([]),
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function parseEmails(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/);
  return [...new Set(list.map((email) => String(email).trim().toLowerCase()).filter(Boolean))];
}

/**
 * Settings from stored values (key → string). Anything missing or odd falls
 * to the defaults: only the exact word "on" switches sending on (the switch
 * that matters), and only "approve" makes each one wait for an admin.
 */
export function settingsFromValues(values = {}) {
  const read = (key) => String(values?.[SETTING_KEYS[key]] ?? "").trim().toLowerCase();
  return {
    sending: read("sending") === "on",
    mode: read("mode") === "approve" ? "approve" : "auto",
    day: DAYS.includes(read("day")) ? read("day") : DEFAULT_SETTINGS.day,
    time: TIME.test(read("time")) ? read("time") : DEFAULT_SETTINGS.time,
    notify: parseEmails(values?.[SETTING_KEYS.notify]).filter((email) => EMAIL.test(email)),
  };
}

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/**
 * A change to the settings, checked, as stored values (key → string). Only
 * the fields given. Throws a 400 that says what's wrong.
 */
export function settingsChange(patch = {}) {
  const out = {};
  if (patch.sending !== undefined) {
    if (typeof patch.sending !== "boolean") throw invalid("Sending is on or off.");
    out[SETTING_KEYS.sending] = patch.sending ? "on" : "off";
  }
  if (patch.mode !== undefined) {
    if (!MODES.includes(patch.mode)) throw invalid("Choose approve first or send automatically.");
    out[SETTING_KEYS.mode] = patch.mode;
  }
  if (patch.day !== undefined) {
    if (!DAYS.includes(patch.day)) throw invalid("Choose a day of the week.");
    out[SETTING_KEYS.day] = patch.day;
  }
  if (patch.time !== undefined) {
    if (!TIME.test(String(patch.time))) throw invalid("Give the time as HH:MM, like 10:00.");
    out[SETTING_KEYS.time] = String(patch.time);
  }
  if (patch.notify !== undefined) {
    const emails = parseEmails(patch.notify);
    const bad = emails.find((email) => !EMAIL.test(email));
    if (bad) throw invalid(`"${bad}" isn't an email address.`);
    out[SETTING_KEYS.notify] = emails.join(", ");
  }
  return out;
}

// ------------------------------------------------------------- schedule

/** How long after its time a week's email can still start by itself. */
export const GRACE_HOURS = 6;

/** The wall clock in London: { date: "2026-11-10", time: "10:05" }. */
export function londonNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(dateIso, days) {
  const [year, month, day] = String(dateIso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Minutes on the wall clock, for comparing two London moments (never across a clock change by more than an hour). */
function wallMinutes({ date, time }) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) / 60000;
}

/** When a week's email is due: the settings' day and time in that week. */
export function scheduledFor(weekStartIso, settings) {
  return { date: addDays(weekStartIso, DAYS.indexOf(settings.day)), time: settings.time };
}

/**
 * Where this moment sits against this week's time:
 *   before  it hasn't come yet
 *   due     it has, within the last GRACE_HOURS: the schedule may start it
 *   missed  it passed longer ago (sending was switched on mid-week, or ops
 *           was down): the schedule leaves the week alone, so switching on
 *           on a Thursday never sends Tuesday's email by surprise
 * `next` is the next time the schedule could start one.
 *
 * @returns {{ week: string, state: "before" | "due" | "missed",
 *   scheduled: { date: string, time: string }, next: { date: string, time: string } }}
 */
export function scheduleAt(settings, now = new Date()) {
  const clock = londonNow(now);
  const week = weekStart(clock.date);
  const scheduled = scheduledFor(week, settings);
  const late = wallMinutes(clock) - wallMinutes(scheduled);
  const state = late < 0 ? "before" : late <= GRACE_HOURS * 60 ? "due" : "missed";
  return {
    week,
    state,
    scheduled,
    next: state === "before" ? scheduled : scheduledFor(addDays(week, 7), settings),
  };
}

// ----------------------------------------------------------- a week's run

/**
 * preparing  claimed; the email is being built and its Mailchimp draft made
 * waiting    the draft is ready and waits for an admin's Approve and send
 * sending    a send was started; nothing else may start one
 * sent       it went to the list
 * skipped    not sent on purpose (`reason`: no nights that week)
 * failed     something went wrong (`reason`); an admin can try again
 */
export const WEEKLY_EMAIL_STATUSES = ["preparing", "waiting", "sending", "sent", "skipped", "failed"];

/** Who started a run: the schedule, or an admin by hand. */
export const STARTED_BY = ["schedule", "manual"];

const text = (value) => String(value ?? "").trim();

/** One week's email, as every adapter keeps it. */
export function weekRun(fields = {}) {
  return {
    id: fields.id == null ? null : Number(fields.id),
    weekStart: text(fields.weekStart),
    attempt: Math.max(1, Number(fields.attempt) || 1),
    status: WEEKLY_EMAIL_STATUSES.includes(fields.status) ? fields.status : "preparing",
    startedBy: STARTED_BY.includes(fields.startedBy) ? fields.startedBy : "schedule",
    subject: text(fields.subject),
    preheader: text(fields.preheader),
    campaignId: text(fields.campaignId),
    campaignWebId: text(fields.campaignWebId),
    recipients: Math.max(0, Number(fields.recipients) || 0),
    reason: text(fields.reason),
    approvedBy: text(fields.approvedBy).toLowerCase(),
    createdAt: text(fields.createdAt),
    updatedAt: text(fields.updatedAt),
    sentAt: text(fields.sentAt) || null,
  };
}

/** A run that hasn't moved for this long was cut off mid-step (a Worker that died). */
export const STUCK_AFTER_MS = 2 * 60 * 1000;

export function isStuck(run, now = new Date()) {
  if (run?.status !== "preparing" && run?.status !== "sending") return false;
  return now.getTime() - Date.parse(run.updatedAt) > STUCK_AFTER_MS;
}

// ------------------------------------------------------------ test emails

/** One test a minute and five an hour each; twenty a day between everyone. */
export const TEST_LIMITS = { perMinute: 1, perHour: 5, everyonePerDay: 20 };

/**
 * Why this person can't send a test right now, or "" when they can.
 * @param {{ email: string, sentAt: string }[]} tests the last day's
 */
export function testLimitReason(tests, email, now = new Date()) {
  const mine = tests.filter((test) => test.email.toLowerCase() === String(email).toLowerCase());
  const within = (list, ms) => list.filter((test) => now.getTime() - Date.parse(test.sentAt) < ms).length;
  if (within(mine, 60_000) >= TEST_LIMITS.perMinute) return "You've just sent yourself one. Give it a minute.";
  if (within(mine, 3_600_000) >= TEST_LIMITS.perHour) return "That's five tests in an hour. Try again later.";
  if (within(tests, 86_400_000) >= TEST_LIMITS.everyonePerDay) return "That's enough tests for today. Try again tomorrow.";
  return "";
}
