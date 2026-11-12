/**
 * The pop-up kitchen (#240): who is cooking now. In ops a guest kitchen is a
 * series marked "popup" (lib/promotions.js), with a night for every day it
 * cooks, and its menu is the kitchen chapter that points at that series.
 * What's on leaves its nights out; it shows once, on a card, with when it's
 * on, the way to its own page and the way to its menu. Its name, logo and
 * Instagram (its link) are the series' in ops (#296), nothing here.
 */
import { menuAddresses, menuPage } from "./menu-anchors.js";
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

function hasItems(chapter) {
  if ((chapter.items || []).some((item) => item.available !== false)) {
    return true;
  }
  return (chapter.subsections || []).some(hasItems);
}

/**
 * Where a pop-up's menu is: its own chapter on the food page when one points
 * at the series and has something on it, else the food page.
 *
 * @param {string} seriesId the pop-up's series
 * @param {Array<object>} chapters the kitchen menu's chapters, as fetched
 */
export function popupMenuHref(seriesId, chapters) {
  const chapter = (chapters || []).find(
    (row) => row.popupSeriesId === seriesId && hasItems(row),
  );
  return chapter ? menuAddresses(chapters)(chapter).href : menuPage("kitchen");
}

/**
 * Whether a pop-up counts as in: from when it's booked (it has a night on
 * the website still to come) through its last night, and not the day after.
 * The one test for everything that follows the pop-up: its chapter of the
 * menu (kitchenChaptersOn), what home's Food side says (kitchenNow,
 * kitchenLine) and its photos on the Food board (lib/photo-sources.ts).
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
 * The kitchen menu's chapters to show: one that belongs to a pop-up
 * (`popupSeriesId`) from when it's booked through its last night; one with
 * no pop-up always. Home's Food side and the food page both take these.
 *
 * @template {{ popupSeriesId?: string }} C
 * @param {C[]} chapters the kitchen menu's chapters, in the menu's order
 * @param {Array<object>} occurrences every night, past ones too
 * @param {string} todayIso YYYY-MM-DD
 * @returns {C[]}
 */
export function kitchenChaptersOn(chapters, occurrences, todayIso) {
  return (chapters || []).filter(
    (chapter) =>
      !chapter.popupSeriesId ||
      popupIsBookedOrOn(chapter.popupSeriesId, occurrences, todayIso),
  );
}

/**
 * Who's in the kitchen: the pop-up booked or on that cooks soonest, with
 * its page, the day it starts ("Thu 12 Nov") and whether it has, when it
 * cooks as its card says ("Thursdays"), and its logo and Instagram from ops;
 * null when nothing is booked.
 *
 * @param {Array<object>} series the catalog's series
 * @param {Array<object>} occurrences every night, past ones too
 * @param {string} todayIso YYYY-MM-DD
 * @returns {{ popup: null | { id: string, title: string, href: string, from: string, started: boolean, when: string, logo: null | { url: string, width: number, height: number }, pageUrl: string } }}
 */
export function kitchenNow(series, occurrences, todayIso) {
  const [soonest] = (series || [])
    .filter((row) => categoryOf(row) === "popup")
    .map((row) => ({
      row,
      next: String(
        upcomingNights(row.seriesId, occurrences, todayIso)[0]?.date || "",
      ),
      first: String(
        upcomingNights(row.seriesId, occurrences, "")[0]?.date || "",
      ),
    }))
    .filter(({ row }) => popupIsBookedOrOn(row.seriesId, occurrences, todayIso))
    .sort(
      (a, b) =>
        a.next.localeCompare(b.next) || a.row.title.localeCompare(b.row.title),
    );
  if (!soonest) return { popup: null };
  return {
    popup: {
      id: soonest.row.seriesId,
      title: soonest.row.title,
      href: `/whats-on/${encodeURIComponent(soonest.row.seriesId)}/`,
      from: shortDate(soonest.first),
      started: soonest.first <= todayIso,
      when: popupWhen(
        soonest.row,
        upcomingNights(soonest.row.seriesId, occurrences, ""),
        todayIso,
      ),
      logo: seriesLogo(soonest.row),
      /** Their own link from ops: their Instagram, or their website. */
      pageUrl: String(soonest.row.pageUrl || "").trim(),
    },
  };
}

/**
 * The top of home's Food board while a pop-up is booked or on (the window
 * its menu shows in, kitchenChaptersOn): its logo, "In the kitchen: Chez
 * Pickle, Thursdays" ("Next in the kitchen" until it has started), and the
 * way to its page. No logo in ops: the name alone. null when nobody's
 * booked, and the board is as it always was.
 *
 * @param {ReturnType<typeof kitchenNow>["popup"]} popup kitchenNow's
 * @returns {null | { title: string, logo: null | { url: string, width: number, height: number }, line: string, href: string }}
 */
export function kitchenHeader(popup) {
  if (!popup) return null;
  const who = [popup.title, popup.when].filter(Boolean).join(", ");
  return {
    title: popup.title,
    logo: popup.logo || null,
    line: `${popup.started ? "In the kitchen" : "Next in the kitchen"}: ${who}`,
    href: popup.href,
  };
}

/**
 * What home's Food board says over its menu, or in place of one, under its
 * top (kitchenHeader). With a pop-up booked or on, the top says who and
 * when, so all that's left is "soon" when nothing's on the menu yet; with
 * nobody booked, kitchenLine's, as before.
 *
 * @param {null | { id: string, started: boolean }} popup kitchenNow's
 * @param {Array<object>} chapters the chapters shown (kitchenChaptersOn)
 */
export function foodBoardLine(popup, chapters) {
  if (!popup) return kitchenLine(null, chapters);
  return (chapters || []).some(hasItems) ? "" : "soon";
}

/**
 * What the food says about the pop-up, over its menu or in place of one:
 * - "ahead": its menu is up before its first night: "Chez Pickle, from Thu
 *   12 Nov" over it (home only: the food page's card says so already);
 * - "next": it's booked with no menu of its own up: "Next up: …";
 * - "soon": it has started with nothing on the menu: the list's on its way;
 * - "none": nothing booked and nothing on the menu: nobody's in;
 * - "": nothing to say (its menu is up and it's cooking, or the house menu
 *   with nobody booked).
 *
 * @param {null | { id: string, started: boolean }} popup kitchenNow's
 * @param {Array<object>} chapters the chapters shown (kitchenChaptersOn)
 */
export function kitchenLine(popup, chapters) {
  const withItems = (chapters || []).filter(hasItems);
  if (!popup) return withItems.length ? "" : "none";
  const own = withItems.some((chapter) => chapter.popupSeriesId === popup.id);
  if (!popup.started) return own ? "ahead" : "next";
  return own || withItems.length ? "" : "soon";
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
      /** Their own page (their Instagram), when ops has one for them. */
      pageUrl: String(next.pageUrl || row.pageUrl || "").trim(),
      /** Their logo from ops, shown in place of the photo; null without one. */
      logo: seriesLogo(row),
      ...seriesPhoto(row, next),
      next: next.date,
      /** Its own page, where the whole card leads. */
      href: `/whats-on/${encodeURIComponent(row.seriesId)}`,
      // Its chapter, as the food page shows it (kitchenChaptersOn).
      menuHref: popupMenuHref(
        row.seriesId,
        kitchenChaptersOn(chapters, occurrences, todayIso),
      ),
    });
  }
  return kitchens.sort(
    (a, b) => a.next.localeCompare(b.next) || a.title.localeCompare(b.title),
  );
}
