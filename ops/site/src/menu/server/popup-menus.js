/**
 * A pop-up kitchen's menus (#305), for Events: a pop-up's editor lists them,
 * each with its days and an Open menu link, and starts a new one from the
 * pop-up's own dates and cooking days.
 *
 * This is all events know of menus; popup-menus.events.contract.test.js
 * holds it to what Events relies on. Events never read the menu's records.
 */
import { londonToday } from "../../../../../shared/forms/field-rules.js";
import { MENU_STATUS_LABELS, menuDatesLabel, menuDaysLabel } from "../menu-days.js";
import { cleanMenuDate, cleanSectionKind, menuDayList, menuStatus } from "./menu-model.js";
import { menuRepository } from "./menu-repository.js";

/**
 * The menus that belong to the pop-up kitchen `seriesId` (an event series'
 * id), in the menus' order: ids as text, its name, drinks or food, its
 * dates (YYYY-MM-DD, "" for none) and days (weekday ids, [] for every day),
 * how ops says them, and its status on `today`.
 *
 * @returns {Promise<Array<{ id: string, name: string, kind: "bar" | "kitchen",
 *   startsOn: string, endsOn: string, days: string[], daysLabel: string,
 *   datesLabel: string, status: "on" | "coming" | "ended", statusLabel: string }>>}
 */
export async function menusForPopup(env, seriesId, { today = londonToday() } = {}) {
  const id = Number(seriesId);
  if (!Number.isInteger(id) || id <= 0) return [];
  return (await menuRepository(env).list("menus"))
    .filter((menu) => menu.popupSeriesId === id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id)
    .map((menu) => {
      const status = menuStatus(menu, today);
      return {
        id: String(menu.id),
        name: String(menu.name || "").trim(),
        kind: cleanSectionKind(menu.kind),
        startsOn: cleanMenuDate(menu.startsOn),
        endsOn: cleanMenuDate(menu.endsOn),
        days: menuDayList(menu.days),
        daysLabel: menuDaysLabel(menu.days),
        datesLabel: menuDatesLabel(menu),
        status,
        statusLabel: MENU_STATUS_LABELS[status],
      };
    });
}
