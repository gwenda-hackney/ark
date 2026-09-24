import type { OpsEvent, OpsEventOccurrence } from "./api";
import {
	WEEKDAYS,
	expandSeriesOccurrenceDates,
	normalizeWeekdays,
} from "../../../functions/_lib/event-recurrence.js";

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

const WEEKDAY_NAMES: Record<string, string> = {
	mon: "Monday",
	tue: "Tuesday",
	wed: "Wednesday",
	thu: "Thursday",
	fri: "Friday",
	sat: "Saturday",
	sun: "Sunday",
};

function weekdayIndexFromIso(iso: string): number {
	const date = parseIsoDate(iso);
	if (Number.isNaN(date.getTime())) return -1;
	return (date.getDay() + 6) % 7;
}

function seriesAnchorDate(event: OpsEvent): string {
	const dates = [
		event.publish?.nextDate,
		...(event.publish?.previewDates || []),
		...(event.dates || []).map((occurrence) => occurrence.date),
		...(event.extraDates || []),
		event.startsOn,
	].filter(Boolean);
	const upcoming = dates.filter((date) => date >= formatIsoDate(new Date())).sort();
	if (upcoming[0]) return upcoming[0];
	return [...dates].sort()[0] || "";
}

/** Monday = 0 … Sunday = 6. Unknown days sort after Sunday. */
export function seriesWeekdayIndex(event: OpsEvent): number {
	const unit = String(event.repeatUnit || "none").toLowerCase();
	if (unit === "week") {
		const days = normalizeWeekdays(event.weekdays);
		const index = days[0] ? WEEKDAYS.indexOf(days[0]) : -1;
		if (index >= 0) return index;
	}
	const iso = seriesAnchorDate(event);
	const index = iso ? weekdayIndexFromIso(iso) : -1;
	return index >= 0 ? index : WEEKDAYS.length;
}

export function seriesWeekdayLabel(event: OpsEvent): string {
	const unit = String(event.repeatUnit || "none").toLowerCase();
	if (unit === "week") {
		const days = normalizeWeekdays(event.weekdays)
			.map((day) => WEEKDAY_NAMES[day] || day)
			.filter(Boolean);
		if (days.length) return days.join(", ");
	}
	const iso = seriesAnchorDate(event);
	return iso ? formatScheduleWeekday(iso) : "";
}

export function compareSeriesByWeekday(a: OpsEvent, b: OpsEvent): number {
	return (
		seriesWeekdayIndex(a) - seriesWeekdayIndex(b) ||
		a.name.localeCompare(b.name)
	);
}

/** Distinct name or guest for the next night, if the series row should name it. */
export function seriesNextNightLabel(event: OpsEvent): string {
	const next = String(
		event.publish?.nextDate || event.publish?.previewDates?.[0] || "",
	).trim();
	if (!next) return "";
	const night = (event.dates || []).find((row) => row.date === next);
	const name = String(night?.overrides?.name || "").trim();
	const artist = String(night?.overrides?.artist || "").trim();
	const series = String(event.name || "").trim();
	if (name && name.toLowerCase() !== series.toLowerCase()) return name;
	if (artist && Boolean(night?.isSpecialEdition)) return artist;
	return "";
}

export function formatScheduleDate(iso: string): string {
	return shortDate(iso);
}

export type EventScheduleFilter = {
	eventIds?: string[];
	from?: string;
	to?: string;
	/** Case-insensitive match across series and night fields. */
	query?: string;
};

function normalizeSearch(value: string): string {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();
}

function occurrenceSearchText(row: EventScheduleRow): string {
	const overrides = row.occurrence?.overrides;
	return [
		row.event.name,
		row.event.artist,
		row.event.offer,
		row.event.description,
		row.event.operationsNotes,
		row.event.slug,
		overrides?.name,
		overrides?.artist,
		overrides?.offer,
		overrides?.description,
		overrides?.operationsNotes,
		row.date,
		row.occurrence?.slug,
	]
		.filter(Boolean)
		.join("\n");
}

function matchesSearchQuery(row: EventScheduleRow, query: string): boolean {
	const needle = normalizeSearch(query);
	if (!needle) return true;
	const haystack = normalizeSearch(occurrenceSearchText(row));
	return needle
		.split(/\s+/)
		.filter(Boolean)
		.every((token) => haystack.includes(token));
}

export function filterEventSchedule(
	weeks: EventScheduleWeek[],
	filter: EventScheduleFilter = {},
): EventScheduleWeek[] {
	const ids = new Set((filter.eventIds || []).filter(Boolean));
	const from = filter.from || "";
	const to = filter.to || "";
	const query = filter.query || "";
	return weeks
		.map((week) => ({
			...week,
			rows: week.rows.filter((row) => {
				if (ids.size && !ids.has(row.event.id)) return false;
				if (from && row.date < from) return false;
				if (to && row.date > to) return false;
				if (!matchesSearchQuery(row, query)) return false;
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

/** Monday-first headings for the month grid. */
export const SCHEDULE_WEEKDAYS = [
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
	"Sun",
] as const;

export type ScheduleCalendarDay = {
	date: string;
	inMonth: boolean;
	rows: EventScheduleRow[];
};

export type ScheduleCalendar = {
	month: string;
	label: string;
	weekdays: readonly string[];
	days: ScheduleCalendarDay[];
};

export function scheduleToday(now = new Date()): string {
	return formatIsoDate(now);
}

export function currentScheduleMonth(now = new Date()): string {
	return scheduleToday(now).slice(0, 7);
}

function parseScheduleMonth(
	month: string,
	now = new Date(),
): { year: number; monthIndex: number; key: string } {
	const match = /^(\d{4})-(\d{2})$/.exec(month);
	const monthIndex = match ? Number(match[2]) - 1 : -1;
	if (!match || monthIndex < 0 || monthIndex > 11) {
		const key = currentScheduleMonth(now);
		const [year, mon] = key.split("-").map(Number);
		return { year, monthIndex: mon - 1, key };
	}
	return { year: Number(match[1]), monthIndex, key: match[0] };
}

export function scheduleMonthLabel(month: string, now = new Date()): string {
	const parsed = parseScheduleMonth(month, now);
	return new Date(parsed.year, parsed.monthIndex, 1).toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric",
	});
}

export function shiftScheduleMonth(
	month: string,
	delta: number,
	now = new Date(),
): string {
	const parsed = parseScheduleMonth(month, now);
	return formatIsoDate(new Date(parsed.year, parsed.monthIndex + delta, 1)).slice(0, 7);
}

/** Monday-first month grid. Nights land on their date, including leading and trailing days. */
export function buildScheduleCalendar(
	weeks: EventScheduleWeek[],
	month: string,
	now = new Date(),
): ScheduleCalendar {
	const parsed = parseScheduleMonth(month, now);
	const first = new Date(parsed.year, parsed.monthIndex, 1);
	const startOffset = (first.getDay() + 6) % 7;
	const gridStart = addDays(first, -startOffset);
	const daysInMonth = new Date(parsed.year, parsed.monthIndex + 1, 0).getDate();
	const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
	const byDate = new Map<string, EventScheduleRow[]>();
	for (const week of weeks) {
		for (const row of week.rows) {
			const list = byDate.get(row.date) || [];
			list.push(row);
			byDate.set(row.date, list);
		}
	}
	const days: ScheduleCalendarDay[] = [];
	for (let index = 0; index < cellCount; index += 1) {
		const date = formatIsoDate(addDays(gridStart, index));
		days.push({
			date,
			inMonth: date.slice(0, 7) === parsed.key,
			rows: byDate.get(date) || [],
		});
	}
	return {
		month: parsed.key,
		label: scheduleMonthLabel(parsed.key, now),
		weekdays: SCHEDULE_WEEKDAYS,
		days,
	};
}
