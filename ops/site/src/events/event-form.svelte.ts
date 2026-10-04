import type { OpsEvent, OpsEventOccurrence, OpsNightScheduleSlot } from "../app/api";
import { itemSlug } from "../app/nav";
import { formatClock, formatDate } from "./event-labels";
import { expandSeriesOccurrenceDates } from "./event-recurrence.js";
import { hasMeaningfulFraming, normalizeHeroFraming, type HeroFraming } from "./hero-crops";

/** Fields a night can take from its series until defaults are overridden. */
export type SeriesTextKey =
	| "name"
	| "artist"
	| "offer"
	| "pageUrl"
	| "shortDescription"
	| "description"
	| "startTime"
	| "endTime"
	| "operationsNotes";

/** The series' own value for a field a night can override. */
export function seriesText(event: OpsEvent | null | undefined, key: SeriesTextKey): string {
	if (!event) return "";
	return String(event[key] || "").trim();
}

/** What a locked night field shows: the series value, or that there is none. */
export function lockedReadout(event: OpsEvent | null | undefined, key: SeriesTextKey): string {
	const raw = seriesText(event, key);
	if (!raw) return "None on the series";
	if (key === "startTime" || key === "endTime") return formatClock(raw) || raw;
	return raw;
}

/** Every field a night can take from its series, in the order the editor shows them. */
export const SERIES_TEXT_KEYS: SeriesTextKey[] = [
	"name",
	"artist",
	"pageUrl",
	"startTime",
	"endTime",
	"offer",
	"shortDescription",
	"description",
	"operationsNotes",
];

/** The fields a saved night has its own value for (the rest come from the series). */
export function nightOverriddenKeys(
	event: OpsEvent,
	occurrence: OpsEventOccurrence | null | undefined,
): SeriesTextKey[] {
	const overrides = occurrence?.overrides;
	if (!overrides) return [];
	return SERIES_TEXT_KEYS.filter((key) => {
		const own = String(overrides[key] || "").trim();
		if (!own) return false;
		// A title that only repeats the series name is not a title of its own.
		if (key === "name") return own.toLowerCase() !== String(event.name || "").trim().toLowerCase();
		return true;
	});
}

/** A night with any copy of its own starts with the series defaults unlocked. */
export function nightHasOwnCopy(
	event: OpsEvent,
	occurrence: OpsEventOccurrence | null | undefined,
): boolean {
	const overrides = occurrence?.overrides;
	if (!overrides) return false;
	const title = String(overrides.name || "").trim();
	const seriesName = String(event.name || "").trim().toLowerCase();
	return Boolean(
		(title && title.toLowerCase() !== seriesName) ||
			String(overrides.artist || "").trim() ||
			String(overrides.offer || "").trim() ||
			String(overrides.pageUrl || "").trim() ||
			String(overrides.shortDescription || "").trim() ||
			String(overrides.description || "").trim() ||
			String(overrides.startTime || "").trim() ||
			String(overrides.endTime || "").trim() ||
			String(overrides.operationsNotes || "").trim() ||
			overrides.image?.url,
	);
}

export function fieldSnapshot(row: {
	name?: string;
	artist?: string;
	offer?: string;
	pageUrl?: string;
	shortDescription?: string;
	description?: string;
	nightSchedule?: OpsNightScheduleSlot[];
	operationsNotes?: string;
	imageLinks?: string[];
	startsOn?: string;
	time?: string;
	startTime?: string;
	endTime?: string;
	repeatEvery?: number | string;
	repeatUnit?: string;
	weekdays?: string[];
	monthDay?: number | string;
	endsOn?: string;
}) {
	return JSON.stringify({
		name: String(row.name || "").trim(),
		artist: String(row.artist || "").trim(),
		offer: String(row.offer || "").trim(),
		pageUrl: String(row.pageUrl || "").trim(),
		shortDescription: String(row.shortDescription || "").trim(),
		description: String(row.description || "").trim(),
		nightSchedule: (row.nightSchedule || [])
			.map((slot) => ({
				label: String(slot.label || "").trim(),
				startTime: String(slot.startTime || "").trim(),
				endTime: String(slot.endTime || "").trim(),
			}))
			.filter((slot) => slot.label),
		operationsNotes: String(row.operationsNotes || "").trim(),
		imageLinks: [...(row.imageLinks || [])].map((link) => link.trim()).filter(Boolean),
		startsOn: row.startsOn || "",
		time: String(row.time || "").trim(),
		startTime: row.startTime || "",
		endTime: row.endTime || "",
		repeatEvery: Number(row.repeatEvery) || 1,
		repeatUnit: row.repeatUnit || "none",
		weekdays: [...(row.weekdays || [])].sort(),
		monthDay: Number(row.monthDay) || 0,
		endsOn: row.endsOn || "",
	});
}

export function occurrenceSnapshot(row: {
	name?: string;
	artist?: string;
	offer?: string;
	pageUrl?: string;
	description?: string;
	shortDescription?: string;
	operationsNotes?: string;
	imageLinks?: string[];
	date?: string;
	time?: string;
	startTime?: string;
	endTime?: string;
}) {
	return JSON.stringify({
		name: String(row.name || "").trim(),
		artist: String(row.artist || "").trim(),
		offer: String(row.offer || "").trim(),
		pageUrl: String(row.pageUrl || "").trim(),
		description: String(row.description || "").trim(),
		shortDescription: String(row.shortDescription || "").trim(),
		operationsNotes: String(row.operationsNotes || "").trim(),
		imageLinks: [...(row.imageLinks || [])].map((link) => link.trim()).filter(Boolean),
		date: row.date || "",
		time: String(row.time || "").trim(),
		startTime: row.startTime || "",
		endTime: row.endTime || "",
	});
}

export function cropsKey(value: HeroFraming | Record<string, unknown> | null | undefined) {
	if (!value || !hasMeaningfulFraming(normalizeHeroFraming(value))) return "";
	return JSON.stringify(normalizeHeroFraming(value));
}

/**
 * The event editor's fields: a series, a special event, or one night of a
 * series. `current` is the saved event the form was filled from (null when new).
 */
export class EventForm {
	name = $state("");
	/**
	 * A night's fields that have their own value. The rest show the series
	 * value ("From series") and save as blank, so they follow the series.
	 */
	overridden = $state<SeriesTextKey[]>([]);
	/** The night shows (or is getting) a photo of its own instead of the series'. */
	ownPhoto = $state(false);
	artist = $state("");
	offer = $state("");
	pageUrl = $state("");
	/** The series' page address: /whats-on/<webAddress>. */
	webAddress = $state("");
	shortDescription = $state("");
	description = $state("");
	nightSchedule = $state<OpsNightScheduleSlot[]>([]);
	operationsNotes = $state("");
	imageLinksText = $state("");
	startsOn = $state("");
	time = $state("");
	startTime = $state("");
	endTime = $state("");
	repeatEvery = $state("1");
	repeatUnit = $state("none");
	weekdays = $state<string[]>([]);
	monthDay = $state("");
	endsOn = $state("");
	replacesSeries = $state("");
	heroCrops = $state<HeroFraming | null>(null);

	/** Any field overridden. Setting it overrides every field, or none. */
	get defaultsUnlocked(): boolean {
		return this.overridden.length > 0;
	}

	set defaultsUnlocked(value: boolean) {
		this.overridden = value ? [...SERIES_TEXT_KEYS] : [];
	}

	isOverridden(key: SeriesTextKey): boolean {
		return this.overridden.includes(key);
	}

	/**
	 * Give a night its own value for one field, starting from the series'
	 * so it can be tweaked rather than retyped. A night's card line starts
	 * blank: the series' line is written for the series.
	 */
	override(key: SeriesTextKey, series: OpsEvent | null) {
		if (!this.isOverridden(key)) this.overridden = [...this.overridden, key];
		if (key !== "shortDescription" && !String(this[key] || "").trim()) {
			this[key] = seriesText(series, key);
		}
	}

	/**
	 * Back to the series for one field. A saved night holds the series value
	 * (what it shows); a night not saved yet holds blank (what it sends).
	 */
	useSeriesValue(key: SeriesTextKey, series: OpsEvent | null, options: { newNight?: boolean } = {}) {
		this.overridden = this.overridden.filter((item) => item !== key);
		this[key] = options.newNight || key === "shortDescription" ? "" : seriesText(series, key);
	}

	/** Fill from a saved event, or from one of its nights when `occurrenceDate` is set. */
	fill(event: OpsEvent, occurrenceDate = "") {
		const occurrence = occurrenceDate
			? event.dates.find((row) => row.date === occurrenceDate)
			: null;
		this.name = occurrence?.overrides.name || event.name;
		this.artist = occurrence?.overrides.artist || event.artist || "";
		this.offer = occurrence?.overrides.offer || event.offer || "";
		this.pageUrl = occurrence?.overrides.pageUrl || event.pageUrl || "";
		this.webAddress = event.slug || "";
		const onceNight =
			event.repeatUnit === "once"
				? event.dates.find((row) => row.overrides?.description || row.overrides?.shortDescription) ||
					event.dates[0]
				: null;
		this.shortDescription = occurrence
			? occurrence.overrides.shortDescription || ""
			: event.shortDescription || onceNight?.overrides.shortDescription || "";
		this.description = occurrence
			? occurrence.overrides.description || event.description || ""
			: event.description || onceNight?.overrides.description || "";
		this.nightSchedule = (event.nightSchedule || []).map((slot) => ({
			label: slot.label || "",
			startTime: slot.startTime || "",
			endTime: slot.endTime || "",
		}));
		this.operationsNotes =
			occurrence?.overrides.operationsNotes || event.operationsNotes || "";
		this.imageLinksText = (
			occurrence?.overrides.imageLinks?.length
				? occurrence.overrides.imageLinks
				: event.imageLinks || []
		).join("\n");
		this.startsOn = occurrenceDate || event.startsOn || "";
		this.time = occurrence?.overrides.time || event.time || "";
		this.startTime = occurrence?.overrides.startTime || event.startTime || "";
		this.endTime = occurrence?.overrides.endTime || event.endTime || "";
		this.repeatEvery = String(event.repeatEvery || 1);
		this.repeatUnit = event.repeatUnit || "none";
		this.weekdays = [...(event.weekdays || [])];
		this.monthDay = event.monthDay ? String(event.monthDay) : "";
		this.endsOn = event.endsOn || "";
		this.replacesSeries = event.replacesSeries || "";
		this.syncHeroCrops(event, occurrenceDate);
		this.overridden = nightOverriddenKeys(event, occurrence);
		this.ownPhoto = Boolean(occurrence?.overrides?.image?.url);
	}

	/** Crops follow the photo this editor owns: the night's own, or the series'. */
	syncHeroCrops(event: OpsEvent, occurrenceDate = "") {
		if (occurrenceDate) {
			const occurrence = event.dates.find((row) => row.date === occurrenceDate);
			this.heroCrops = occurrence?.overrides?.image?.url
				? normalizeHeroFraming(occurrence.overrides.heroCrops)
				: null;
			return;
		}
		this.heroCrops = event.heroCrops ? normalizeHeroFraming(event.heroCrops) : null;
	}

	/** An empty form: a new series (`none`) or a special event (`once`). */
	reset(repeatUnit: "none" | "once" = "none") {
		this.name = "";
		this.artist = "";
		this.offer = "";
		this.pageUrl = "";
		this.webAddress = "";
		this.shortDescription = "";
		this.description = "";
		this.nightSchedule = [];
		this.operationsNotes = "";
		this.imageLinksText = "";
		this.startsOn = "";
		this.time = "";
		this.startTime = "";
		this.endTime = "";
		this.repeatEvery = "1";
		this.repeatUnit = repeatUnit;
		this.weekdays = [];
		this.monthDay = "";
		this.endsOn = "";
		this.replacesSeries = "";
		this.heroCrops = null;
		this.overridden = [];
		this.ownPhoto = false;
	}

	/** Back to the series defaults on a night (the night's own photo is cleared separately). */
	useSeriesDefaults(event: OpsEvent | null) {
		this.heroCrops = null;
		this.name = seriesText(event, "name");
		this.artist = seriesText(event, "artist");
		this.offer = seriesText(event, "offer");
		this.pageUrl = seriesText(event, "pageUrl");
		this.shortDescription = "";
		this.description = seriesText(event, "description");
		this.startTime = seriesText(event, "startTime");
		this.endTime = seriesText(event, "endTime");
		this.operationsNotes = seriesText(event, "operationsNotes");
		this.overridden = [];
		this.ownPhoto = false;
	}

	addNightSlot() {
		this.nightSchedule = [...this.nightSchedule, { label: "", startTime: "", endTime: "" }];
	}

	removeNightSlot(index: number) {
		this.nightSchedule = this.nightSchedule.filter((_, i) => i !== index);
	}

	toggleWeekday(day: string) {
		this.weekdays = this.weekdays.includes(day)
			? this.weekdays.filter((item) => item !== day)
			: [...this.weekdays, day];
	}

	/** A new address typed in; blank keeps the address the series has. */
	webAddressChanged(current: OpsEvent | null): boolean {
		return Boolean(
			current && this.webAddress.trim() && itemSlug(this.webAddress) !== current.slug,
		);
	}

	/** Unsaved changes against the saved event (or an empty form when new). */
	isDirty(
		current: OpsEvent | null,
		options: { occurrenceDate?: string; creatingOnce?: boolean } = {},
	): boolean {
		const occurrenceDate = options.occurrenceDate || "";
		if (occurrenceDate && current) {
			const overrides = current.dates.find((row) => row.date === occurrenceDate)?.overrides;
			const fieldsDirty =
				occurrenceSnapshot({
					name: this.name,
					artist: this.artist,
					offer: this.offer,
					pageUrl: this.pageUrl,
					description: this.description,
					shortDescription: this.shortDescription,
					operationsNotes: this.operationsNotes,
					imageLinks: this.imageLinksText.split(/\r?\n/),
					date: this.startsOn,
					time: this.time,
					startTime: this.startTime,
					endTime: this.endTime,
				}) !==
				occurrenceSnapshot({
					name: overrides?.name || current.name,
					artist: overrides?.artist || current.artist,
					offer: overrides?.offer || current.offer,
					pageUrl: overrides?.pageUrl || current.pageUrl,
					description: overrides?.description || current.description,
					shortDescription: overrides?.shortDescription || "",
					operationsNotes: overrides?.operationsNotes || current.operationsNotes,
					imageLinks: overrides?.imageLinks?.length
						? overrides.imageLinks
						: current.imageLinks,
					date: occurrenceDate,
					time: overrides?.time || current.time,
					startTime: overrides?.startTime || current.startTime,
					endTime: overrides?.endTime || current.endTime,
				});
			const cropsDirty =
				Boolean(overrides?.image?.url) &&
				cropsKey(this.heroCrops) !== cropsKey(overrides?.heroCrops);
			return fieldsDirty || cropsDirty;
		}
		const draft = fieldSnapshot({
			name: this.name,
			artist: this.artist,
			offer: this.offer,
			pageUrl: this.pageUrl,
			shortDescription: this.shortDescription,
			description: this.description,
			nightSchedule: this.nightSchedule,
			operationsNotes: this.operationsNotes,
			imageLinks: this.imageLinksText.split(/\r?\n/),
			startsOn: this.startsOn,
			time: this.time,
			startTime: this.startTime,
			endTime: this.endTime,
			repeatEvery: this.repeatEvery,
			repeatUnit: this.repeatUnit,
			weekdays: this.weekdays,
			monthDay: this.monthDay,
			endsOn: this.endsOn,
		});
		if (!current) {
			return draft !== fieldSnapshot({ repeatUnit: options.creatingOnce ? "once" : "none" });
		}
		return (
			draft !== fieldSnapshot(current) ||
			cropsKey(this.heroCrops) !== cropsKey(current.heroCrops) ||
			this.webAddressChanged(current)
		);
	}

	/** Save body for a series or special event. */
	body(current: OpsEvent | null) {
		return {
			name: this.name.trim(),
			artist: this.artist.trim(),
			offer: this.offer.trim(),
			pageUrl: this.pageUrl.trim(),
			shortDescription: this.shortDescription.trim(),
			description: this.description.trim(),
			nightSchedule: this.nightSchedule
				.map((slot) => ({
					label: slot.label.trim(),
					startTime: slot.startTime,
					endTime: slot.endTime,
				}))
				.filter((slot) => slot.label),
			operationsNotes: this.operationsNotes.trim(),
			imageLinks: this.imageLinksText
				.split(/\r?\n/)
				.map((link) => link.trim())
				.filter(Boolean),
			startsOn: this.startsOn,
			time: this.startTime && this.endTime ? "" : this.time.trim(),
			startTime: this.startTime,
			endTime: this.endTime,
			repeatEvery: Number(this.repeatEvery) || 1,
			repeatUnit: this.repeatUnit,
			weekdays: this.weekdays,
			monthDay: Number(this.monthDay) || 0,
			endsOn: this.endsOn,
			...(this.repeatUnit === "once" ? { replacesSeries: this.replacesSeries } : {}),
			...(this.webAddressChanged(current) ? { slug: this.webAddress.trim() } : {}),
			heroCrops: this.heroCrops || null,
		};
	}

	/** Empty means this night keeps the series value. */
	nightField(current: OpsEvent | null, key: SeriesTextKey, value: string): string {
		const trimmed = value.trim();
		if (!this.isOverridden(key) || trimmed.toLowerCase() === seriesText(current, key).toLowerCase()) {
			return "";
		}
		return trimmed;
	}

	/** Save body for one night of a series (`scope` spreads it to later nights or all). */
	occurrenceBody(
		scope: "this" | "following" | "all",
		current: OpsEvent | null,
		options: { seriesId: string; occurrenceDate: string; hasOwnPhoto: boolean },
	) {
		const occurrence = current?.dates.find((row) => row.date === options.occurrenceDate);
		const ownLinks = occurrence?.overrides?.imageLinks?.length
			? occurrence.overrides.imageLinks
			: [];
		return {
			scope,
			date: this.startsOn,
			seriesId: options.seriesId,
			name: this.nightField(current, "name", this.name),
			artist: this.nightField(current, "artist", this.artist),
			offer: this.nightField(current, "offer", this.offer),
			pageUrl: this.nightField(current, "pageUrl", this.pageUrl),
			description: this.nightField(current, "description", this.description),
			shortDescription: this.nightField(current, "shortDescription", this.shortDescription),
			operationsNotes: this.nightField(current, "operationsNotes", this.operationsNotes),
			imageLinks: ownLinks,
			time: !this.ownTimes() || (this.startTime && this.endTime) ? "" : this.time.trim(),
			startTime: this.nightField(current, "startTime", this.startTime),
			endTime: this.nightField(current, "endTime", this.endTime),
			heroCrops: options.hasOwnPhoto ? this.heroCrops || null : null,
		};
	}

	/** The night keeps times of its own (so its free-text time goes too). */
	private ownTimes(): boolean {
		return this.isOverridden("startTime") || this.isOverridden("endTime");
	}

	/**
	 * Save body for a night not saved yet: the fields it overrides, each
	 * blank when it matches the series, so the rest follow the series.
	 */
	newNightBody(series: OpsEvent | null) {
		const field = (key: SeriesTextKey) => this.nightField(series, key, String(this[key] || ""));
		return {
			name: field("name"),
			artist: field("artist"),
			offer: field("offer"),
			pageUrl: field("pageUrl"),
			description: field("description"),
			shortDescription: field("shortDescription"),
			operationsNotes: field("operationsNotes"),
			imageLinks: this.imageLinksText
				.split(/\r?\n/)
				.map((link) => link.trim())
				.filter(Boolean),
			time: !this.ownTimes() || (this.startTime && this.endTime) ? "" : this.time.trim(),
			startTime: field("startTime"),
			endTime: field("endTime"),
		};
	}

	/** Upcoming nights from the rule as it stands in the form (today onwards). */
	upcomingDates(current: OpsEvent | null, today = new Date().toISOString().slice(0, 10)): string[] {
		return expandSeriesOccurrenceDates({
			startsOn: this.startsOn,
			repeatEvery: Number(this.repeatEvery) || 1,
			repeatUnit: this.repeatUnit,
			weekdays: this.weekdays,
			monthDay: Number(this.monthDay) || undefined,
			endsOn: this.endsOn,
			skippedDates: current?.skippedDates,
			extraDates: current?.extraDates,
		}).filter((date: string) => date >= today);
	}

	/** Open series only. Recurring residencies are not special events. */
	nightIsSpecialEvent(occurrence: OpsEventOccurrence | undefined): boolean {
		if (String(this.repeatUnit || "none").toLowerCase() !== "none") return false;
		return Boolean(occurrence?.isSpecialEdition);
	}

	/** A night's own title when it has one, else its date. */
	nightHeadline(
		current: OpsEvent | null,
		occurrence: OpsEventOccurrence | undefined,
		date: string,
	): string {
		return this.nightTitle(current, occurrence) || formatDate(date);
	}

	/** Lines under a night on Schedule: date (when titled), times, guest, offer. */
	nightDetailLines(
		current: OpsEvent | null,
		occurrence: OpsEventOccurrence | undefined,
		date: string,
	): string[] {
		const lines: string[] = [];
		if (this.nightTitle(current, occurrence)) lines.push(formatDate(date));
		const when = this.nightTimeLabel(occurrence);
		if (when) lines.push(when);
		const guestOverride = String(occurrence?.overrides.artist || "").trim();
		const seriesGuest = String(this.artist || "").trim();
		if (guestOverride) {
			lines.push(`Guest · ${guestOverride}`);
		} else if (this.repeatUnit !== "none" && seriesGuest) {
			lines.push(seriesGuest);
		} else if (this.repeatUnit !== "none") {
			lines.push("Series night");
		}
		const nightOffer = String(occurrence?.overrides.offer || "").trim();
		if (nightOffer) lines.push(nightOffer);
		return lines;
	}

	private nightTitle(current: OpsEvent | null, occurrence: OpsEventOccurrence | undefined): string {
		const overrideName = String(occurrence?.overrides.name || "").trim();
		const seriesName = String(this.name || current?.name || "").trim();
		return overrideName && overrideName.toLowerCase() !== seriesName.toLowerCase()
			? overrideName
			: "";
	}

	private nightTimeLabel(occurrence: OpsEventOccurrence | undefined): string {
		const start = formatClock(occurrence?.overrides.startTime || this.startTime || "");
		const end = formatClock(occurrence?.overrides.endTime || this.endTime || "");
		if (start && end) return `${start}–${end}`;
		if (start) return `From ${start}`;
		return String(occurrence?.overrides.time || this.time || "").trim();
	}
}
