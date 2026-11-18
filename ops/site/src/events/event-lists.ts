/**
 * What's on's lists (#312): the Schedule, every night in one calendar, and
 * Events, Pop-ups and Deals, each holding one kind. A kind's list shows its
 * series and its one-offs still to come; its Add starts that kind, and an
 * event opens at its kind's address (`/popups/36`).
 */
import type { OpsEvent } from "../app/api";
import { eventItemPath } from "../app/nav";
import { categoryOf, type EventCategory } from "./event-category";
import { compareSeriesByWeekday } from "./event-schedule";

/** A list of one kind, named as its address is (`/popups`). */
export type EventSection = "events" | "popups" | "deals";
/** Which list the page shows. */
export type EventList = "schedule" | EventSection;

export const SECTION_CATEGORY: Record<EventSection, EventCategory> = {
	events: "event",
	popups: "popup",
	deals: "promotion",
};

/** The words each list uses. */
export const LIST_COPY: Record<EventList, { title: string; search: string; emptyTitle: string; emptyText: string }> = {
	schedule: {
		title: "Schedule",
		search: "Search name, artist, offer",
		emptyTitle: "No upcoming nights",
		emptyText: "Nights of events, pop-ups and deals show here.",
	},
	events: {
		title: "Events",
		search: "Search events",
		emptyTitle: "No events yet",
		emptyText: "A gig, a residency or a one-off night.",
	},
	popups: {
		title: "Pop-ups",
		search: "Search pop-ups",
		emptyTitle: "No pop-ups yet",
		emptyText: "A guest kitchen, for a night or a run of days.",
	},
	deals: {
		title: "Deals",
		search: "Search deals",
		emptyTitle: "No deals yet",
		emptyText: "A standing offer, like Happy Hour.",
	},
};

/** The Schedule's kind filter: everything, or one kind, named as the lists are. */
export const SCHEDULE_KINDS = [
	{ id: "all", label: "All" },
	{ id: "event", label: "Events" },
	{ id: "popup", label: "Pop-ups" },
	{ id: "promotion", label: "Deals" },
] as const;

export function isEventSection(value: unknown): value is EventSection {
	return value === "events" || value === "popups" || value === "deals";
}

/** The kind a list holds (`popups` → popup); null for anything else, like the Schedule. */
export function sectionCategory(section: unknown): EventCategory | null {
	return isEventSection(section) ? SECTION_CATEGORY[section] : null;
}

/** The list an event belongs in, by its kind (one saved before kinds is a night). */
export function sectionOf(event: { category?: string | null } | null | undefined): EventSection {
	const category = categoryOf(event);
	return category === "popup" ? "popups" : category === "promotion" ? "deals" : "events";
}

/** An event at its kind's address (`/popups/36`, `/deals/34/gallery`). */
export function eventPath(event: { id: string; category?: string | null }, tab?: string): string {
	return eventItemPath(event.id, tab, sectionOf(event));
}

/** A one-off's date: when it's on. */
function onceDate(event: OpsEvent): string {
	return String(event.startsOn || event.dates?.[0]?.date || "");
}

/**
 * One kind's list: its series by weekday, then its one-offs by date. A
 * one-off drops off once its day has gone, as it does from the Schedule;
 * one with no date yet stays, so it can be given one.
 */
export function sectionEvents(events: OpsEvent[], section: EventSection, today: string): OpsEvent[] {
	const category = SECTION_CATEGORY[section];
	const mine = events.filter((event) => categoryOf(event) === category);
	const series = mine.filter((event) => event.repeatUnit !== "once").sort(compareSeriesByWeekday);
	const oneOffs = mine
		.filter((event) => event.repeatUnit === "once" && (!onceDate(event) || onceDate(event) >= today))
		.sort((a, b) => onceDate(a).localeCompare(onceDate(b)) || a.name.localeCompare(b.name));
	return [...series, ...oneOffs];
}

/**
 * The list under an open editor, and where Close goes with no page to go
 * back to: the list it was opened from; else a night's is the Schedule, as
 * is the Schedule's Add (any kind); anything else its kind's list.
 */
export function homeList({
	origin,
	night,
	scheduleAdd,
	section,
}: {
	origin: EventList | null;
	night: boolean;
	scheduleAdd: boolean;
	section: EventSection;
}): EventList {
	if (origin) return origin;
	return night || scheduleAdd ? "schedule" : section;
}
