/**
 * What ops asks the website about the day (#306): whether the built site
 * would show different menus today than on the day it was built. Ops'
 * scheduler (ops/site/src/website/server/site-pending.js) runs
 * MENU_DAY_QUERY on the site's Sanity view and compares
 * `menuDayKeyFrom(result, builtOn)` with today's; when they differ, the
 * site is rebuilt. The rules are the website's own (lib/menus.js); the
 * query fetches only what they read. Its consumer's expectations are in
 * menu-day.ops.contract.test.js.
 */
import { menuDayKey } from "./menus.js";
import { withSeriesCategory } from "./promotions.js";

/**
 * The menus, their top-level chapters (whether each has anything on it),
 * the pop-up kitchens and their nights from `$from` on.
 */
export const MENU_DAY_QUERY = `{
  "menus": *[_type == "menu"] | order(orderRank asc) {
    "id": slug.current,
    name,
    kind,
    startsOn,
    endsOn,
    days,
    "popupSeriesId": coalesce(popupSeries->slug.current, popupSeries._ref)
  },
  "chapters": *[_type == "menuSection" && !defined(parent)] | order(orderRank asc) {
    "id": coalesce(slug.current, _id),
    kind,
    "menuId": menu->slug.current,
    "popupSeriesId": coalesce(popupSeries->slug.current, popupSeries._ref),
    "filled": count(*[_type == "menuItem" && removed != true && (section._ref == ^._id || section->parent._ref == ^._id)]) > 0
  },
  "series": *[_type == "eventSeries" && removed != true && category == "popup"] {
    "seriesId": slug.current,
    title,
    category,
    schedule,
    recurrence
  },
  "nights": *[_type == "event" && removed != true && date >= $from] {
    seriesId,
    date,
    category
  }
}`;

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function slug(value) {
  return String(value || "")
    .trim()
    .replace(/^drafts\./, "")
    .replace(/^series-/, "");
}

/** The query's result as lib/menus.js reads a fetched menu and What's on. */
export function menuDayData(result) {
  const menus = (result?.menus || [])
    .filter((doc) => doc?.id && doc?.name)
    .map((doc) => {
      const days = WEEK.filter((day) => (doc.days || []).includes(day));
      return {
        id: doc.id,
        name: doc.name,
        kind: doc.kind === "kitchen" ? "kitchen" : "bar",
        startsOn: doc.startsOn || "",
        endsOn: doc.endsOn || "",
        days: days.length === WEEK.length ? [] : days,
        ...(doc.popupSeriesId
          ? { popupSeriesId: slug(doc.popupSeriesId) }
          : {}),
      };
    });
  const sections = (result?.chapters || []).map((doc) => ({
    id: doc.id,
    title: doc.id,
    kind: doc.kind === "kitchen" ? "kitchen" : "bar",
    ...(doc.menuId ? { menuId: doc.menuId } : {}),
    ...(doc.popupSeriesId ? { popupSeriesId: slug(doc.popupSeriesId) } : {}),
    items: doc.filled ? [{ id: "filled", name: "filled" }] : [],
  }));
  const series = (result?.series || []).filter((row) => row?.seriesId);
  const occurrences = withSeriesCategory(
    (result?.nights || []).filter((night) => night?.seriesId && night?.date),
    series,
  );
  return { menu: { sections, menus }, catalog: { series, occurrences } };
}

/** What the site shows on `day` that depends on the day alone (menuDayKey). */
export function menuDayKeyFrom(result, day) {
  const { menu, catalog } = menuDayData(result);
  return menuDayKey(menu, catalog, day);
}
