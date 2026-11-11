/**
 * The pop-up kitchen (#240): who is cooking now. In ops a guest kitchen is a
 * series marked "popup" (lib/promotions.js), with a night for every day it
 * cooks, and its menu is the kitchen chapter that points at that series.
 * What's on leaves its nights out; it shows once, on a card, with when it's
 * on, the way to its own page and the way to its menu.
 */
import { nightDay } from "./night-cards.js";
import {
  categoryOf,
  daysLabel,
  seriesPhoto,
  upcomingNights,
} from "./promotions.js";

const DAY_NAMES = {
  Sun: "sunday",
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
};

/** "Thu 12 Nov" */
function shortDate(dateIso) {
  const { weekday, day, month } = nightDay(dateIso);
  return `${weekday} ${day} ${month}`;
}

/** "12 Nov" */
function dayMonth(dateIso) {
  const { day, month } = nightDay(dateIso);
  return `${day} ${month}`;
}

/**
 * The days a pop-up cooks, in words: "Thu 12 Nov" for a single night;
 * otherwise the days of the week ("Wed to Sat", from the line ops writes,
 * else from the nights themselves), "from 12 Nov" until it has started, and
 * "until 30 Nov" when its nights are a fixed run and not a rolling one.
 *
 * @param {object} row the series
 * @param {Array<object>} nights every night of the series, in date order
 * @param {string} todayIso YYYY-MM-DD
 */
export function popupWhen(row, nights, todayIso) {
  const ahead = nights.filter((night) => String(night.date) >= todayIso);
  if (!ahead.length) return "";
  const first = String(nights[0].date);
  const last = String(nights.at(-1).date);
  if (first === last) return shortDate(first);

  const days =
    daysLabel(row?.recurrence || ahead[0].recurrence) ||
    daysLabel(
      ahead.map((night) => DAY_NAMES[nightDay(night.date).weekday]).join(" "),
    );
  const from = first > todayIso ? first : "";
  // A repeating series keeps getting nights: its last one is no ending.
  const until = row?.schedule === "repeating" ? "" : last;
  if (!days && from && until) return `${dayMonth(from)} to ${dayMonth(until)}`;
  return [
    days,
    from && `from ${dayMonth(from)}`,
    until && `until ${dayMonth(until)}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function hasItems(chapter) {
  if ((chapter.items || []).some((item) => item.available !== false)) {
    return true;
  }
  return (chapter.subsections || []).some(hasItems);
}

/**
 * Where a pop-up's menu is: its own chapter on the food page when one points
 * at the series and has something on it, else the food page.
 */
export function popupMenuHref(seriesId, chapters) {
  const chapter = (chapters || []).find(
    (row) => row.popupSeriesId === seriesId && hasItems(row),
  );
  return chapter ? `/kitchen#${chapter.id}` : "/kitchen";
}

/**
 * The pop-up kitchens on now, in the order they next cook: a popup series
 * with a night today or later. The hours are its next night's. Each has its
 * own page on What's on (href) and its menu on the food page (menuHref).
 * Empty when nobody's in.
 *
 * @param {Array<object>} series the catalog's series
 * @param {Array<object>} occurrences every night, in date order
 * @param {Array<object>} chapters the kitchen menu's chapters
 * @param {string} todayIso YYYY-MM-DD
 */
export function popupKitchens(series, occurrences, chapters, todayIso) {
  const kitchens = [];
  for (const row of series || []) {
    if (categoryOf(row) !== "popup") continue;
    const [next] = upcomingNights(row.seriesId, occurrences, todayIso);
    if (!next) continue;
    const nights = upcomingNights(row.seriesId, occurrences, "");
    kitchens.push({
      id: row.seriesId,
      title: row.title,
      when: popupWhen(row, nights, todayIso),
      startTime: next.startTime || "",
      endTime: next.endTime || "",
      time: next.time || "",
      note: String(row.shortDescription || next.shortDescription || "").trim(),
      /** Their own page, when ops has one for them. */
      pageUrl: String(next.pageUrl || "").trim(),
      ...seriesPhoto(row, next),
      next: next.date,
      /** Its own page, where the whole card leads. */
      href: `/whats-on/${encodeURIComponent(row.seriesId)}`,
      menuHref: popupMenuHref(row.seriesId, chapters),
    });
  }
  return kitchens.sort(
    (a, b) => a.next.localeCompare(b.next) || a.title.localeCompare(b.title),
  );
}
