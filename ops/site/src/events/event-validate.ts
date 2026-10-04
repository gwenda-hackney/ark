/**
 * What stops an event saving, field by field. Keys are the ids of the
 * fields on screen, so the editor can show each message under its field,
 * switch to the tab it is on and focus it.
 */
import { numberError } from "../ui/number-input";
import type { ErrorMap } from "../ui/form-errors.svelte";
import { formatDateGB } from "../ui/date-input";
import { unshownDescriptionLinks } from "./description-links";

export type EventValidateForm = {
	name: string;
	description: string;
	startsOn: string;
	endsOn: string;
	repeatUnit: string;
	repeatEvery: string;
	monthDay: string;
};

export type EventValidateContext = {
	/** A new night for a series. */
	creatingNight: boolean;
	/** One night of a series. */
	editingOccurrence: boolean;
	/** The series a new night joins. */
	attachSeriesId: string;
};

/** Field ids in the order they appear: the chooser, Details, then a series' pattern. */
export const EVENT_FIELD_ORDER = [
	"event-series",
	"event-name",
	"event-date",
	"event-start-time",
	"event-end-time",
	"event-description",
	"event-unit",
	"event-every",
	"event-month-day",
	"event-starts",
	"event-ends",
] as const;

/** A series' pattern, on its Schedule tab. */
const SCHEDULE_FIELDS = new Set(["event-unit", "event-every", "event-month-day", "event-starts", "event-ends"]);

/**
 * The tab a field is on. A saved series keeps its pattern on Schedule; everything else, and every field of a night, a special event or
 * a new form, is on Details.
 */
export function eventFieldTab(key: string, savedSeries = false): string | undefined {
	if (!key) return undefined;
	return savedSeries && SCHEDULE_FIELDS.has(key) ? "schedule" : "details";
}

const hasText = (html: string) => Boolean(String(html || "").replace(/<[^>]*>/g, "").trim());

export function validateEvent(form: EventValidateForm, ctx: EventValidateContext): ErrorMap {
	const errors: ErrorMap = {};
	if (ctx.creatingNight) {
		if (!ctx.attachSeriesId) errors["event-series"] = "Choose a series.";
		if (!form.startsOn) errors["event-date"] = "Add a date.";
		return errors;
	}
	if (ctx.editingOccurrence) {
		if (!form.startsOn) errors["event-date"] = "Add a date.";
		return errors;
	}
	if (!form.name.trim()) errors["event-name"] = "Add a name.";
	// The website needs one (publishEventPreview); a night uses its series'.
	if (!hasText(form.description)) errors["event-description"] = "Add a description. The website needs one.";
	else if (unshownDescriptionLinks(form.description).length) {
		errors["event-description"] = "A link in the description won't work on the website. Use https://…, an email, a phone number or a page on the site.";
	}
	if (form.repeatUnit === "once") {
		if (!form.startsOn) errors["event-date"] = "Add a date.";
		return errors;
	}
	if (form.repeatUnit !== "none") {
		const every = numberError(form.repeatEvery, { min: 1, max: 52, integer: true });
		if (every || !String(form.repeatEvery).trim()) errors["event-every"] = every || "Add how often it repeats.";
		if (form.repeatUnit === "month") {
			const day = numberError(form.monthDay, { min: 1, max: 31, integer: true });
			if (day) errors["event-month-day"] = day;
		}
		if (form.startsOn && !form.endsOn) errors["event-ends"] = "Add the last night of the series.";
	}
	if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
		errors["event-ends"] = `Pick ${formatDateGB(form.startsOn)} or later.`;
	}
	return errors;
}
