/**
 * British dates for DateField: shown as dd/mm/yyyy and read the way people
 * type them ("24/10", "24.10.26", "241026", "24 Oct", "Sat 24 Oct 2026",
 * "today"). The value is always "YYYY-MM-DD", the same string a native date
 * input holds, so forms and the API don't change.
 */

const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What DateField says when it can't read what was typed. */
export const DATE_ERROR = "Use a date like 24/10/2026.";

/** Local "YYYY-MM-DD" for a Date. */
export function isoDay(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function build(day: number, month: number, year: number): string | null {
	if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2200)) return null;
	const date = new Date(year, month - 1, day);
	if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
	return isoDay(date);
}

function fullYear(text: string | undefined, fallback: number): number {
	if (!text) return fallback;
	const n = Number(text);
	return text.length <= 2 ? 2000 + n : n;
}

/**
 * Without a year, the next time that date comes round, unless it was in the
 * last two months (fixing a recent night, not booking one a year out).
 */
function guessYear(day: number, month: number, today: Date): number {
	const year = today.getFullYear();
	const candidate = new Date(year, month - 1, day);
	const ago = (today.getTime() - candidate.getTime()) / 86_400_000;
	return ago > 61 ? year + 1 : year;
}

/** "YYYY-MM-DD", "" for a blank field, or null when it can't be read as a date. */
export function parseDate(raw: string, today: Date = new Date()): string | null {
	const text = String(raw || "").trim().toLowerCase();
	if (!text) return "";
	if (text === "today") return isoDay(today);
	if (text === "tomorrow") {
		const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
		return isoDay(next);
	}

	let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
	if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]));

	// 24/10/2026, 24-10-26, 24.10, 24 10 2026
	m = /^(\d{1,2})[/.\-\s]+(\d{1,2})(?:[/.\-\s]+(\d{2}|\d{4}))?$/.exec(text);
	if (m) {
		const day = Number(m[1]);
		const month = Number(m[2]);
		return build(day, month, m[3] ? fullYear(m[3], 0) : guessYear(day, month, today));
	}

	// 24102026, 241026, 2410
	m = /^(\d{2})(\d{2})(\d{2}|\d{4})?$/.exec(text);
	if (m) {
		const day = Number(m[1]);
		const month = Number(m[2]);
		return build(day, month, m[3] ? fullYear(m[3], 0) : guessYear(day, month, today));
	}

	// Sat 24 Oct 2026, 24 october, 24th Oct 26
	m = /^(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?(?:\s+(\d{2}|\d{4}))?$/.exec(text);
	if (m) {
		const month = MONTHS.indexOf(m[2].slice(0, 3)) + 1;
		if (!month) return null;
		const day = Number(m[1]);
		return build(day, month, m[3] ? fullYear(m[3], 0) : guessYear(day, month, today));
	}
	return null;
}

/** "24/10/2026" for "2026-10-24"; anything else comes back as it was. */
export function formatDateGB(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
	return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
}

/** "Sat" for "2026-10-24", "" when it isn't a date. */
export function weekdayShort(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
	if (!m) return "";
	return DAYS[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
}

/** "" when `iso` sits inside min/max (either may be blank). */
export function dateRangeError(iso: string, min = "", max = ""): string {
	if (!iso) return "";
	if (min && iso < min) return `Pick ${formatDateGB(min)} or later.`;
	if (max && iso > max) return `Pick ${formatDateGB(max)} or earlier.`;
	return "";
}
