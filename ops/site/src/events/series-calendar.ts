/**
 * A series' nights laid out for its Schedule tab: months of Monday-first
 * weeks on wide screens, weeks of rows on phones. A night that just follows
 * the series shows its time only; a night that differs carries marks saying
 * how (added, skipped, its own time, its own details).
 */
import type { OpsEventOccurrence } from "../app/api";
import { formatClock } from "./event-labels";
import {
	eventWeekStart,
	scheduleMonthDays,
	scheduleMonthLabel,
	shiftScheduleMonth,
} from "./event-schedule";

/** The series values a night falls back to (as typed in the form). */
export type SeriesNightDefaults = {
	name: string;
	artist: string;
	startTime: string;
	endTime: string;
	time: string;
	/** "none" for an open series, where every night is added by hand. */
	repeatUnit: string;
};

export type SeriesNightMarkKind = "added" | "skipped" | "time" | "edited" | "special";

export type SeriesNightMark = { kind: SeriesNightMarkKind; label: string; title: string };

export type SeriesNight = {
	date: string;
	/** Skipped (cancelled) night of the pattern: shown, but not on. */
	skipped: boolean;
	time: string;
	/** The night's own title, when it differs from the series name. */
	title: string;
	/** The night's own guest, when it differs from the series guest. */
	guest: string;
	marks: SeriesNightMark[];
};

export type SeriesCalendarDay = {
	date: string;
	inMonth: boolean;
	night: SeriesNight | null;
};

export type SeriesCalendarMonth = {
	month: string;
	label: string;
	weeks: SeriesCalendarDay[][];
};

export type SeriesAgendaWeek = {
	start: string;
	label: string;
	nights: SeriesNight[];
};

const text = (value: unknown) => String(value ?? "").trim();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function timeLabel(start: string, end: string, free: string): string {
	const from = formatClock(start);
	const to = formatClock(end);
	if (from && to) return `${from}–${to}`;
	if (from) return `From ${from}`;
	return free;
}

/** Overrides other than name, guest and times that make a night its own. */
const DETAIL_LABELS: [keyof OpsEventOccurrence["overrides"], string][] = [
	["offer", "offer"],
	["description", "description"],
	["shortDescription", "card line"],
	["pageUrl", "link"],
	["imageLinks", "photo"],
	["image", "photo"],
	["nightSchedule", "night schedule"],
	["operationsNotes", "ops notes"],
];

function filled(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (value && typeof value === "object") return true;
	return text(value) !== "";
}

/** One night as the calendar shows it. */
export function describeSeriesNight(
	series: SeriesNightDefaults,
	date: string,
	{
		occurrence,
		added = false,
		skipped = false,
	}: { occurrence?: OpsEventOccurrence | null; added?: boolean; skipped?: boolean } = {},
): SeriesNight {
	const overrides = occurrence?.overrides;
	const seriesTime = timeLabel(series.startTime, series.endTime, text(series.time));
	const time = timeLabel(
		text(overrides?.startTime) || series.startTime,
		text(overrides?.endTime) || series.endTime,
		text(overrides?.time) || text(series.time),
	);
	const ownName = text(overrides?.name);
	const title = ownName && !same(ownName, text(series.name)) ? ownName : "";
	const ownGuest = text(overrides?.artist);
	const guest = ownGuest && !same(ownGuest, text(series.artist)) ? ownGuest : "";
	const openSeries = text(series.repeatUnit || "none").toLowerCase() === "none";
	const marks: SeriesNightMark[] = [];
	if (skipped) {
		marks.push({ kind: "skipped", label: "Skipped", title: "Skipped: this night is off" });
	} else if (added && !openSeries) {
		marks.push({ kind: "added", label: "Added", title: "Added by hand, outside the pattern" });
	}
	if (time !== seriesTime) {
		marks.push({ kind: "time", label: "Own time", title: `Own time: ${time} (series ${seriesTime || "has none"})` });
	}
	const details = [
		...(title ? ["name"] : []),
		...(guest ? ["guest"] : []),
		...new Set(
			DETAIL_LABELS.filter(([key]) => filled(overrides?.[key])).map(([, label]) => label),
		),
	];
	if (details.length) {
		marks.push({ kind: "edited", label: "Own details", title: `Own ${details.join(", ")}` });
	}
	if (openSeries && occurrence?.isSpecialEdition) {
		marks.push({ kind: "special", label: "Special", title: "Special event" });
	}
	return { date, skipped, time, title, guest, marks };
}

/**
 * The nights to show: the pattern's dates plus skipped ones (in date
 * order), each described against the series.
 */
export function seriesNights(
	series: SeriesNightDefaults,
	{
		dates,
		occurrences = [],
		extraDates = [],
		skippedDates = [],
	}: {
		dates: string[];
		occurrences?: OpsEventOccurrence[];
		extraDates?: string[];
		skippedDates?: string[];
	},
): SeriesNight[] {
	const byDate = new Map(occurrences.map((row) => [row.date, row]));
	const added = new Set(extraDates);
	const on = new Set(dates);
	const off = skippedDates.filter((date) => !on.has(date));
	return [...new Set([...dates, ...off])].sort().map((date) =>
		describeSeriesNight(series, date, {
			occurrence: byDate.get(date) || null,
			added: added.has(date),
			skipped: !on.has(date),
		}),
	);
}

/** `count` months from `first`, each as Monday-first weeks with the nights on their days. */
export function seriesCalendarMonths(
	nights: SeriesNight[],
	first: string,
	count = 2,
	now = new Date(),
): SeriesCalendarMonth[] {
	const byDate = new Map(nights.map((night) => [night.date, night]));
	return Array.from({ length: Math.max(1, count) }, (_, index) => {
		const grid = scheduleMonthDays(shiftScheduleMonth(first, index, now), now);
		const weeks: SeriesCalendarDay[][] = [];
		grid.days.forEach((day, cell) => {
			if (cell % 7 === 0) weeks.push([]);
			weeks[weeks.length - 1].push({
				...day,
				night: day.inMonth ? byDate.get(day.date) || null : null,
			});
		});
		return { month: grid.month, label: scheduleMonthLabel(grid.month, now), weeks };
	});
}

function dayMonth(iso: string): string {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
	});
}

/** Phones: the nights in `[from, to)` grouped by their Monday ("Week of 23 Nov"). */
export function seriesAgendaWeeks(nights: SeriesNight[], from: string, to: string): SeriesAgendaWeek[] {
	const weeks = new Map<string, SeriesNight[]>();
	for (const night of nights) {
		if (night.date < from || night.date >= to) continue;
		const start = eventWeekStart(night.date);
		const list = weeks.get(start) || [];
		list.push(night);
		weeks.set(start, list);
	}
	return [...weeks].map(([start, list]) => ({
		start,
		label: `Week of ${dayMonth(start)}`,
		nights: list,
	}));
}

/**
 * Which months can be paged to: from the first night's month (or this
 * month, if later nights only) to the month that shows the last night.
 */
export function seriesMonthRange(
	nights: SeriesNight[],
	thisMonth: string,
	count = 2,
	now = new Date(),
): { earliest: string; latest: string } {
	const months = nights.map((night) => night.date.slice(0, 7)).sort();
	const earliest = months[0] && months[0] < thisMonth ? months[0] : thisMonth;
	const lastStart = shiftScheduleMonth(months[months.length - 1] || thisMonth, 1 - count, now);
	const latest = lastStart > thisMonth ? lastStart : thisMonth;
	return { earliest, latest };
}
