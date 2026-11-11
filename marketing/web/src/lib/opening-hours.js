/**
 * Opening hours (#240): the week ops publishes (the Sanity document
 * `venueDetails`, its `openingHours`) and what the site says about it. Times are
 * London wall-clock "HH:MM"; a day that closes earlier than it opens closes
 * after midnight, in the small hours of the next day (Saturday 4pm–1am).
 *
 * The site is built ahead of time, so anything that depends on the moment
 * (open now, today's line) is worked out again in the visitor's browser
 * (scripts/opening-hours.js), always by the clock in London.
 *
 * No week, or one that doesn't add up, means nothing is said: never
 * invented hours. The document is read with the rest of the venue's
 * details (venue-details.js VENUE_DETAILS_QUERY); readWeek takes its week.
 */

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_NAMES = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const SHORT_NAMES = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** @typedef {{ day: string, closed: boolean, opens: string, closes: string }} OpeningDay */

function minutesOf(hhmm) {
  const [, hours, minutes] = TIME.exec(hhmm) || [];
  return Number(hours) * 60 + Number(minutes);
}

function readDay(raw) {
  if (!raw || typeof raw !== "object" || !DAYS.includes(raw.day)) return null;
  if (raw.closed === true) {
    return { day: raw.day, closed: true, opens: "", closes: "" };
  }
  const opens = String(raw.opens ?? "");
  const closes = String(raw.closes ?? "");
  if (!TIME.test(opens) || !TIME.test(closes) || opens === closes) return null;
  return { day: raw.day, closed: false, opens, closes };
}

/**
 * The week as Sanity holds it → seven days, Monday first; null when it is
 * missing, a day is missing or twice, or a day's times don't add up.
 * @returns {OpeningDay[] | null}
 */
export function readWeek(days) {
  if (!Array.isArray(days) || days.length !== DAYS.length) return null;
  const byDay = new Map();
  for (const raw of days) {
    const day = readDay(raw);
    if (!day || byDay.has(day.day)) return null;
    byDay.set(day.day, day);
  }
  return DAYS.map((key) => byDay.get(key));
}

function pastMidnight(day) {
  return minutesOf(day.closes) <= minutesOf(day.opens);
}

/** "17:00" → "5pm", "22:30" → "10:30pm", "01:00" → "1am", "00:00" → "midnight". */
export function timeText(hhmm) {
  const total = minutesOf(hhmm);
  if (total === 0) return "midnight";
  if (total === 12 * 60) return "midday";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const clock = `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
  return `${clock}${hours < 12 ? "am" : "pm"}`;
}

/** An open day's hours: "5–10:30pm", or "4pm–1am" when the two halves differ. */
export function hoursText(day) {
  const opens = timeText(day.opens);
  const closes = timeText(day.closes);
  const bothPm =
    opens.endsWith("pm") &&
    closes.endsWith("pm") &&
    minutesOf(day.closes) > minutesOf(day.opens);
  return bothPm ? `${opens.slice(0, -2)}–${closes}` : `${opens}–${closes}`;
}

const londonClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The day and minute of the day in London at `now`. */
function inLondon(now) {
  const parts = Object.fromEntries(
    londonClock.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    day: DAYS.find((key) => SHORT_NAMES[key] === parts.weekday),
    minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

function dayAfter(key, steps = 1) {
  return DAYS[(DAYS.indexOf(key) + steps) % DAYS.length];
}

function dayOf(week, key) {
  return week.find((day) => day.day === key);
}

/**
 * Open at `now`? While a night runs past midnight it is still that night:
 * at 00:30 on Sunday it is Saturday's, open till 1am.
 * @returns {{ open: true, day: string, closes: string } | { open: false }}
 */
export function openNow(week, now = new Date()) {
  if (!week) return { open: false };
  const { day: todayKey, minute } = inLondon(now);
  const yesterday = dayOf(week, dayAfter(todayKey, DAYS.length - 1));
  if (
    !yesterday.closed &&
    pastMidnight(yesterday) &&
    minute < minutesOf(yesterday.closes)
  ) {
    return { open: true, day: yesterday.day, closes: yesterday.closes };
  }
  const today = dayOf(week, todayKey);
  if (today.closed || minute < minutesOf(today.opens)) return { open: false };
  if (pastMidnight(today) || minute < minutesOf(today.closes)) {
    return { open: true, day: today.day, closes: today.closes };
  }
  return { open: false };
}

/** The next day that opens, after today. */
function nextOpenDay(week, todayKey) {
  for (let step = 1; step <= DAYS.length; step += 1) {
    const day = dayOf(week, dayAfter(todayKey, step));
    if (!day.closed) return day;
  }
  return null;
}

/**
 * Today in a line, as of `now`: "Open today 5–10:30pm", "Open now till
 * 1am", "Closed today, open Tuesday from 5pm", "Closed now, open Wednesday
 * from 5pm". Empty without a week.
 */
export function todayLine(week, now = new Date()) {
  if (!week) return "";
  const open = openNow(week, now);
  if (open.open) return `Open now till ${timeText(open.closes)}`;
  const { day: todayKey, minute } = inLondon(now);
  const today = dayOf(week, todayKey);
  if (!today.closed && minute < minutesOf(today.opens)) {
    return `Open today ${hoursText(today)}`;
  }
  const next = nextOpenDay(week, todayKey);
  const closed = today.closed ? "Closed today" : "Closed now";
  return next
    ? `${closed}, open ${DAY_NAMES[next.day]} from ${timeText(next.opens)}`
    : "Closed today";
}

function sameHours(a, b) {
  return a.closed === b.closed && a.opens === b.opens && a.closes === b.closes;
}

/** Neighbouring days with the same hours, Monday first. */
function runs(week) {
  const out = [];
  for (const day of week) {
    const last = out[out.length - 1];
    if (last && sameHours(last[0], day)) last.push(day);
    else out.push([day]);
  }
  return out;
}

/**
 * The week as a table: [{ days: "Wed–Thu", hours: "5–10:30pm", closed }],
 * Monday first, neighbouring days with the same hours together.
 */
export function weekRows(week) {
  if (!week) return [];
  return runs(week).map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    return {
      days:
        run.length > 1
          ? `${SHORT_NAMES[first.day]}–${SHORT_NAMES[last.day]}`
          : SHORT_NAMES[first.day],
      hours: first.closed ? "Closed" : hoursText(first),
      closed: first.closed,
    };
  });
}

/** The days it's shut, for "Shut Mondays": "Mondays", "Mondays and Tuesdays", or "". */
export function closedDays(week) {
  if (!week) return "";
  const names = week
    .filter((day) => day.closed)
    .map((day) => `${DAY_NAMES[day.day]}s`);
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * schema.org openingHoursSpecification: one entry per run of days with the
 * same hours, closed days left out. A night past midnight closes earlier
 * than it opens, on its own day's entry (Saturday closes "01:00").
 */
export function openingHoursSpecification(week) {
  if (!week) return [];
  return runs(week)
    .filter((run) => !run[0].closed)
    .map((run) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: run.map((day) => DAY_NAMES[day.day]),
      opens: run[0].opens,
      closes: run[0].closes,
    }));
}
