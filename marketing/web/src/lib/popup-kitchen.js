/**
 * The pop-up kitchen (#240): who is cooking now. In ops a guest kitchen is a
 * series marked "popup" (lib/promotions.js), with a night for every day it
 * cooks, and its menus are the ones ops ties to that series (lib/menus.js,
 * #306). What's on leaves its nights out; it shows once, on a card, with
 * when it's on, the way to its own page and the way to its menu. Its name,
 * logo and Instagram (its link) are the series' in ops (#296), nothing here.
 */
import { kitchenColourStyle } from "./kitchen-colour.js";
import { menuPage } from "./menu-anchors.js";
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

/**
 * A pop-up's logo as its series in Sanity has it (#296): `{ url, width,
 * height }`, or null when ops has none, and the name stands alone.
 *
 * @param {object} row the series
 * @returns {null | { url: string, width: number, height: number }}
 */
export function seriesLogo(row) {
  const url = String(row?.logo?.url || "").trim();
  if (!url) return null;
  return {
    url,
    width: Number(row.logo.width) || 0,
    height: Number(row.logo.height) || 0,
  };
}

/**
 * Whether a pop-up counts as in: from when it's booked (it has a night on
 * the website still to come) through its last night, and not the day after.
 * The one test for everything that follows the pop-up: its menus on the
 * food page and home's Food board (lib/menus.js) and its photos there
 * (lib/photo-sources.ts).
 * Saving a pop-up in ops rebuilds the site, and ops rebuilds it the morning
 * after a last night, so the build's day is enough.
 *
 * @param {string} seriesId the pop-up's series
 * @param {Array<object>} occurrences every night, past ones too
 * @param {string} todayIso YYYY-MM-DD
 */
export function popupIsBookedOrOn(seriesId, occurrences, todayIso) {
  return upcomingNights(seriesId, occurrences, todayIso).length > 0;
}

/**
 * The pop-up kitchens on now, in the order they next cook: a popup series
 * with a night today or later. The hours are its next night's. Each has its
 * own page on What's on (href) and its menu on the food page (menuHref).
 * Empty when nobody's in.
 *
 * @param {Array<object>} series the catalog's series
 * @param {Array<object>} occurrences every night, in date order
 * @param {Map<string, string>} menuLinks where each pop-up's menus are,
 *   by its series (lib/menus.js popupMenuLinks); the food page without one
 * @param {string} todayIso YYYY-MM-DD
 */
export function popupKitchens(series, occurrences, menuLinks, todayIso) {
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
      /** Their own page (their Instagram), when ops has one for them. */
      pageUrl: String(next.pageUrl || row.pageUrl || "").trim(),
      /** Their logo from ops, shown in place of the photo; null without one. */
      logo: seriesLogo(row),
      /** Their own colour (#319), as CSS custom properties; "" for our red. */
      colourStyle: kitchenColourStyle(row.accentColor),
      ...seriesPhoto(row, next),
      next: next.date,
      /** Its own page, where the whole card leads. */
      href: `/whats-on/${encodeURIComponent(row.seriesId)}`,
      // Its menus on the food page (lib/menus.js popupMenuLinks).
      menuHref: menuLinks?.get(row.seriesId) || menuPage("kitchen"),
    });
  }
  return kitchens.sort(
    (a, b) => a.next.localeCompare(b.next) || a.title.localeCompare(b.title),
  );
}
