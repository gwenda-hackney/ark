import type { OpsEvent, OpsEventOccurrence } from "./api";
import { expandSeriesOccurrenceDates } from "../../../functions/_lib/event-recurrence.js";

export type EventScheduleRow = {
	event: OpsEvent;
	occurrence: OpsEventOccurrence | null;
	date: string;
};

export type EventScheduleWeek = {
	start: string;
	label: string;
	rows: EventScheduleRow[];
};

function parseIsoDate(iso: string): Date {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date): string {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

export function eventWeekStart(iso: string): string {
	const date = parseIsoDate(iso);
	const daysSinceMonday = (date.getDay() + 6) % 7;
	return formatIsoDate(addDays(date, -daysSinceMonday));
}

function shortDate(iso: string): string {
	return parseIsoDate(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
	});
}

function weekLabel(start: string, currentWeek: string): string {
	const nextWeek = formatIsoDate(addDays(parseIsoDate(currentWeek), 7));
	const end = formatIsoDate(addDays(parseIsoDate(start), 6));
	const range = `${shortDate(start)}–${shortDate(end)}`;
	if (start === currentWeek) return `This week · ${range}`;
	if (start === nextWeek) return `Next week · ${range}`;
	return range;
}

export function groupEventSchedule(
	events: OpsEvent[],
	now = new Date(),
): EventScheduleWeek[] {
	const today = formatIsoDate(now);
	const currentWeek = eventWeekStart(today);
	const rows = events.flatMap((event) => {
		const materialized = new Set(expandSeriesOccurrenceDates(event));
		const source = event.dates.length
			? event.dates.filter((occurrence) => materialized.has(occurrence.date))
			: event.publish.previewDates.map((date) => ({
					id: "",
					date,
					slug: "",
					sanityId: "",
					clickupTaskId: "",
					isSpecialEdition: false,
					overrides: {
						name: "",
						artist: "",
						offer: "",
						description: "",
						time: "",
						startTime: "",
						endTime: "",
						operationsNotes: "",
						imageLinks: [],
						image: null,
					},
				}));
		// One row per night. Duplicate Baserow date rows must not crash the list.
		const byDate = new Map<string, (typeof source)[number]>();
		for (const occurrence of source) {
			const prev = byDate.get(occurrence.date);
			if (!prev || Number(occurrence.id || 0) >= Number(prev.id || 0)) {
				byDate.set(occurrence.date, occurrence);
			}
		}
		return [...byDate.values()]
			.filter((occurrence) => occurrence.date >= today)
			.map((occurrence) => ({ event, occurrence, date: occurrence.date }));
	});
	rows.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			a.event.name.localeCompare(b.event.name),
	);

	const weeks = new Map<string, EventScheduleRow[]>();
	for (const row of rows) {
		const start = eventWeekStart(row.date);
		const week = weeks.get(start) || [];
		week.push(row);
		weeks.set(start, week);
	}

	return [...weeks].map(([start, weekRows]) => ({
		start,
		label: weekLabel(start, currentWeek),
		rows: weekRows,
	}));
}

export function formatScheduleWeekday(iso: string): string {
	return parseIsoDate(iso).toLocaleDateString("en-GB", { weekday: "long" });
}

export function formatScheduleDate(iso: string): string {
	return shortDate(iso);
}

export type EventScheduleFilter = {
	eventIds?: string[];
	from?: string;
	to?: string;
};

export function filterEventSchedule(
	weeks: EventScheduleWeek[],
	filter: EventScheduleFilter = {},
): EventScheduleWeek[] {
	const ids = new Set((filter.eventIds || []).filter(Boolean));
	const from = filter.from || "";
	const to = filter.to || "";
	return weeks
		.map((week) => ({
			...week,
			rows: week.rows.filter((row) => {
				if (ids.size && !ids.has(row.event.id)) return false;
				if (from && row.date < from) return false;
				if (to && row.date > to) return false;
				return true;
			}),
		}))
		.filter((week) => week.rows.length);
}

/** Keep the first `limit` rows across weeks for infinite scroll windows. */
export function paginateEventSchedule(
	weeks: EventScheduleWeek[],
	limit: number,
): EventScheduleWeek[] {
	let remaining = Math.max(0, Math.floor(limit));
	if (!Number.isFinite(remaining)) return weeks;
	return weeks
		.map((week) => {
			const rows = week.rows.slice(0, remaining);
			remaining -= rows.length;
			return { ...week, rows };
		})
		.filter((week) => week.rows.length);
}

export function countEventScheduleRows(weeks: EventScheduleWeek[]): number {
	return weeks.reduce((total, week) => total + week.rows.length, 0);
}
