/**
 * The Add wizard (#245): one question per screen, so adding something to
 * What's on can't go wrong the way Happy Hour did (a series with no first
 * night, so no nights). It starts with the type, which decides the fields
 * (event-category.ts CATEGORY_FIELDS); the answers fill the same EventForm
 * the full editor uses, and its validation decides when Next is allowed.
 */
import { formatClock, formatDate, WEEKDAY_LABELS } from "./event-labels";
import { WEEKDAYS } from "./event-recurrence.js";
import { CATEGORY_FIELDS, categoryOf, hiddenFields, type EventCategory, type TypedField } from "./event-category";
import type { NewEventKind } from "./event-editor.svelte";
import type { OpsNightScheduleSlot } from "../app/api";

export type WizardStep = "type" | "name" | "when" | "running" | "guest" | "about" | "picture" | "notes" | "check";

/** Step one's answer: a type, or a special night of a series (which has its series' type). */
export type WizardType = EventCategory | "night";

export const WIZARD_TYPES: { id: WizardType; title: string; blurb: string; icon: string }[] = [
	{ id: "event", title: "A night", blurb: "A gig, a DJ, a quiz or a party.", icon: "star" },
	{ id: "promotion", title: "A deal", blurb: "Like Happy Hour.", icon: "tag" },
	{ id: "popup", title: "A pop-up kitchen", blurb: "A guest chef in the kitchen.", icon: "recipes" },
	{ id: "night", title: "A special night in a series we run", blurb: "One date of a series, say with a guest.", icon: "events" },
];

/**
 * What step one shows as picked: nothing until they pick, so the type is a
 * choice and not a default. Add night on a series comes with it picked.
 */
export function wizardType(kind: NewEventKind, category: string, picked: boolean): WizardType | "" {
	if (kind === "night") return "night";
	return picked ? categoryOf({ category }) : "";
}

/** Once or repeats, until they say otherwise on When: a deal repeats, the rest are once. */
export function kindForType(type: WizardType): NewEventKind {
	if (type === "night") return "night";
	return CATEGORY_FIELDS[type].repeats ? "series" : "once";
}

/** Whose fields a new form asks for: its own type's, or a special night's series'. */
export function categoryFor(
	kind: NewEventKind,
	form: { category?: string | null },
	series: { category?: string | null } | null | undefined,
): EventCategory {
	return categoryOf(kind === "night" ? series : form);
}

/** The questions for each kind, in order. A night takes the rest from its series. */
export function wizardSteps(kind: NewEventKind, category: EventCategory): WizardStep[] {
	const steps: WizardStep[] =
		kind === "night"
			? ["type", "when", "running", "guest", "picture", "notes", "check"]
			: ["type", "name", "when", "running", "about", "picture", "notes", "check"];
	return CATEGORY_FIELDS[category].nightSchedule === "off" ? steps.filter((step) => step !== "running") : steps;
}

const STEP_TITLES: Record<WizardStep, string> = {
	type: "What are you adding?",
	name: "What's it called?",
	when: "When is it?",
	running: "How does the night run?",
	guest: "Anyone special?",
	about: "Tell people about it",
	picture: "Add a picture",
	notes: "Notes for the team?",
	check: "Check it",
};

/** A special night of a deal or a pop-up kitchen has no guest to ask about. */
export function stepTitle(step: WizardStep, category: EventCategory): string {
	if (step === "guest" && CATEGORY_FIELDS[category].artist.need === "off") return "Anything different this time?";
	return STEP_TITLES[step];
}

/** Which form fields each step answers: their problems block its Next. */
const STEP_FIELDS: Record<WizardStep, string[]> = {
	type: ["wizard-type", "event-series"],
	name: ["event-name", "event-artist", "event-page-url", "event-offer"],
	when: [
		"event-date",
		"event-starts",
		"event-ends",
		"event-every",
		"event-month-day",
		"event-weekdays",
		"event-start-time",
		"event-end-time",
	],
	running: [],
	guest: [],
	about: ["event-description"],
	picture: [],
	notes: [],
	check: [],
};

export function stepErrors(errors: Record<string, string>, step: WizardStep): Record<string, string> {
	return Object.fromEntries(Object.entries(errors).filter(([field]) => STEP_FIELDS[step].includes(field)));
}

/** The step a problem belongs to, so the check step can send someone back to it. */
export function stepOfField(field: string, steps: WizardStep[]): WizardStep | null {
	return steps.find((step) => STEP_FIELDS[step].includes(field)) ?? null;
}

export type WizardForm = {
	startsOn: string;
	endsOn: string;
	startTime: string;
	endTime: string;
	repeatUnit: string;
	repeatEvery: string | number;
	weekdays: string[];
	artist: string;
	pageUrl: string;
	offer: string;
};

const FIELD_IDS: Record<Exclude<TypedField, "nightSchedule">, string> = {
	artist: "event-artist",
	pageUrl: "event-page-url",
	offer: "event-offer",
};

/**
 * What the wizard asks on top of the form's own rules: a type, a time to
 * start, for a weekly series at least one day, a last date when they said
 * there is one, and what the type needs (a deal: the deal and when it ends).
 * A special night needs none of it: what's empty follows its series.
 */
export function wizardErrors(
	form: WizardForm,
	kind: NewEventKind,
	type: WizardType | "",
	options: { noEnd: boolean },
): Record<string, string> {
	const errors: Record<string, string> = {};
	if (!type) errors["wizard-type"] = "Pick one.";
	if (kind === "night" || !type || type === "night") return errors;
	const fields = CATEGORY_FIELDS[type];
	for (const key of ["artist", "pageUrl", "offer"] as const) {
		const field = fields[key];
		if (field.need === "required" && !form[key].trim()) {
			errors[FIELD_IDS[key]] = `Add ${field.label.charAt(0).toLowerCase()}${field.label.slice(1)}.`;
		}
	}
	if (!form.startTime) errors["event-start-time"] = "Add the time it starts.";
	if (fields.endTime === "required" && !form.endTime) errors["event-end-time"] = "Add the time it ends.";
	if (form.repeatUnit === "week" && !form.weekdays.length) errors["event-weekdays"] = "Pick at least one day.";
	if (kind === "series" && !options.noEnd && !form.endsOn) {
		errors["event-ends"] = "Add the last date, or pick No end date.";
	}
	return errors;
}

type SavingForm = {
	artist: string;
	pageUrl: string;
	offer: string;
	nightSchedule: OpsNightScheduleSlot[];
	defaultsUnlocked: boolean;
	ownPhoto: boolean;
};

/**
 * Just before saving: empty what the type doesn't ask for (a guest typed
 * before picking Pop-up isn't saved). A special night keeps what's typed as
 * its own and leaves the rest to its series.
 */
export function readyToSave(
	form: SavingForm,
	{ kind, category, ownPhoto }: { kind: NewEventKind; category: EventCategory; ownPhoto: boolean },
) {
	for (const key of hiddenFields({ category })) {
		if (key === "nightSchedule") form.nightSchedule = [];
		else form[key] = "";
	}
	if (kind === "night") {
		form.defaultsUnlocked = true;
		form.ownPhoto = ownPhoto;
	}
}

export const HOW_OFTEN = [
	{ id: "week-1", label: "Every week", unit: "week", every: 1 },
	{ id: "week-2", label: "Every 2 weeks", unit: "week", every: 2 },
	{ id: "month-1", label: "Every month", unit: "month", every: 1 },
	{ id: "day-1", label: "Every day", unit: "day", every: 1 },
] as const;

export function howOftenId(unit: string, every: string | number): string {
	return `${unit}-${Number(every) || 1}`;
}

function listWords(items: string[]): string {
	if (items.length < 2) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function times(form: WizardForm): string {
	const start = formatClock(form.startTime);
	const end = formatClock(form.endTime);
	return start && end ? `${start}–${end}` : start ? `from ${start}` : "";
}

/** The "when" answer in plain words, for the step and the check. */
export function whenSentence(form: WizardForm, kind: NewEventKind): string {
	if (kind !== "series") {
		return [formatDate(form.startsOn), times(form)].filter(Boolean).join(", ");
	}
	const option = HOW_OFTEN.find((row) => row.id === howOftenId(form.repeatUnit, form.repeatEvery));
	const days =
		form.repeatUnit === "week"
			? listWords(WEEKDAYS.filter((day) => form.weekdays.includes(day)).map((day) => WEEKDAY_LABELS[day] || day))
			: "";
	const pattern = [option?.label || "Repeats", days && `on ${days}`].filter(Boolean).join(" ");
	const from = form.startsOn ? `from ${formatDate(form.startsOn)}` : "";
	const until = form.endsOn ? `until ${formatDate(form.endsOn)}` : form.startsOn ? "no end date" : "";
	return [pattern, times(form), from, until].filter(Boolean).join(", ");
}
