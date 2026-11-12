/**
 * What a series is (server: event-model.js EVENT_CATEGORIES): a night or run
 * of nights, a promotion (a standing deal such as Happy Hour) or a pop-up
 * kitchen. The words the editor and the list use for it, and the fields
 * each one asks for.
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

/** Whether a type asks for a field: not at all, if they like, or before it saves. */
export type FieldNeed = "off" | "optional" | "required";

/** A field a type may ask for, in that type's words. */
export type TypeField = { need: FieldNeed; label: string; placeholder: string };

/**
 * The fields that differ by type (#245), keyed like EventForm. Name, when,
 * card line, description, picture and notes are the same for every type.
 * The Add wizard reads this; the editor can too.
 */
export type CategoryFields = {
	namePlaceholder: string;
	/** Added as something that repeats unless they say it's once. */
	repeats: boolean;
	/** Once it repeats, where it starts: weekly with no end, or every day up to a last day. */
	repeatsAs: { unit: "week" | "day"; lastDay: boolean };
	artist: TypeField;
	pageUrl: TypeField;
	offer: TypeField;
	/** The running order: sets, acts or rounds, with their times. */
	nightSchedule: FieldNeed;
	endTime: FieldNeed;
	/** Their own mark, on the Images tab (#296): only a pop-up kitchen has one. */
	logo: FieldNeed;
};

const OFF: TypeField = { need: "off", label: "", placeholder: "" };

export const CATEGORY_FIELDS: Record<EventCategory, CategoryFields> = {
	event: {
		namePlaceholder: "Halloween party",
		repeats: false,
		repeatsAs: { unit: "week", lastDay: false },
		artist: { need: "optional", label: "Guest or artist", placeholder: "Artist, DJ or collaborator" },
		pageUrl: { need: "optional", label: "Tickets, RSVP or Instagram", placeholder: "A ticket link, or @handle" },
		offer: { need: "optional", label: "Offer", placeholder: "£10 Negroni" },
		nightSchedule: "optional",
		endTime: "optional",
		logo: "off",
	},
	// The card says "Wed to Sat, 5pm–7pm": it needs the deal and when it ends.
	promotion: {
		namePlaceholder: "Happy Hour",
		repeats: true,
		repeatsAs: { unit: "week", lastDay: false },
		artist: OFF,
		pageUrl: OFF,
		offer: { need: "required", label: "The deal", placeholder: "20% off all cocktails" },
		nightSchedule: "off",
		endTime: "required",
		logo: "off",
	},
	// A guest chef: one date, or a run of days with a last one. Their logo
	// and Instagram go on home's Food board, their card and their page.
	popup: {
		namePlaceholder: "The kitchen's name",
		repeats: false,
		repeatsAs: { unit: "day", lastDay: true },
		artist: OFF,
		pageUrl: { need: "optional", label: "Their Instagram or website", placeholder: "instagram.com/… or @handle" },
		offer: OFF,
		nightSchedule: "off",
		endTime: "optional",
		logo: "optional",
	},
};

/** The fields for a series' type (one saved before types is a night). */
export function fieldsFor(event: { category?: string | null } | null | undefined): CategoryFields {
	return CATEGORY_FIELDS[categoryOf(event)];
}

/** Whether a series has a logo slot on its Images tab: a pop-up kitchen. */
export function takesLogo(event: { category?: string | null } | null | undefined): boolean {
	return fieldsFor(event).logo !== "off";
}

/**
 * The link's label on Details: a pop-up kitchen's is their Instagram or
 * website (CATEGORY_FIELDS); any other series' stays "Guest link".
 */
export function linkField(event: { category?: string | null } | null | undefined): { label: string; placeholder: string } {
	const { pageUrl } = fieldsFor(event);
	return categoryOf(event) === "popup"
		? { label: pageUrl.label, placeholder: pageUrl.placeholder }
		: { label: "Guest link", placeholder: "instagram.com/… or @handle" };
}

export type TypedField = "artist" | "pageUrl" | "offer" | "nightSchedule";

/** What a type doesn't ask for: anything in those fields isn't saved. */
export function hiddenFields(event: { category?: string | null } | null | undefined): TypedField[] {
	const fields = fieldsFor(event);
	return (["artist", "pageUrl", "offer", "nightSchedule"] as const).filter((key) => {
		const need = key === "nightSchedule" ? fields.nightSchedule : fields[key].need;
		return need === "off";
	});
}
