import type { OpsEvent } from "../app/api";
import type { BadgeTone } from "../ui/badge";
import { seriesNextNightLabel } from "./event-schedule";

/** Labels for events, series and nights, shared by the lists and the editor. */

export const WEEKDAY_LABELS: Record<string, string> = {
	mon: "Mon",
	tue: "Tue",
	wed: "Wed",
	thu: "Thu",
	fri: "Fri",
	sat: "Sat",
	sun: "Sun",
};

export function repeatLabel(event: {
	repeatEvery?: number;
	repeatUnit?: string;
	weekdays?: string[];
	monthDay?: number;
}): string {
	if (event.repeatUnit === "once") return "Special event";
	if (event.repeatUnit === "day") {
		return event.repeatEvery === 1 ? "Every day" : `Every ${event.repeatEvery} days`;
	}
	if (event.repeatUnit === "week") {
		const days = (event.weekdays || []).map((day) => WEEKDAY_LABELS[day] || day).join(", ");
		const every = event.repeatEvery === 1 ? "Every week" : `Every ${event.repeatEvery} weeks`;
		return days ? `${every} on ${days}` : every;
	}
	if (event.repeatUnit === "month") {
		const day = event.monthDay || "the start date";
		return event.repeatEvery === 1
			? `Every month on ${day}`
			: `Every ${event.repeatEvery} months on ${day}`;
	}
	return "Scheduled";
}

/**
 * Where a series or night stands with the website, as the lists show it.
 * Saved changes the website has not picked up wait for "Update website".
 */
export function statusLabel(event: OpsEvent): string {
	if (event.publish.live === "current") return "On website";
	if (event.publish.live === "unpublished") return "Not on website";
	return "Waiting for Update website";
}

export function statusTone(event: OpsEvent | null): BadgeTone {
	if (!event) return "neutral";
	if (event.publish.live === "current") return "success";
	if (event.publish.live === "unpublished") return "neutral";
	return "warning";
}

export function formatDate(iso: string): string {
	if (!iso) return "";
	const [year, month, day] = iso.split("-").map(Number);
	if (!year || !month || !day) return iso;
	return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

export function formatClock(value: string): string {
	const raw = String(value || "").trim();
	if (!raw) return "";
	const match = /^(\d{1,2}):(\d{2})/.exec(raw);
	if (!match) return raw;
	const hour = Number(match[1]);
	const minute = match[2];
	if (!Number.isFinite(hour)) return raw;
	const suffix = hour >= 12 ? "pm" : "am";
	const twelve = hour % 12 || 12;
	return minute === "00" ? `${twelve}${suffix}` : `${twelve}:${minute}${suffix}`;
}

export function formatDayMonth(iso: string): string {
	const [year, month, day] = iso.split("-").map(Number);
	if (!year || !month || !day) return iso;
	return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
	});
}

export function seriesNextIso(event: OpsEvent): string {
	return String(event.publish?.nextDate || event.publish?.previewDates?.[0] || "").trim();
}

export function seriesTimeLabel(event: OpsEvent): string {
	const start = formatClock(event.startTime);
	const end = formatClock(event.endTime);
	if (start && end) return `${start}–${end}`;
	if (start) return start;
	return String(event.time || "").trim();
}

export function seriesGuestLabel(event: OpsEvent): string {
	const artist = String(event.artist || "").trim();
	if (artist) return artist;
	const night = (event.dates || []).find((row) => row.date === seriesNextIso(event));
	return String(night?.overrides?.artist || "").trim();
}

export function seriesOfferLabel(event: OpsEvent): string {
	const offer = String(event.offer || "").trim();
	if (offer) return offer;
	const night = (event.dates || []).find((row) => row.date === seriesNextIso(event));
	return String(night?.overrides?.offer || "").trim();
}

/** Short card blurb, or night-slot labels when the blurb is empty. */
export function seriesBlurb(event: OpsEvent): string {
	const short = String(event.shortDescription || "").trim();
	if (short) return short;
	return (event.nightSchedule || [])
		.map((slot) => String(slot.label || "").trim())
		.filter(Boolean)
		.join(" · ");
}

export function seriesNextCell(event: OpsEvent): string {
	const next = seriesNextIso(event);
	if (!next) return "No nights";
	const night = seriesNextNightLabel(event);
	const date = formatDayMonth(next);
	return night ? `${date} · ${night}` : date;
}

/**
 * The delete confirm in the editor. The title names exactly what goes: a
 * night of an open series deletes only that night (#151).
 */
export function deleteEventCopy({
	kind,
	eventName,
	nightDate = "",
	seriesName = "",
	onWebsite = false,
}: {
	kind: "series" | "event" | "night";
	eventName: string;
	nightDate?: string;
	seriesName?: string;
	onWebsite?: boolean;
}): { title: string; message: string; website: string } {
	const website = onWebsite
		? "It stays on the website until you press Update website on the Website page. Until then you can restore it there."
		: "";
	const undo = onWebsite ? "" : " This can't be undone.";
	if (kind === "night") {
		const when = nightDate ? formatDate(nightDate) : "this night";
		const series = seriesName || eventName;
		return {
			title: `Delete the night of ${when}?`,
			message: `Only this night goes. ${series} and its other nights stay.${undo}`,
			website,
		};
	}
	if (kind === "event") {
		return { title: `Delete ${eventName}?`, message: `It goes from the schedule.${undo}`, website };
	}
	return { title: `Delete ${eventName}?`, message: `The series and all its nights go.${undo}`, website };
}
