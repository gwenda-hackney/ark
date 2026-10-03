/**
 * Small helpers behind FilterBar: how many filters are on, and how a date
 * filter reads in a chip (British order, 1 Oct, never 10/01).
 */

/** An applied filter shown as a removable chip under the phone search row. */
export type FilterChip = {
	key: string;
	label: string;
	onremove: () => void;
};

/** Counts filters that are set: non-empty strings and lists, true flags. */
export function activeFilterCount(values: readonly unknown[]): number {
	let count = 0;
	for (const value of values) {
		if (Array.isArray(value)) {
			if (value.length) count += 1;
		} else if (typeof value === "string") {
			if (value.trim()) count += 1;
		} else if (value === true) {
			count += 1;
		}
	}
	return count;
}

function parseIso(iso: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return Number.isNaN(date.getTime()) ? null : date;
}

/** "1 Oct", or "1 Oct 2027" when the year is not this one. */
export function formatFilterDate(iso: string, now = new Date()): string {
	const date = parseIso(iso);
	if (!date) return iso;
	const sameYear = date.getFullYear() === now.getFullYear();
	return date.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

/** Chip text for a from/to filter. Empty when neither end is set. */
export function dateRangeLabel(from: string, to: string, now = new Date()): string {
	const start = from ? formatFilterDate(from, now) : "";
	const end = to ? formatFilterDate(to, now) : "";
	if (start && end) return `${start} – ${end}`;
	if (start) return `From ${start}`;
	if (end) return `Until ${end}`;
	return "";
}
