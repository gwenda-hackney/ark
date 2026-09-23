/**
 * Expand an ops event rule into calendar dates.
 * One rule per event: every N days, every N weeks on chosen weekdays,
 * or every N months on a day of the month.
 */

export const HORIZON_DAYS = 84;
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const WEEKDAY_INDEX = new Map(WEEKDAYS.map((key, index) => [key, index]));

export function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso(now = new Date()) {
  return formatIsoDate(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/** Monday = 0 … Sunday = 6. */
function weekdayIndex(date) {
  const day = date.getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function mondayOf(date) {
  return addDays(date, -weekdayIndex(date));
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function normalizeWeekdays(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[^a-z]+/i)
        .filter(Boolean);
  const seen = new Set();
  const days = [];
  for (const item of raw) {
    const key = String(item).trim().toLowerCase().slice(0, 3);
    if (!WEEKDAY_INDEX.has(key) || seen.has(key)) continue;
    seen.add(key);
    days.push(key);
  }
  return days.sort((a, b) => WEEKDAY_INDEX.get(a) - WEEKDAY_INDEX.get(b));
}

function normalizeIsoDateList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const seen = new Set();
  const dates = [];
  for (const item of raw) {
    const date = parseIsoDate(item);
    if (!date) continue;
    const iso = formatIsoDate(date);
    if (seen.has(iso)) continue;
    seen.add(iso);
    dates.push(iso);
  }
  return dates.sort();
}

/** ISO dates removed from a series without ending the recurrence. */
export function normalizeSkippedDates(value) {
  return normalizeIsoDateList(value);
}

/** One-off nights kept on a series outside the recurrence rule (e.g. a moved date). */
export function normalizeExtraDates(value) {
  return normalizeIsoDateList(value);
}

function finalizeDates(dates, rule, { from, to } = {}) {
  const merged = new Set(dates);
  for (const extra of normalizeExtraDates(rule?.extraDates)) {
    if (from && extra < from) continue;
    if (to && extra > to) continue;
    merged.add(extra);
  }
  const skipped = new Set(normalizeSkippedDates(rule?.skippedDates));
  return [...merged].filter((date) => !skipped.has(date)).sort();
}

function repeatEvery(rule) {
  const every = Math.floor(Number(rule?.repeatEvery) || 1);
  return every >= 1 ? every : 1;
}

function windowEnd(today, endsOn, horizonDays) {
  const cap = addDays(today, horizonDays);
  if (!endsOn) return cap;
  return endsOn < cap ? endsOn : cap;
}

/**
 * Dates to publish, from today through 12 weeks (or Ends on, if sooner).
 * A one-off date is included whenever it is still today or later, even past
 * the rolling window. Open series stay inside the window.
 *
 * @param {{
 *   startsOn?: string,
 *   repeatUnit?: string,
 *   repeatEvery?: number,
 *   weekdays?: string[] | string,
 *   monthDay?: number,
 *   endsOn?: string,
 * }} rule
 * @param {{ today?: string, horizonDays?: number }} [options]
 */
export function expandOccurrenceDates(rule, { today, horizonDays = HORIZON_DAYS } = {}) {
  const start = parseIsoDate(rule?.startsOn);
  const todayDate = parseIsoDate(today) || parseIsoDate(todayIso());
  if (!start || !todayDate) return [];

  const unit = String(rule?.repeatUnit || "none").trim().toLowerCase();
  const endsOn = parseIsoDate(rule?.endsOn);
  if (endsOn && endsOn < start) return [];

  const todayIsoValue = formatIsoDate(todayDate);

  if (unit === "none" || unit === "") {
    if (start < todayDate) {
      return finalizeDates([], rule, { from: todayIsoValue });
    }
    if (endsOn && start > endsOn) return [];
    return finalizeDates([formatIsoDate(start)], rule, {
      from: todayIsoValue,
      to: endsOn ? formatIsoDate(endsOn) : undefined,
    });
  }

  const last = windowEnd(todayDate, endsOn, horizonDays);
  if (last < todayDate || last < start) {
    return finalizeDates([], rule, {
      from: todayIsoValue,
      to: formatIsoDate(last),
    });
  }
  const every = repeatEvery(rule);
  const dates = [];
  const lastIso = formatIsoDate(last);

  if (unit === "day") {
    let cursor = start > todayDate ? start : todayDate;
    const shift = daysBetween(start, cursor) % every;
    if (shift) cursor = addDays(cursor, every - shift);
    while (cursor <= last) {
      dates.push(formatIsoDate(cursor));
      cursor = addDays(cursor, every);
    }
    return finalizeDates(dates, rule, { from: todayIsoValue, to: lastIso });
  }

  if (unit === "week") {
    const days = normalizeWeekdays(rule?.weekdays);
    if (!days.length) {
      return finalizeDates([], rule, { from: todayIsoValue, to: lastIso });
    }
    const anchor = mondayOf(start);
    let cursor = start > todayDate ? start : todayDate;
    while (cursor <= last) {
      const weeks = Math.floor(daysBetween(anchor, mondayOf(cursor)) / 7);
      const key = WEEKDAYS[weekdayIndex(cursor)];
      if (weeks >= 0 && weeks % every === 0 && days.includes(key)) {
        dates.push(formatIsoDate(cursor));
      }
      cursor = addDays(cursor, 1);
    }
    return finalizeDates(dates, rule, { from: todayIsoValue, to: lastIso });
  }

  if (unit === "month") {
    const monthDay = Math.floor(Number(rule?.monthDay) || start.getUTCDate());
    if (monthDay < 1 || monthDay > 31) {
      return finalizeDates([], rule, { from: todayIsoValue, to: lastIso });
    }
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth();
    for (let guard = 0; guard < 240; guard += 1) {
      const monthsFromStart =
        (year - start.getUTCFullYear()) * 12 + (month - start.getUTCMonth());
      if (monthsFromStart >= 0 && monthsFromStart % every === 0) {
        if (monthDay <= daysInMonth(year, month)) {
          const date = new Date(Date.UTC(year, month, monthDay));
          if (date >= start && date >= todayDate && date <= last) {
            dates.push(formatIsoDate(date));
          }
        }
      }
      const monthStart = new Date(Date.UTC(year, month, 1));
      if (monthStart > last && monthsFromStart > 0) break;
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return finalizeDates(dates, rule, { from: todayIsoValue, to: lastIso });
  }

  return [];
}

/** Materialize the complete series from its start through its required end. */
export function expandSeriesOccurrenceDates(rule) {
  const start = parseIsoDate(rule?.startsOn);
  const startIso = start ? formatIsoDate(start) : "";
  const unit = String(rule?.repeatUnit || "none").trim().toLowerCase();
  if (unit === "none" || unit === "") {
    // Scheduled / one-off: starts on (if set) plus any extra dates.
    // Starts on may be empty for an open series with no nights yet.
    return finalizeDates(startIso ? [startIso] : [], rule, {});
  }
  if (!start) return [];
  const end = parseIsoDate(rule?.endsOn);
  if (!end || end < start) return [];
  return expandOccurrenceDates(rule, {
    today: startIso,
    horizonDays: daysBetween(start, end),
  });
}

/**
 * Plan how to move one night without changing the recurrence window.
 * Returns skipped/extra date lists to write back onto the series.
 */
export function planOccurrenceMove(event, fromDate, toDate) {
  const from = parseIsoDate(fromDate) ? String(fromDate).slice(0, 10) : "";
  const to = parseIsoDate(toDate) ? String(toDate).slice(0, 10) : "";
  if (!from || !to) {
    return { ok: false, error: "Date is not valid." };
  }
  if (from === to) {
    return {
      ok: true,
      unchanged: true,
      from,
      to,
      startsOn: event?.startsOn || "",
      skippedDates: normalizeSkippedDates(event?.skippedDates),
      extraDates: normalizeExtraDates(event?.extraDates),
    };
  }
  const unit = String(event?.repeatUnit || "none").trim().toLowerCase();
  if (unit === "none" || unit === "") {
    return {
      ok: true,
      unchanged: false,
      from,
      to,
      startsOn: to,
      skippedDates: [],
      extraDates: [],
      oneOff: true,
    };
  }
  const ruleDates = new Set(
    expandSeriesOccurrenceDates({
      ...event,
      skippedDates: [],
      extraDates: [],
    }),
  );
  let skippedDates = normalizeSkippedDates(event?.skippedDates).filter(
    (date) => date !== to,
  );
  let extraDates = normalizeExtraDates(event?.extraDates).filter(
    (date) => date !== from && date !== to,
  );
  if (ruleDates.has(from) && !skippedDates.includes(from)) {
    skippedDates.push(from);
  }
  if (!ruleDates.has(to)) {
    extraDates.push(to);
  }
  skippedDates = normalizeSkippedDates(skippedDates);
  extraDates = normalizeExtraDates(extraDates);
  return {
    ok: true,
    unchanged: false,
    from,
    to,
    startsOn: event?.startsOn || "",
    skippedDates,
    extraDates,
    oneOff: false,
  };
}

export function dayBeforeIso(iso) {
  const date = parseIsoDate(iso);
  if (!date) return "";
  return formatIsoDate(addDays(date, -1));
}
