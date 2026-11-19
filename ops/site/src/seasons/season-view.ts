/** How a season reads in ops (#353): its state, its days, short. */
import type { Season, SeasonState } from "./seasons-api";

export const STATE_LABELS: Record<SeasonState, string> = {
	showing: "On home",
	coming: "Coming",
	over: "Over",
};

export const STATE_TONES: Record<SeasonState, "success" | "info" | "neutral"> = {
	showing: "success",
	coming: "info",
	over: "neutral",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Nov", with the year when it isn't `year`. */
function day(iso: string, year: number) {
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return "";
	return `${d} ${MONTHS[m - 1]}${y === year ? "" : ` ${y}`}`;
}

/** "1 Nov to 20 Dec": the days home shows it. */
export function showDays(season: Pick<Season, "showFrom" | "showUntil">, now = new Date()) {
	const year = now.getFullYear();
	return [day(season.showFrom, year), day(season.showUntil, year)].filter(Boolean).join(" to ");
}

/** A blank season to start from: on home from today for a month. */
export function blankSeason(now = new Date()) {
	const iso = (date: Date) => date.toISOString().slice(0, 10);
	const later = new Date(now);
	later.setDate(later.getDate() + 30);
	return { name: "", line: "", included: "", covers: "", showFrom: iso(now), showUntil: iso(later) };
}
