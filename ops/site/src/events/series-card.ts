/**
 * One series as the Series list shows it: a card with its photo, name,
 * next night, how often it runs, and whether the website has it.
 */
import type { OpsEvent } from "../app/api";
import type { BadgeTone } from "../ui/badge";
import { eventItemPath } from "../app/nav";
import { seriesWeekdayLabel } from "./event-schedule";
import {
	repeatLabel,
	seriesBlurb,
	seriesGuestLabel,
	seriesNextCell,
	seriesOfferLabel,
	seriesTimeLabel,
	statusLabel,
	statusTitle,
	statusTone,
} from "./event-labels";

export type SeriesCardRow = {
	id: string;
	href: string;
	/** Weekday(s) it runs, e.g. "Tuesday". Falls back to the cadence. */
	when: string;
	/** How often: "Every week on Tue". */
	cadence: string;
	photo: string;
	name: string;
	blurb: string;
	time: string;
	guest: string;
	/** "9 Oct · Quiz night", or "No nights". */
	next: string;
	offer: string;
	status: string;
	/** The longer words, for the badge's tooltip. */
	statusTitle: string;
	tone: BadgeTone;
};

export function seriesCardRow(event: OpsEvent): SeriesCardRow {
	const cadence = repeatLabel(event);
	return {
		id: event.id,
		href: eventItemPath(event.id),
		when: seriesWeekdayLabel(event) || cadence,
		cadence,
		photo: event.mainImage?.url || "",
		name: event.name,
		blurb: seriesBlurb(event),
		time: seriesTimeLabel(event),
		guest: seriesGuestLabel(event),
		next: seriesNextCell(event),
		offer: seriesOfferLabel(event),
		status: statusLabel(event),
		statusTitle: statusTitle(event),
		tone: statusTone(event),
	};
}
