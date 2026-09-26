/**
 * Loose time typing for TimeField: "7pm", "1930", "19.30", "7:30 am", "noon"
 * all become "HH:MM" (24-hour, the same string a native time input holds).
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM", "" for a blank field, or null when it cannot be read as a time. */
export function parseTime(raw: string): string | null {
	const text = raw.trim().toLowerCase().replace(/\s+/g, "");
	if (!text) return "";
	if (text === "noon" || text === "midday") return "12:00";
	if (text === "midnight") return "00:00";
	const match = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(text);
	if (!match) return null;
	let hours = Number(match[1]);
	const minutes = match[2] ? Number(match[2]) : 0;
	const meridiem = match[3]?.[0];
	if (minutes > 59) return null;
	if (meridiem) {
		if (hours < 1 || hours > 12) return null;
		if (hours === 12) hours = 0;
		if (meridiem === "p") hours += 12;
	} else if (hours > 23) {
		if (hours !== 24 || minutes) return null;
		hours = 0;
	}
	return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * Pick list in `step`-minute steps, running from `dayStart` round to the
 * small hours so late finishes sit after the evening, not at the top.
 */
export function timeOptions(step = 15, dayStart = 6): string[] {
	const out: string[] = [];
	for (let m = 0; m < 24 * 60; m += step) {
		const total = (dayStart * 60 + m) % (24 * 60);
		out.push(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
	}
	return out;
}

/** Index in `options` of the time closest to `value` (wrapping midnight). */
export function nearestIndex(options: string[], value: string): number {
	if (!/^\d{2}:\d{2}$/.test(value) || !options.length) return -1;
	const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
	const target = toMin(value);
	let best = 0;
	let bestGap = Infinity;
	options.forEach((opt, index) => {
		const diff = Math.abs(toMin(opt) - target);
		const gap = Math.min(diff, 24 * 60 - diff);
		if (gap < bestGap) {
			best = index;
			bestGap = gap;
		}
	});
	return best;
}
