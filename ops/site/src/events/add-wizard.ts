/**
 * The Add wizard (#245): one question per screen, so adding something to
 * What's on can't go wrong the way Happy Hour did (a series with no first
 * night, so no nights). The questions depend on what's being added; the
 * answers fill the same EventForm the full editor uses, and its validation
 * decides when Next is allowed.
 */
import { formatClock, formatDate, WEEKDAY_LABELS } from "./event-labels";
import { WEEKDAYS } from "./event-recurrence.js";
import type { NewEventKind } from "./event-editor.svelte";

export type WizardStep = "kind" | "name" | "when" | "running" | "guest" | "about" | "picture" | "notes" | "check";

/** The questions for each kind, in order. A night takes the rest from its series. */
export function wizardSteps(kind: NewEventKind): WizardStep[] {
	if (kind === "night") return ["kind", "when", "running", "guest", "picture", "notes", "check"];
	return ["kind", "name", "when", "running", "about", "picture", "notes", "check"];
}

export const STEP_TITLES: Record<WizardStep, string> = {
	kind: "What are you adding?",
	name: "What's it called?",
	when: "When is it?",
	running: "How does the night run?",
	guest: "Anyone special?",
	about: "Tell people about it",
	picture: "Add a picture",
	notes: "Notes for the team?",
	check: "Check it",
};

/** Which form fields each step answers: their problems block its Next. */
const STEP_FIELDS: Record<WizardStep, string[]> = {
	kind: ["event-series"],
	name: ["event-name"],
	when: [
		"event-date",
		"event-starts",
		"event-ends",
		"event-every",
		"event-month-day",
		"event-weekdays",
		"event-start-time",
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
};

/**
 * What the wizard asks on top of the form's own rules: a time to start, and
 * for a weekly series at least one day.
 */
export function wizardWhenErrors(form: WizardForm, kind: NewEventKind): Record<string, string> {
	const errors: Record<string, string> = {};
	if (kind === "night") return errors;
	if (!form.startTime) errors["event-start-time"] = "Add the time it starts.";
	if (form.repeatUnit === "week" && !form.weekdays.length) errors["event-weekdays"] = "Pick at least one day.";
	return errors;
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
