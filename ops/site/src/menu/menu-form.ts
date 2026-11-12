/**
 * A menu's form on its page (#305): what it starts with (a menu as saved, a
 * blank one, or one started from a pop-up kitchen) and whether it has
 * changed. The rules about dates and days are menu-days.js.
 */
import { menuDayList } from "./menu-days.js";
import type { Menu, MenuDay, MenuInput, MenuPopupRun } from "./types";

/** Drinks or food, in the owner's words. */
export const MENU_KIND_LABELS = { bar: "Drinks", kitchen: "Food" } as const;

/** The badge colour for a menu's status: on now stands out, ended fades. */
export const MENU_STATUS_TONES: Record<Menu["status"], string> = {
	on: "success",
	coming: "info",
	ended: "neutral",
};

const days = (value: readonly string[] | undefined): MenuDay[] => menuDayList(value ?? []) as MenuDay[];

/** A new menu: drinks, ongoing, every day. */
export function blankMenu(): MenuInput {
	return { name: "", kind: "bar", startsOn: "", endsOn: "", days: [], popupSeriesId: "" };
}

/** A menu as saved, in the form's terms. */
export function menuDraft(menu: Menu): MenuInput {
	return {
		name: menu.name,
		kind: menu.kind,
		startsOn: menu.startsOn,
		endsOn: menu.endsOn,
		days: days(menu.days),
		popupSeriesId: menu.popupSeriesId || "",
	};
}

/**
 * A new menu for a pop-up kitchen: food, with its name, its first and last
 * nights and its cooking days, for the owner to narrow down.
 */
export function popupDraft(popup: MenuPopupRun): MenuInput {
	return {
		name: popup.name,
		kind: "kitchen",
		startsOn: popup.startsOn,
		endsOn: popup.endsOn,
		days: days(popup.days),
		popupSeriesId: popup.id,
	};
}

/** Whether two forms say the same thing (the days in any order). */
export function sameMenu(a: MenuInput, b: MenuInput): boolean {
	return (
		a.name.trim() === b.name.trim() &&
		a.kind === b.kind &&
		a.startsOn === b.startsOn &&
		a.endsOn === b.endsOn &&
		days(a.days).join(",") === days(b.days).join(",") &&
		(a.kind === "kitchen" ? a.popupSeriesId : "") === (b.kind === "kitchen" ? b.popupSeriesId : "")
	);
}

/** What Save sends: a drinks menu has no pop-up kitchen. */
export function menuPayload(draft: MenuInput): MenuInput {
	return {
		...draft,
		name: draft.name.trim(),
		days: days(draft.days),
		popupSeriesId: draft.kind === "kitchen" ? draft.popupSeriesId : "",
	};
}
