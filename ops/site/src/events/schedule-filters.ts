import { eventWeekStart } from "./event-schedule";

/** Quick date choices for the Schedule filter. Custom shows From and To. */
export type ScheduleRange = "any" | "week" | "next30" | "custom";

export const SCHEDULE_RANGES: readonly { id: ScheduleRange; label: string }[] = [
	{ id: "any", label: "Any time" },
	{ id: "week", label: "This week" },
	{ id: "next30", label: "Next 30 days" },
	{ id: "custom", label: "Custom…" },
];

function iso(date: Date): string {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function plusDays(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split("-").map(Number);
	return iso(new Date(year, month - 1, day + days));
}

/**
 * From/To for a quick choice. "This week" runs to Sunday, as the week
 * headings do. Custom and Any time leave the dates to the caller.
 */
export function scheduleRangeDates(
	range: ScheduleRange,
	today: string,
): { from: string; to: string } | null {
	if (range === "any") return { from: "", to: "" };
	if (range === "week") return { from: today, to: plusDays(eventWeekStart(today), 6) };
	if (range === "next30") return { from: today, to: plusDays(today, 30) };
	return null;
}
