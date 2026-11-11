/**
 * What a series is (server: event-model.js EVENT_CATEGORIES): a night or run
 * of nights, a promotion (a standing deal such as Happy Hour) or a pop-up
 * kitchen. The words the editor and the list use for it.
 */
export type EventCategory = "event" | "promotion" | "popup";

/** The editor's "What is it?" choice. */
export const CATEGORY_CHOICES = [
	{ id: "event", label: "A night" },
	{ id: "promotion", label: "A promotion" },
	{ id: "popup", label: "A pop-up kitchen" },
] as const;

export type CategoryFilter = "all" | EventCategory;

/** The list's filter: everything, or one kind. */
export const CATEGORY_FILTER_ITEMS = [
	{ id: "all", label: "All" },
	{ id: "event", label: "Nights" },
	{ id: "promotion", label: "Promotions" },
	{ id: "popup", label: "Pop-up kitchens" },
] as const;

/** A series' category; one saved before categories is a night. */
export function categoryOf(event: { category?: string | null } | null | undefined): EventCategory {
	return event?.category === "promotion" || event?.category === "popup" ? event.category : "event";
}

/** "Promotion" or "Pop-up kitchen" for a badge; "" for a night, which needs none. */
export function categoryBadge(event: { category?: string | null } | null | undefined): string {
	const category = categoryOf(event);
	return category === "promotion" ? "Promotion" : category === "popup" ? "Pop-up kitchen" : "";
}

export function filterByCategory<T extends { category?: string | null }>(events: T[], filter: CategoryFilter): T[] {
	return filter === "all" ? events : events.filter((event) => categoryOf(event) === filter);
}
