<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import {
		BusyOverlay,
		Button,
		Dialog,
		EditorBackBar,
		Field,
		MultiSelect,
		NativeSelect,
		PageHeader,
		PageHelp,
		SearchField,
		Segmented,
		TextArea,
		TextField,
		Tip,
	} from "../../ui";
	import type { SegmentedItem } from "../../ui/types";
	import PhotoCell from "../menu/cells/PhotoCell.svelte";
	import MethodEditor from "../menu/MethodEditor.svelte";
	import { EVENTS_HELP } from "./events-help";
	import SitePublishMonitor from "../web/SitePublishMonitor.svelte";
	import { eventHeaderFlag } from "../../lib/event-header-status";
	import HeroImagePanel from "./HeroImagePanel.svelte";
	import {
		HERO_ASPECT,
		hasMeaningfulFraming,
		normalizeHeroFraming,
		type HeroFraming,
	} from "./hero-crops";
	import {
		clearEventImage,
		clearEventOccurrenceImage,
		createEvent,
		deleteEvent,
		deleteEventOccurrence,
		ensureEventOccurrence,
		eventDriveFileUrl,
		getEventDrive,
		getEvents,
		publishAllEventsPreview,
		publishEvent,
		updateEvent,
		updateEventOccurrence,
		uploadEventDriveImage,
		uploadEventImage,
		uploadEventOccurrenceImage,
		type EventDriveFile,
		type OpsEvent,
		type OpsNightScheduleSlot,
	} from "../../lib/api";
	import {
		editorKey,
		eventItemPath,
		eventListPath,
		eventNewPath,
		eventTabPath,
		leaveEditor,
		loginNext,
		navigate,
		normalizeEventTab,
		parseShellPath,
	} from "../../lib/nav";
	import { setCrumbLeaf } from "../../lib/crumbs.svelte";
	import {
		compareSeriesByWeekday,
		countEventScheduleRows,
		filterEventSchedule,
		formatScheduleDate,
		formatScheduleWeekday,
		groupEventSchedule,
		seriesNextNightLabel,
		seriesWeekdayLabel,
	} from "../../lib/event-schedule";
	import { toast } from "../../lib/toast.svelte";
	import { easeOut, fadeMs, flyMs } from "../../lib/motion";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../../lib/unsaved.svelte";
	import {
		WEEKDAYS,
		expandSeriesOccurrenceDates,
	} from "../../../../functions/_lib/event-recurrence.js";

	let { path = "/" }: { path?: string } = $props();

	const WEEKDAY_LABELS: Record<string, string> = {
		mon: "Mon",
		tue: "Tue",
		wed: "Wed",
		thu: "Thu",
		fri: "Fri",
		sat: "Sat",
		sun: "Sun",
	};

	let events = $state<OpsEvent[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let intent = $state<"" | "save" | "delete" | "image">("");
	let publishing = $state("");
	let error = $state("");
	let warnings = $state<string[]>([]);
	let openedKey = $state("");
	let deleteOpen = $state(false);
	let deleteScopeOpen = $state(false);
	let discardOpen = $state(false);
	let saveScopeOpen = $state(false);
	let seriesQuery = $state("");
	let scheduleEventIds = $state<string[]>([]);
	let scheduleQuery = $state("");
	let scheduleFrom = $state("");
	let scheduleTo = $state("");
	let discardKind = $state<"close" | "reload">("close");
	let photoDragging = $state(false);
	let photoDragDepth = 0;
	let driveFiles = $state<EventDriveFile[]>([]);
	let driveFolderUrl = $state("");
	let driveLoading = $state(false);
	let driveUploading = $state(false);
	let driveError = $state("");
	let driveDragging = $state(false);
	let driveDragDepth = 0;
	let driveLoadedFor = $state("");
	let tabSlide = $state(1);
	let tabPrev = "details";
	let tabReady = false;
	let heroCrops = $state<HeroFraming | null>(null);
	let autoPublishStaging = $state(false);

	let name = $state("");
	let artist = $state("");
	let offer = $state("");
	let shortDescription = $state("");
	let description = $state("");
	let nightSchedule = $state<OpsNightScheduleSlot[]>([]);
	let operationsNotes = $state("");
	let imageLinksText = $state("");
	let startsOn = $state("");
	let time = $state("");
	let startTime = $state("");
	let endTime = $state("");
	let repeatEvery = $state("1");
	let repeatUnit = $state("none");
	let weekdays = $state<string[]>([]);
	let monthDay = $state("");
	let endsOn = $state("");
	let current = $state<OpsEvent | null>(null);
	let attachSeriesId = $state("");

	let listOrigin = $state<"series" | "schedule">("series");
	const route = $derived(parseShellPath(path));
	const editing = $derived(route.page === "events" && (route.isNew || Boolean(route.slug)));
	const routeList = $derived(
		(route as { list?: string }).list === "schedule" ? "schedule" : (route as { list?: string }).list === "series" ? "series" : null,
	);
	const creatingNight = $derived(route.isNew && Boolean(attachSeriesId));
	const seriesOptions = $derived(
		events
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((event) => ({ value: event.id, label: event.name })),
	);
	const occurrenceRoute = $derived.by(() => {
		const match = /^([^@]+)@(\d{4}-\d{2}-\d{2})$/.exec(String(route.slug || ""));
		return match ? { eventId: match[1], date: match[2] } : null;
	});
	const eventId = $derived(
		route.isNew ? "" : occurrenceRoute?.eventId || String(route.slug || ""),
	);
	const occurrenceDate = $derived(occurrenceRoute?.date || "");
	const editingOccurrence = $derived(Boolean(occurrenceDate));
	const listView = $derived<"series" | "schedule">(
		routeList ??
			(editingOccurrence
				? "schedule"
				: editing && !route.isNew
					? "series"
					: listOrigin),
	);
	const listTitle = $derived(listView === "schedule" ? "Schedule" : "Series");
	const currentOccurrence = $derived(
		current?.dates.find((occurrence) => occurrence.date === occurrenceDate) || null,
	);
	const tab = $derived(normalizeEventTab(route.tab));
	const busy = $derived(
		loading || saving || driveUploading || Boolean(publishing),
	);
	const busyLabel = $derived(
		publishing === "all"
			? "Updating all previews…"
			: publishing
				? "Publishing…"
				: loading
					? "Loading…"
					: driveUploading
						? "Uploading…"
						: intent === "delete"
							? "Deleting…"
							: intent === "image"
								? "Updating photo…"
								: "Saving…",
	);
	const missing = $derived(
		editing && !route.isNew && !loading && !current && Boolean(error),
	);

	function fieldSnapshot(row: {
		name?: string;
		artist?: string;
		offer?: string;
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

	function occurrenceSnapshot(row: {
		name?: string;
		artist?: string;
		offer?: string;
		description?: string;
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
			description: String(row.description || "").trim(),
			operationsNotes: String(row.operationsNotes || "").trim(),
			imageLinks: [...(row.imageLinks || [])].map((link) => link.trim()).filter(Boolean),
			date: row.date || "",
			time: String(row.time || "").trim(),
			startTime: row.startTime || "",
			endTime: row.endTime || "",
		});
	}

	function cropsKey(value: HeroFraming | Record<string, unknown> | null | undefined) {
		if (!value || !hasMeaningfulFraming(normalizeHeroFraming(value))) return "";
		return JSON.stringify(normalizeHeroFraming(value));
	}

	const formDirty = $derived.by(() => {
		if (editingOccurrence && current) {
			const overrides = currentOccurrence?.overrides;
			const fieldsDirty =
				occurrenceSnapshot({
					name,
					artist,
					offer,
					description,
					operationsNotes,
					imageLinks: imageLinksText.split(/\r?\n/),
					date: startsOn,
					time,
					startTime,
					endTime,
				}) !==
				occurrenceSnapshot({
					name: overrides?.name || current.name,
					artist: overrides?.artist || current.artist,
					offer: overrides?.offer || current.offer,
					description: overrides?.description || current.description,
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
				cropsKey(heroCrops) !== cropsKey(overrides?.heroCrops);
			return fieldsDirty || cropsDirty || attachSeriesId !== eventId;
		}
		const draft = fieldSnapshot({
			name,
			artist,
			offer,
			shortDescription,
			description,
			nightSchedule,
			operationsNotes,
			imageLinks: imageLinksText.split(/\r?\n/),
			startsOn,
			time,
			startTime,
			endTime,
			repeatEvery,
			repeatUnit,
			weekdays,
			monthDay,
			endsOn,
		});
		if (!current) {
			return (
				draft !==
				fieldSnapshot({
					name: "",
					artist: "",
					offer: "",
					shortDescription: "",
					description: "",
					nightSchedule: [],
					operationsNotes: "",
					imageLinks: [],
					startsOn: "",
					time: "",
					startTime: "",
					endTime: "",
					repeatEvery: 1,
					repeatUnit: "none",
					weekdays: [],
					monthDay: 0,
					endsOn: "",
				})
			);
		}
		return (
			draft !== fieldSnapshot(current) ||
			cropsKey(heroCrops) !== cropsKey(current.heroCrops)
		);
	});

	const previewDates = $derived(
		expandSeriesOccurrenceDates({
			startsOn,
			repeatEvery: Number(repeatEvery) || 1,
			repeatUnit,
			weekdays,
			monthDay: Number(monthDay) || undefined,
			endsOn,
			skippedDates: current?.skippedDates,
			extraDates: current?.extraDates,
		}).filter((date) => date >= new Date().toISOString().slice(0, 10)),
	);

	const schedule = $derived(groupEventSchedule(events));
	const eventFilterOptions = $derived(
		[...events]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((event) => ({ value: event.id, label: event.name })),
	);
	const filteredSchedule = $derived(
		filterEventSchedule(schedule, {
			eventIds: scheduleEventIds,
			query: scheduleQuery,
			from: scheduleFrom,
			to: scheduleTo,
		}),
	);
	const visibleSchedule = $derived(filteredSchedule);

	const filteredSeries = $derived.by(() => {
		const q = seriesQuery.trim().toLowerCase();
		return [...events]
			.filter((event) => {
				if (!q) return true;
				const hay = [
					event.name,
					event.artist,
					event.offer,
					event.shortDescription,
					event.description,
					...(event.nightSchedule || []).map((slot) => slot.label),
				]
					.join(" ")
					.toLowerCase();
				return hay.includes(q);
			})
			.sort(compareSeriesByWeekday);
	});

	function seriesNextIso(event: OpsEvent): string {
		return String(event.publish?.nextDate || event.publish?.previewDates?.[0] || "").trim();
	}

	function seriesTimeLabel(event: OpsEvent): string {
		const start = formatClock(event.startTime);
		const end = formatClock(event.endTime);
		if (start && end) return `${start}–${end}`;
		if (start) return start;
		return String(event.time || "").trim();
	}

	function seriesGuestLabel(event: OpsEvent): string {
		const artist = String(event.artist || "").trim();
		if (artist) return artist;
		const night = (event.dates || []).find((row) => row.date === seriesNextIso(event));
		return String(night?.overrides?.artist || "").trim();
	}

	function seriesOfferLabel(event: OpsEvent): string {
		const offer = String(event.offer || "").trim();
		if (offer) return offer;
		const night = (event.dates || []).find((row) => row.date === seriesNextIso(event));
		return String(night?.overrides?.offer || "").trim();
	}

	/** Short card blurb, or night-slot labels when the blurb is empty. */
	function seriesBlurb(event: OpsEvent): string {
		const short = String(event.shortDescription || "").trim();
		if (short) return short;
		return (event.nightSchedule || [])
			.map((slot) => String(slot.label || "").trim())
			.filter(Boolean)
			.join(" · ");
	}

	function formatDayMonth(iso: string): string {
		const [year, month, day] = iso.split("-").map(Number);
		if (!year || !month || !day) return iso;
		return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short",
		});
	}

	function seriesNextCell(event: OpsEvent): string {
		const next = seriesNextIso(event);
		if (!next) return "No nights";
		const night = seriesNextNightLabel(event);
		const date = formatDayMonth(next);
		return night ? `${date} · ${night}` : date;
	}
	const seriesFiltersActive = $derived(Boolean(seriesQuery.trim()));
	const scheduleFiltersActive = $derived(
		scheduleEventIds.length > 0 ||
			Boolean(scheduleQuery.trim()) ||
			Boolean(scheduleFrom) ||
			Boolean(scheduleTo),
	);
	const filtersActive = $derived(
		listView === "schedule" ? scheduleFiltersActive : seriesFiltersActive,
	);

	const photoUrl = $derived(
		editingOccurrence
			? currentOccurrence?.overrides?.image?.url || current?.mainImage?.url || ""
			: current?.mainImage?.url || "",
	);
	/** Photo owned by this editor (series main, or night override). */
	const framingUrl = $derived(
		editingOccurrence
			? currentOccurrence?.overrides?.image?.url || ""
			: current?.mainImage?.url || "",
	);
	const canRemovePhoto = $derived(
		editingOccurrence
			? Boolean(currentOccurrence?.overrides?.image?.url)
			: Boolean(current?.mainImage),
	);
	/** Open series (Gwenda Nights): one night at a time, no future-events scope. */
	const isOpenSeries = $derived(
		String(current?.repeatUnit || repeatUnit || "none").toLowerCase() === "none",
	);
	const typeLine = $derived(
		repeatLabel({
			repeatEvery: Number(repeatEvery) || 1,
			repeatUnit: repeatUnit as OpsEvent["repeatUnit"],
			weekdays,
			monthDay: Number(monthDay) || 0,
		}),
	);
	const headerDate = $derived(
		occurrenceDate
			? formatDate(occurrenceDate)
			: previewDates[0]
				? formatDate(previewDates[0])
				: startsOn
					? formatDate(startsOn)
					: "No date",
	);
	const headerFlag = $derived(eventHeaderFlag(current?.publish, formDirty));
	const stagingPreviewCurrent = $derived(current?.publish.preview === "current");
	const liveCurrent = $derived(current?.publish.live === "current");
	const stagingVerifyHref = $derived("https://gwenda-staging.pages.dev/whats-on");
	const liveVerifyHref = $derived("https://gwenda.co.uk/whats-on");

	const tabs = $derived.by((): SegmentedItem[] => {
		const base = route.isNew
			? "/events/new"
			: route.slug
				? `/events/${encodeURIComponent(route.slug)}`
				: "/events/new";
		const hrefFor = (id: string) => eventTabPath(base, id);
		if (creatingNight) {
			return [{ id: "details", label: "Details", href: hrefFor("details") }];
		}
		if (editingOccurrence) {
			return [
				{ id: "details", label: "Details", href: hrefFor("details") },
				{
					id: "schedule",
					label: "Schedule",
					href: eventItemPath(eventId, "schedule"),
				},
				{ id: "gallery", label: "Images", href: hrefFor("gallery") },
				{ id: "publish", label: "Publish", href: hrefFor("publish") },
			];
		}
		return [
			{ id: "details", label: "Details", href: hrefFor("details") },
			{ id: "schedule", label: "Schedule", href: hrefFor("schedule") },
			{ id: "gallery", label: "Images", href: hrefFor("gallery") },
			{ id: "publish", label: "Publish", href: hrefFor("publish") },
		];
	});

	function repeatLabel(event: {
		repeatEvery?: number;
		repeatUnit?: string;
		weekdays?: string[];
		monthDay?: number;
	}): string {
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

	function statusLabel(event: OpsEvent): string {
		if (event.publish.preview !== "current") return "Unpublished";
		if (event.publish.live === "current") return "Live";
		return "Staging";
	}

	function statusTone(event: OpsEvent | null): string {
		if (!event) return "muted";
		if (event.publish.preview !== "current") return "unpublished";
		if (event.publish.live === "current") return "live";
		return "preview";
	}

	function formatDate(iso: string): string {
		if (!iso) return "";
		const [year, month, day] = iso.split("-").map(Number);
		if (!year || !month || !day) return iso;
		return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
			weekday: "short",
			day: "numeric",
			month: "short",
		});
	}

	function formatClock(value: string): string {
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

	function nightTimeLabel(occurrence: OpsEventOccurrence | undefined): string {
		const start = formatClock(occurrence?.overrides.startTime || startTime || "");
		const end = formatClock(occurrence?.overrides.endTime || endTime || "");
		if (start && end) return `${start}–${end}`;
		if (start) return `From ${start}`;
		return String(occurrence?.overrides.time || time || "").trim();
	}

	/** Open series only. Recurring residencies are not special events. */
	function nightIsSpecialEvent(occurrence: OpsEventOccurrence | undefined): boolean {
		if (String(repeatUnit || "none").toLowerCase() !== "none") return false;
		return Boolean(occurrence?.isSpecialEdition);
	}

	function nightHeadline(occurrence: OpsEventOccurrence | undefined, date: string): string {
		const overrideName = String(occurrence?.overrides.name || "").trim();
		const seriesName = String(name || current?.name || "").trim();
		if (overrideName && overrideName.toLowerCase() !== seriesName.toLowerCase()) {
			return overrideName;
		}
		return formatDate(date);
	}

	function nightDetailLines(
		occurrence: OpsEventOccurrence | undefined,
		date: string,
	): string[] {
		const lines: string[] = [];
		const overrideName = String(occurrence?.overrides.name || "").trim();
		const seriesName = String(name || current?.name || "").trim();
		const titled =
			overrideName && overrideName.toLowerCase() !== seriesName.toLowerCase();
		if (titled) lines.push(formatDate(date));
		const when = nightTimeLabel(occurrence);
		if (when) lines.push(when);
		const guestOverride = String(occurrence?.overrides.artist || "").trim();
		const seriesGuest = String(artist || "").trim();
		if (guestOverride) {
			lines.push(`Guest · ${guestOverride}`);
		} else if (repeatUnit !== "none" && seriesGuest) {
			lines.push(seriesGuest);
		} else if (repeatUnit !== "none") {
			lines.push("Series night");
		}
		const nightOffer = String(occurrence?.overrides.offer || "").trim();
		if (nightOffer) lines.push(nightOffer);
		return lines;
	}

	function fill(event: OpsEvent) {
		current = event;
		const occurrence = occurrenceDate
			? event.dates.find((row) => row.date === occurrenceDate)
			: null;
		name = occurrence?.overrides.name || event.name;
		artist = occurrence?.overrides.artist || event.artist || "";
		offer = occurrence?.overrides.offer || event.offer || "";
		shortDescription = occurrence
			? occurrence.overrides.shortDescription || ""
			: event.shortDescription || "";
		description = occurrence?.overrides.description || event.description || "";
		nightSchedule = (event.nightSchedule || []).map((slot) => ({
			label: slot.label || "",
			startTime: slot.startTime || "",
			endTime: slot.endTime || "",
		}));
		operationsNotes =
			occurrence?.overrides.operationsNotes || event.operationsNotes || "";
		imageLinksText = (
			occurrence?.overrides.imageLinks?.length
				? occurrence.overrides.imageLinks
				: event.imageLinks || []
		).join("\n");
		startsOn = occurrenceDate || event.startsOn || "";
		time = occurrence?.overrides.time || event.time || "";
		startTime = occurrence?.overrides.startTime || event.startTime || "";
		endTime = occurrence?.overrides.endTime || event.endTime || "";
		repeatEvery = String(event.repeatEvery || 1);
		repeatUnit = event.repeatUnit || "none";
		weekdays = [...(event.weekdays || [])];
		monthDay = event.monthDay ? String(event.monthDay) : "";
		endsOn = event.endsOn || "";
		attachSeriesId = event.id;
		if (occurrence?.overrides?.image?.url) {
			heroCrops = normalizeHeroFraming(occurrence.overrides.heroCrops);
		} else if (!occurrenceDate) {
			heroCrops = event.heroCrops
				? normalizeHeroFraming(event.heroCrops)
				: null;
		} else {
			heroCrops = null;
		}
	}

	function blank() {
		current = null;
		name = "";
		artist = "";
		offer = "";
		shortDescription = "";
		description = "";
		nightSchedule = [];
		operationsNotes = "";
		imageLinksText = "";
		startsOn = "";
		time = "";
		startTime = "";
		endTime = "";
		repeatEvery = "1";
		repeatUnit = "none";
		weekdays = [];
		monthDay = "";
		endsOn = "";
		attachSeriesId = "";
		warnings = [];
		heroCrops = null;
	}

	function addNightSlot() {
		nightSchedule = [
			...nightSchedule,
			{ label: "", startTime: "", endTime: "" },
		];
	}

	function removeNightSlot(index: number) {
		nightSchedule = nightSchedule.filter((_, i) => i !== index);
	}

	function syncHeroCropsFromEvent(event: OpsEvent) {
		if (occurrenceDate) {
			const occurrence = event.dates.find((row) => row.date === occurrenceDate);
			heroCrops = occurrence?.overrides?.image?.url
				? normalizeHeroFraming(occurrence.overrides.heroCrops)
				: null;
			return;
		}
		heroCrops = event.heroCrops ? normalizeHeroFraming(event.heroCrops) : null;
	}

	function rememberEvent(event: OpsEvent, replaceFields: boolean) {
		events = events.some((row) => row.id === event.id)
			? events.map((row) => (row.id === event.id ? event : row))
			: [...events, event];
		if (replaceFields) fill(event);
		else {
			current = event;
			syncHeroCropsFromEvent(event);
		}
	}

	function body() {
		return {
			name: name.trim(),
			artist: artist.trim(),
			offer: offer.trim(),
			shortDescription: shortDescription.trim(),
			description: description.trim(),
			nightSchedule: nightSchedule
				.map((slot) => ({
					label: slot.label.trim(),
					startTime: slot.startTime,
					endTime: slot.endTime,
				}))
				.filter((slot) => slot.label),
			operationsNotes: operationsNotes.trim(),
			imageLinks: imageLinksText
				.split(/\r?\n/)
				.map((link) => link.trim())
				.filter(Boolean),
			startsOn,
			time: startTime && endTime ? "" : time.trim(),
			startTime,
			endTime,
			repeatEvery: Number(repeatEvery) || 1,
			repeatUnit,
			weekdays,
			monthDay: Number(monthDay) || 0,
			endsOn,
			heroCrops: heroCrops || null,
		};
	}

	function occurrenceBody(scope: "this" | "following" | "all") {
		return {
			scope,
			date: startsOn,
			seriesId: attachSeriesId || eventId,
			name: name.trim(),
			artist: artist.trim(),
			offer: offer.trim(),
			description: description.trim(),
			shortDescription: shortDescription.trim(),
			operationsNotes: operationsNotes.trim(),
			imageLinks: imageLinksText
				.split(/\r?\n/)
				.map((link) => link.trim())
				.filter(Boolean),
			time: startTime && endTime ? "" : time.trim(),
			startTime,
			endTime,
			heroCrops: framingUrl ? heroCrops || null : null,
		};
	}

	async function reload() {
		loading = true;
		error = "";
		try {
			const data = await getEvents();
			events = data.events || [];
			if (eventId) {
				const found = events.find((event) => event.id === eventId);
				if (found) fill(found);
				else error = "Event not found.";
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not load events.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/events"))}`;
				return;
			}
			error = message;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void reload();
	});

	function clearListFilters() {
		if (listView === "schedule") {
			scheduleEventIds = [];
			scheduleQuery = "";
			scheduleFrom = "";
			scheduleTo = "";
			return;
		}
		seriesQuery = "";
	}

	$effect(() => {
		if (routeList) listOrigin = routeList;
	});

	$effect(() => {
		if (!editing) return;
		const canonical = route.isNew
			? eventNewPath(route.tab || "details")
			: route.slug
				? eventItemPath(route.slug, route.tab || "details")
				: "";
		if (canonical && canonical !== path) navigate(canonical, { replace: true });
	});

	$effect(() => {
		const label = !editing
			? ""
			: name.trim() || (route.isNew ? "New event" : "Event");
		setCrumbLeaf(label);
		return () => setCrumbLeaf("");
	});

	$effect(() => {
		if (!editing) {
			openedKey = "";
			return;
		}
		const key = editorKey(path);
		const list = events;
		if (key !== openedKey) {
			openedKey = key;
			warnings = [];
			if (route.isNew) {
				blank();
				return;
			}
			if (current?.id === eventId) {
				fill(current);
				return;
			}
		}
		if (route.isNew || current?.id === eventId) return;
		const found = list.find((event) => event.id === eventId);
		if (found) fill(found);
	});

	$effect(() => {
		const id = tab;
		if (!editing) return;
		if (!tabReady) {
			tabPrev = id;
			tabReady = true;
			return;
		}
		const order = ["details", "schedule", "gallery", "publish"];
		const from = order.indexOf(tabPrev);
		const to = order.indexOf(id);
		if (from >= 0 && to >= 0 && from !== to) tabSlide = to > from ? 1 : -1;
		tabPrev = id;
	});

	$effect(() => {
		if (!editing) {
			clearUnsavedGuard();
			return;
		}
		setUnsavedGuard(formDirty, () => {
			discardKind = "close";
			discardOpen = true;
		});
	});

	$effect(() => {
		if (!editing || !formDirty || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	$effect(() => {
		if (!editing || typeof window === "undefined") return;
		function onKey(e: KeyboardEvent) {
			if (busy) return;
			if (e.key !== "Escape") return;
			if (deleteOpen || deleteScopeOpen || discardOpen) return;
			e.preventDefault();
			requestClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	$effect(() => {
		if (!editing || tab !== "gallery") return;
		void loadDriveLibrary();
	});

	onDestroy(() => clearUnsavedGuard());

	function toggleWeekday(day: string) {
		weekdays = weekdays.includes(day)
			? weekdays.filter((item) => item !== day)
			: [...weekdays, day];
	}

	function listHomePath() {
		return editingOccurrence ? eventListPath("schedule") : eventListPath("series");
	}

	function requestClose() {
		if (busy) return;
		if (formDirty) {
			discardKind = "close";
			discardOpen = true;
			return;
		}
		leaveEditor(listHomePath());
	}

	function requestReload() {
		if (busy || !eventId) return;
		if (formDirty) {
			discardKind = "reload";
			discardOpen = true;
			return;
		}
		void reload();
	}

	function cancelDiscard() {
		discardOpen = false;
		takeBlockedNav();
	}

	function confirmDiscard() {
		if (busy) return;
		const kind = discardKind;
		discardOpen = false;
		if (kind === "reload") {
			void reload();
			return;
		}
		beginLeave();
		const pending = takeBlockedNav();
		if (pending?.path) {
			navigate(pending.path, { force: true, replace: pending.replace });
			return;
		}
		leaveEditor(listHomePath(), { force: true });
	}

	function requestDelete() {
		if (!eventId || busy) return;
		if (editingOccurrence && !isOpenSeries) {
			deleteScopeOpen = true;
			return;
		}
		deleteOpen = true;
	}

	function cancelDelete() {
		if (busy) return;
		deleteOpen = false;
		deleteScopeOpen = false;
	}

	async function performDelete(scope: "this" | "following" | "all" | "series" = "series") {
		if (!eventId || busy) return;
		deleteOpen = false;
		deleteScopeOpen = false;
		saving = true;
		intent = "delete";
		try {
			if (scope === "series" || !editingOccurrence || !occurrenceDate) {
				await deleteEvent(eventId);
				events = events.filter((row) => row.id !== eventId);
				toast.ok("Event deleted.");
				beginLeave();
				leaveEditor(listHomePath(), { force: true });
			} else {
				const data = await deleteEventOccurrence(eventId, occurrenceDate, scope);
				warnings = data.warnings || [];
				if (data.deleted || !data.event) {
					events = events.filter((row) => row.id !== eventId);
					toast.ok(
						scope === "this" ? "Night deleted." : "Events deleted.",
					);
					beginLeave();
					leaveEditor(listHomePath(), { force: true });
				} else {
					rememberEvent(data.event, true);
					const count = Number(data.removed) || 1;
					toast.ok(count === 1 ? "Night deleted." : `${count} nights deleted.`);
					beginLeave();
					leaveEditor(listHomePath(), { force: true });
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not delete the event.";
			error = message;
			toast.error(message);
		} finally {
			saving = false;
			intent = "";
		}
	}

	async function onSave(event: Event) {
		event.preventDefault();
		if (busy) return;
		if (creatingNight) {
			if (!attachSeriesId || !startsOn) {
				const message = !attachSeriesId ? "Choose a series." : "Add a date.";
				error = message;
				toast.error(message);
				return;
			}
			saving = true;
			intent = "save";
			error = "";
			try {
				const data = await ensureEventOccurrence(attachSeriesId, startsOn, {
					name: name.trim(),
					artist: artist.trim(),
					offer: offer.trim(),
					description: description.trim(),
					shortDescription: shortDescription.trim(),
					operationsNotes: operationsNotes.trim(),
					imageLinks: imageLinksText
						.split(/\r?\n/)
						.map((link) => link.trim())
						.filter(Boolean),
					time: startTime && endTime ? "" : time.trim(),
					startTime,
					endTime,
				});
				rememberEvent(data.event, true);
				toast.ok(data.created ? "Night added to the series." : "Night opened.");
				navigate(eventItemPath(`${attachSeriesId}@${startsOn}`), { replace: true });
			} catch (err) {
				const message = err instanceof Error ? err.message : "Could not add the night.";
				error = message;
				toast.error(message);
			} finally {
				saving = false;
				intent = "";
			}
			return;
		}
		if (!name.trim() || (!creatingNight && !startsOn && repeatUnit !== "none")) {
			const message = !name.trim()
				? "Add a name."
				: "Add a start date on Schedule.";
			error = message;
			toast.error(message);
			const target = route.isNew
				? eventNewPath(!name.trim() ? "details" : "schedule")
				: eventItemPath(route.slug || eventId, !name.trim() ? "details" : "schedule");
			if (path !== target) navigate(target);
			return;
		}
		if (!editingOccurrence && repeatUnit !== "none" && !endsOn) {
			error = "Add an end date for the recurring event.";
			toast.error(error);
			return;
		}
		if (editingOccurrence) {
			if (
				isOpenSeries ||
				attachSeriesId !== eventId ||
				startsOn !== occurrenceDate
			) {
				await saveOccurrenceWithScope("this");
			} else {
				saveScopeOpen = true;
			}
			return;
		}
		saving = true;
		intent = "save";
		error = "";
		try {
			if (!eventId) {
				const data = await createEvent(body());
				rememberEvent(data.event, true);
				toast.ok("Series saved.");
				navigate(eventItemPath(data.event.id, tab), { replace: true });
			} else {
				const payload = body();
				const data = await updateEvent(eventId, payload);
				rememberEvent(data.event, true);
				if (payload.heroCrops) {
					try {
						await publishEvent(eventId, "staging");
						toast.ok("Saved and updated preview with framing.");
					} catch {
						toast.ok("Saved. Open Publish and Update preview to push framing.");
					}
				} else {
					toast.ok("Series saved.");
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not save the event.";
			error = message;
			toast.error(message);
		} finally {
			saving = false;
			intent = "";
		}
	}

	async function saveOccurrenceWithScope(scope: "this" | "following" | "all") {
		if (!eventId || !occurrenceDate || busy) return;
		saveScopeOpen = false;
		saving = true;
		intent = "save";
		error = "";
		try {
			const data = await updateEventOccurrence(
				eventId,
				occurrenceDate,
				occurrenceBody(scope),
			);
			rememberEvent(data.event, true);
			const movedTo = data.movedTo || "";
			const assignedTo = String(data.assignedTo || eventId);
			if (assignedTo !== eventId || (movedTo && movedTo !== occurrenceDate)) {
				if (data.sourceDeleted) {
					events = events.filter((row) => row.id !== eventId);
				} else {
					try {
						const refreshed = await getEvents();
						events = refreshed.events || events;
					} catch {
						/* keep local list */
					}
				}
				toast.ok(assignedTo !== eventId ? "Night assigned to series." : "Night moved.");
				beginLeave();
				navigate(eventItemPath(`${assignedTo}@${movedTo || startsOn}`, tab), {
					replace: true,
					force: true,
				});
			} else {
				const count = "updated" in data ? Number(data.updated) || 1 : 1;
				toast.ok(count === 1 ? "Event saved." : `${count} events saved.`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not save the event.";
			error = message;
			toast.error(message);
		} finally {
			saving = false;
			intent = "";
		}
	}

	async function onPublish(target: "staging" | "production") {
		if (!eventId || busy) return;
		publishing = target;
		error = "";
		warnings = [];
		try {
			const data = await publishEvent(eventId, target);
			rememberEvent(data.event, false);
			warnings = data.warnings || [];
			toast.ok(
				target === "staging"
					? "Preview updated. Refresh What's on to see it."
					: "Pushed live.",
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Publish failed.";
			error = message;
			toast.error(message);
		} finally {
			publishing = "";
		}
	}

	function publishEditorPath() {
		if (!eventId) return "/events";
		const slug = editingOccurrence && occurrenceDate
			? `${eventId}@${occurrenceDate}`
			: eventId;
		return eventItemPath(slug, "publish");
	}

	function onHeaderPublish() {
		if (!eventId || busy) return;
		const alreadyOnPublish = tab === "publish";
		if (!alreadyOnPublish) navigate(publishEditorPath());
		if (formDirty) {
			toast.info("Save before publishing.");
			return;
		}
		if (stagingPreviewCurrent) {
			if (!alreadyOnPublish) {
				toast.info("Preview is current. Check What's on, then push live.");
			}
			return;
		}
		autoPublishStaging = true;
	}

	$effect(() => {
		if (tab !== "publish" || !autoPublishStaging || busy || !eventId) return;
		if (formDirty) {
			autoPublishStaging = false;
			return;
		}
		if (stagingPreviewCurrent) {
			autoPublishStaging = false;
			return;
		}
		autoPublishStaging = false;
		void onPublish("staging");
	});

	async function onPublishAllPreview() {
		if (busy) return;
		publishing = "all";
		error = "";
		warnings = [];
		try {
			const data = await publishAllEventsPreview();
			events = data.events || [];
			warnings = data.warnings || [];
			if (data.failed.length) {
				const names = data.failed.map((failure) => failure.name).join(", ");
				error = `Could not update preview for: ${names}.`;
				toast.error(error);
			} else if (data.published.length) {
				const skip = Array.isArray(data.skipped) ? data.skipped.length : 0;
				toast.ok(
					skip
						? `Preview updated for ${data.published.length} events (${skip} already current).`
						: `Preview updated for ${data.published.length} events.`,
				);
			} else if (Array.isArray(data.skipped) && data.skipped.length) {
				toast.info("Preview is already up to date.");
			} else {
				toast.info("There are no events to publish.");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not update event preview.";
			error = message;
			toast.error(message);
		} finally {
			publishing = "";
		}
	}

	function acceptPhotoFile(file: File | undefined | null) {
		if (!file || !file.type.startsWith("image/")) return;
		if (!eventId) {
			toast.error("Save the event before adding a photo.");
			return;
		}
		void onImage("main", file);
	}

	function onHeroCropsChange(next: HeroFraming | null) {
		heroCrops = next && hasMeaningfulFraming(next) ? next : null;
	}

	function onPhotoInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		acceptPhotoFile(input.files?.[0]);
		input.value = "";
	}

	async function onGalleryInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files || [])];
		input.value = "";
		await uploadDriveFiles(files);
	}

	function onDriveDragEnter(e: DragEvent) {
		e.preventDefault();
		driveDragDepth += 1;
		if (e.dataTransfer?.types.includes("Files")) driveDragging = true;
	}

	function onDriveDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	}

	function onDriveDragLeave(e: DragEvent) {
		e.preventDefault();
		driveDragDepth = Math.max(0, driveDragDepth - 1);
		if (driveDragDepth === 0) driveDragging = false;
	}

	function onDriveDrop(e: DragEvent) {
		e.preventDefault();
		driveDragDepth = 0;
		driveDragging = false;
		void uploadDriveFiles([...(e.dataTransfer?.files || [])]);
	}

	async function loadDriveLibrary(force = false) {
		if (!eventId) {
			driveFiles = [];
			driveFolderUrl = "";
			driveError = "";
			driveLoadedFor = "";
			return;
		}
		if (!force && driveLoadedFor === eventId && !driveError) return;
		driveLoading = true;
		driveError = "";
		try {
			const data = await getEventDrive(eventId);
			driveFiles = data.files || [];
			driveFolderUrl = data.folder?.url || "";
			driveLoadedFor = eventId;
			if (current) {
				current = {
					...current,
					driveFolderId: data.folder?.id || current.driveFolderId,
					driveFolderUrl: data.folder?.url || current.driveFolderUrl,
				};
			}
		} catch (err) {
			driveError =
				err instanceof Error ? err.message : "Could not load Drive images.";
			driveFiles = [];
		} finally {
			driveLoading = false;
		}
	}

	async function uploadDriveFiles(fileList: File[]) {
		const files = fileList.filter((file) => file.type.startsWith("image/"));
		if (!files.length) return;
		if (!eventId) {
			toast.error("Save the event before adding images.");
			return;
		}
		driveUploading = true;
		driveError = "";
		try {
			let latest = driveFiles;
			for (const file of files) {
				const data = await uploadEventDriveImage(eventId, file);
				latest = data.files || [];
				driveFolderUrl = data.folder?.url || driveFolderUrl;
			}
			driveFiles = latest;
			driveLoadedFor = eventId;
			toast.ok(files.length === 1 ? "Image uploaded." : `${files.length} images uploaded.`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not upload to Drive.";
			driveError = message;
			toast.error(message);
		} finally {
			driveUploading = false;
		}
	}

	function onPhotoDragEnter(e: DragEvent) {
		e.preventDefault();
		photoDragDepth += 1;
		if (e.dataTransfer?.types.includes("Files")) photoDragging = true;
	}

	function onPhotoDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	}

	function onPhotoDragLeave(e: DragEvent) {
		e.preventDefault();
		photoDragDepth = Math.max(0, photoDragDepth - 1);
		if (photoDragDepth === 0) photoDragging = false;
	}

	function onPhotoDrop(e: DragEvent) {
		e.preventDefault();
		photoDragDepth = 0;
		photoDragging = false;
		acceptPhotoFile(e.dataTransfer?.files?.[0]);
	}

	async function onImage(role: "main" | "gallery", file: File | null) {
		if (!file || !eventId) return;
		saving = true;
		intent = "image";
		try {
			if (editingOccurrence && occurrenceDate && role === "main") {
				const data = await uploadEventOccurrenceImage(
					eventId,
					occurrenceDate,
					file,
				);
				rememberEvent(data.event, false);
			} else {
				const data = await uploadEventImage(eventId, file, role);
				rememberEvent(data.event, false);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not upload the image.";
			error = message;
			toast.error(message);
		} finally {
			saving = false;
			intent = "";
		}
	}

	async function onClearImage(role: "main" | "gallery", imageName = "") {
		if (!eventId || busy) return;
		saving = true;
		intent = "image";
		try {
			if (editingOccurrence && occurrenceDate && role === "main") {
				const data = await clearEventOccurrenceImage(eventId, occurrenceDate);
				rememberEvent(data.event, false);
			} else {
				const data = await clearEventImage(eventId, role, imageName);
				rememberEvent(data.event, false);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not remove the image.";
			toast.error(message);
		} finally {
			saving = false;
			intent = "";
		}
	}

</script>

<div class="events-root" class:editing>
	<!-- Keep the list mounted under the editor so week-list scroll survives open/close. -->
	<div
		class="list-page scrollbar-fade"
		class:parked={editing || missing}
		inert={editing || missing ? true : undefined}
		aria-hidden={editing || missing ? true : undefined}
	>
			<PageHeader title={listTitle}>
				{#snippet actions()}
					<PageHelp title={listTitle} topics={EVENTS_HELP} />
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onclick={() => void reload()}
					>
						{#snippet icon()}
							<Icon name="refresh" size={16} />
						{/snippet}
						Refresh
					</Button>
					<Button
						type="button"
						variant="outline"
						busy={publishing === "all"}
						disabled={busy}
						onclick={onPublishAllPreview}
					>
						{#snippet icon()}
							<Icon name="upload" size={16} />
						{/snippet}
						Update preview
					</Button>
					{#if listView === "series"}
						<Button type="button" disabled={busy} onclick={() => navigate("/events/new")}>
							{#snippet icon()}
								<Icon name="plus" size={16} />
							{/snippet}
							New series
						</Button>
					{/if}
				{/snippet}
			</PageHeader>
			{#if error && !editing && !missing}<p class="error">{error}</p>{/if}
			{#if events.length || (!error && !loading)}
				<div class="list-filters">
					<div class="filter-search">
						<span class="filter-label">Search</span>
						{#if listView === "series"}
							<SearchField
								bind:value={seriesQuery}
								placeholder="Series name…"
								ariaLabel="Search series"
								count={seriesQuery.trim() ? filteredSeries.length : undefined}
								width="100%"
							/>
						{:else}
							<SearchField
								bind:value={scheduleQuery}
								placeholder="Name, artist, offer…"
								ariaLabel="Search nights"
								count={scheduleQuery.trim()
									? countEventScheduleRows(filteredSchedule)
									: undefined}
								width="100%"
							/>
						{/if}
					</div>
					{#if listView === "schedule"}
						<div class="filter-events">
							<label class="filter-label" for="event-filter">Series name</label>
							<MultiSelect
								id="event-filter"
								size="sm"
								bind:value={scheduleEventIds}
								options={eventFilterOptions}
								placeholder="All series"
							/>
						</div>
						<div class="filter-dates">
							<label class="filter-label" for="event-from">From</label>
							<TextField id="event-from" size="sm" type="date" bind:value={scheduleFrom} />
						</div>
						<div class="filter-dates">
							<label class="filter-label" for="event-to">To</label>
							<TextField id="event-to" size="sm" type="date" bind:value={scheduleTo} />
						</div>
					{/if}
					<button
						type="button"
						class="filter-clear"
						disabled={!filtersActive}
						onclick={clearListFilters}
					>
						Clear
					</button>
				</div>
				{#if listView === "series"}
					<div class="series-table" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
						<div class="series-head">
							<span>When</span>
							<span></span>
							<span>Series</span>
							<span>Time</span>
							<span>Guest</span>
							<span>Next</span>
							<span>Offer</span>
							<span>Status</span>
							<span class="row-fill" aria-hidden="true"></span>
						</div>
						{#each filteredSeries as event (event.id)}
							{@const blurb = seriesBlurb(event)}
							{@const time = seriesTimeLabel(event)}
							{@const guest = seriesGuestLabel(event)}
							{@const next = seriesNextCell(event)}
							{@const offer = seriesOfferLabel(event)}
							<a class="item series-row" href={eventItemPath(event.id)}>
								<span class="day">
									<span class="weekday">
										{seriesWeekdayLabel(event) || repeatLabel(event)}
									</span>
								</span>
								<PhotoCell size="md" url={event.mainImage?.url || ""} alt="" />
								<span class="copy">
									<span class="name">{event.name}</span>
									{#if blurb}
										<span class="meta" title={blurb}>{blurb}</span>
									{/if}
									<span class="meta series-compact">
										{[time, guest, next, offer].filter(Boolean).join(" · ")}
									</span>
								</span>
								<span class="cell" title={time}>{time}</span>
								<span class="cell" title={guest}>{guest}</span>
								<span class="cell" title={next}>{next}</span>
								<span class="cell" title={offer}>{offer}</span>
								<span class="badge {statusTone(event)}">{statusLabel(event)}</span>
								<span class="row-fill" aria-hidden="true"></span>
							</a>
						{:else}
							<p class="empty">
								{filtersActive ? "No series match these filters." : "No series yet."}
							</p>
						{/each}
					</div>
				{:else}
					<div class="rows" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
						{#each visibleSchedule as week (week.start)}
							<section class="week">
								<h2 class="week-heading">{week.label}</h2>
								<div class="week-rows">
									{#each week.rows as occurrence (
										`${occurrence.event.id}:${occurrence.occurrence?.id || occurrence.date}`
									)}
										<a
											class="item"
											href={eventItemPath(`${occurrence.event.id}@${occurrence.date}`)}
										>
											<time class="day" datetime={occurrence.date}>
												<span class="weekday">{formatScheduleWeekday(occurrence.date)}</span>
												<span class="day-date">{formatScheduleDate(occurrence.date)}</span>
											</time>
											<PhotoCell
												size="md"
												url={occurrence.occurrence?.overrides.image?.url ||
													occurrence.event.mainImage?.url ||
													""}
												alt=""
											/>
											<span class="copy">
												<span class="name">
													{occurrence.occurrence?.overrides.name || occurrence.event.name}
												</span>
												<span class="meta">
													{occurrence.occurrence?.overrides.artist || occurrence.event.artist
														? `${occurrence.occurrence?.overrides.artist || occurrence.event.artist} · `
														: ""}
													{repeatLabel(occurrence.event)}
												</span>
											</span>
											<span class="badge {statusTone(occurrence.event)}">
												{statusLabel(occurrence.event)}
											</span>
											<span class="row-fill" aria-hidden="true"></span>
										</a>
									{/each}
								</div>
							</section>
						{:else}
							<p class="empty">
								{filtersActive ? "No nights match these filters." : "No upcoming nights."}
							</p>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	{#if missing}
		<div class="missing">
			<EditorBackBar label={listTitle} onback={() => leaveEditor(listHomePath())} />
			<p>{error}</p>
			<Button type="button" variant="outline" onclick={() => leaveEditor(listHomePath())}>
				Back to {listTitle.toLowerCase()}
			</Button>
		</div>
	{:else if editing}
		<form
			class="editor"
			aria-busy={busy || undefined}
			in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
			out:fade={{ duration: fadeMs, easing: easeOut }}
			onsubmit={onSave}
		>
			<EditorBackBar label={listTitle} dirty={formDirty} onback={requestClose} />
			<div class="split split--full">
				<div class="panel" class:dirty={formDirty}>
					<header class="panel-head" class:no-thumb={tab === "details"}>
						{#if tab !== "details"}
						<div class="thumb">
							<label
								class="thumb-hit"
								aria-label={photoUrl ? "Replace photo" : "Add photo"}
								title={editingOccurrence
									? "This night only. What's on uses this flyer while this is the next night."
									: "What's on shows the next night's flyer when that night has its own photo. This is the fallback."}
							>
								{#if photoUrl}
									<img class="thumb-img" src={photoUrl} alt="" />
								{:else}
									<span class="thumb-empty">
										<Icon name="upload" size={16} />
									</span>
								{/if}
								<input
									class="sr-only"
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									onchange={onPhotoInput}
									disabled={!eventId}
								/>
							</label>
							{#if canRemovePhoto}
								<button
									class="thumb-remove"
									type="button"
									disabled={busy}
									aria-label="Remove photo"
									onclick={() => onClearImage("main")}
								>
									<Icon name="close" size={12} />
								</button>
							{/if}
						</div>
						{/if}
						<div class="type-line">
							<p class="eyebrow">{typeLine}</p>
							{#if formDirty}
								<span class="dirty-dot" title="Unsaved" aria-live="polite">
									<span class="sr-only">Unsaved</span>
								</span>
							{/if}
							{#if editingOccurrence && eventId}
								<a class="series-link" href={eventItemPath(eventId)}>Edit series</a>
							{/if}
						</div>
						<div class="head-tools">
							<div class="toolbar-actions">
								{#if eventId && !route.isNew}
									<Button
										variant="outline"
										size="sm"
										type="button"
										disabled={busy}
										busy={publishing === "staging"}
										title={
											formDirty
												? "Save before publishing"
												: stagingPreviewCurrent
													? "Open publish. Preview is current."
													: "Update preview"
										}
										onclick={onHeaderPublish}
									>
										Publish
									</Button>
								{/if}
								<PageHelp title="Events" topics={EVENTS_HELP} />
								<Button
									variant="ghost"
									size="sm"
									type="button"
									disabled={busy || !eventId}
									title="Reload"
									aria-label="Reload from server"
									onclick={requestReload}
								>
									{#snippet icon()}
										<Icon name="refresh" />
									{/snippet}
								</Button>
								<Button
									class="close-btn"
									variant="ghost"
									size="sm"
									type="button"
									aria-label={formDirty ? "Close with unsaved changes" : "Close"}
									title={formDirty ? "Close (unsaved)" : "Close"}
									onclick={requestClose}
								>
									{#snippet icon()}
										<Icon name="close" size={16} />
									{/snippet}
								</Button>
							</div>
						</div>
						<div class="title-name">
							<input
								class="title-input"
								id="event-name"
								required={!creatingNight}
								autocomplete="off"
								aria-label={creatingNight ? "Night title override" : "Series name"}
								placeholder={creatingNight ? "Title override (optional)" : "Series name"}
								bind:value={name}
							/>
							{#if artist.trim()}
								<p class="sub">{artist.trim()}</p>
							{/if}
						</div>
						<div class="title-meta">
							<p class="date-readout" class:muted={headerDate === "No date"}>{headerDate}</p>
							<p class="status-flag {headerFlag.tone}">{headerFlag.label}</p>
						</div>
						{#if route.isNew}
							<div class="create-mode">
								<p class="create-hint muted">
									Pick a series below to add a night, or leave it empty for a new series.
								</p>
							</div>
						{/if}
					</header>

					<div class="tabs">
						<Segmented
							value={tab}
							items={tabs}
							tone="soft"
							size="sm"
							ariaLabel="Event sections"
						/>
					</div>

					<div class="tab-scroll scrollbar-fade">
						<div class="tab-body">
							{#key tab}
								<div
									class="tab-panel"
									in:fly={{
										x: tabSlide * 14,
										duration: 260,
										opacity: 0,
										easing: easeOut,
									}}
								>
									{#if tab === "details"}
										<section class="details-board">
											<div class="details-main">
												<div
													class="control-grid"
													class:has-slots={!editingOccurrence}
													class:with-series={route.isNew || editingOccurrence}
													class:with-date={editingOccurrence || creatingNight}
												>
													{#if route.isNew || editingOccurrence}
														<Field
															class="series"
															label="Series"
															for="event-series"
															tooltip={route.isNew
																? "Choose an existing series to add this night, or leave empty to create a new series or one-off event."
																: "Move this night onto another series."}
														>
															<NativeSelect
																id="event-series"
																size="sm"
																bind:value={attachSeriesId}
																options={route.isNew
																	? [
																			{
																				value: "",
																				label: "New series / one-off event",
																			},
																			...seriesOptions,
																		]
																	: seriesOptions}
															/>
														</Field>
													{/if}
													{#if editingOccurrence || creatingNight}
														<Field
															class="when"
															label="Date"
															for="event-date"
															tooltip="This night only. Series start and end stay on Schedule."
														>
															<TextField
																id="event-date"
																size="sm"
																type="date"
																bind:value={startsOn}
																required
															/>
														</Field>
													{/if}
													<Field
														class="guest"
														label="Guest Artist"
														for="event-artist"
														tooltip={editingOccurrence
															? "This night only. When set, the night is treated as a special guest edition on What's on."
															: "Optional default. A night with its own guest is labelled Guest on Upcoming and What's on."}
													>
														<TextField id="event-artist" size="sm" bind:value={artist} />
													</Field>
													<Field
														class="start"
														label="Start"
														for="event-start-time"
														tooltip={editingOccurrence
															? "This night only. Shown on What's on."
															: "Default start time for each night. A night can override it."}
													>
														<TextField
															id="event-start-time"
															size="sm"
															type="time"
															bind:value={startTime}
														/>
													</Field>
													<Field
														class="end"
														label="End"
														for="event-end-time"
														tooltip={editingOccurrence
															? "This night only. Shown on What's on."
															: "Default end time for each night. A night can override it."}
													>
														<TextField
															id="event-end-time"
															size="sm"
															type="time"
															bind:value={endTime}
														/>
													</Field>
													<Field
														class="offer span-all"
														label="Offer"
														for="event-offer"
														tooltip={editingOccurrence
															? "This night only. Shown on What's on."
															: "Default public wording, such as a drink deal. A night can override it."}
													>
														<TextField
															id="event-offer"
															size="sm"
															bind:value={offer}
															placeholder="£10 Negroni"
														/>
													</Field>
													{#if !editingOccurrence}
														<div class="night-schedule">
															<div class="night-schedule-head">
																<span class="section-label">
																	Night schedule
																	<Tip
																		label="Night schedule"
																		tooltip="Slots inside the night, such as Open decks or Chess. Shown in gold on What's on when set."
																	/>
																</span>
																<Button
																	variant="ghost"
																	type="button"
																	disabled={busy}
																	onclick={addNightSlot}
																>
																	Add slot
																</Button>
															</div>
															{#if nightSchedule.length}
																<ul class="night-schedule-list">
																	{#each nightSchedule as slot, index (index)}
																		<li class="night-slot">
																			<TextField
																				size="sm"
																				placeholder="Open decks"
																				bind:value={nightSchedule[index].label}
																				aria-label={`Slot ${index + 1} label`}
																			/>
																			<TextField
																				size="sm"
																				type="time"
																				bind:value={nightSchedule[index].startTime}
																				aria-label={`Slot ${index + 1} start`}
																			/>
																			<TextField
																				size="sm"
																				type="time"
																				bind:value={nightSchedule[index].endTime}
																				aria-label={`Slot ${index + 1} end`}
																			/>
																			<button
																				class="slot-remove"
																				type="button"
																				disabled={busy}
																				aria-label={`Remove slot ${index + 1}`}
																				onclick={() => removeNightSlot(index)}
																			>
																				<Icon name="close" size={12} />
																			</button>
																		</li>
																	{/each}
																</ul>
															{:else}
																<p class="hint night-schedule-empty">
																	No slots yet. Add open decks, chess, sets, or whatever
																	structures the night.
																</p>
															{/if}
														</div>
													{/if}
													<Field
														class="span-all"
														label="Short description"
														for="event-short-description"
														tooltip={editingOccurrence
															? "This night only. The whole sentence on the What's on card, date included if you want it."
															: "What's on card. One or two lines on what this night is."}
													>
														<TextArea
															id="event-short-description"
															bind:value={shortDescription}
															rows={2}
															placeholder={editingOccurrence
																? "On Sat 10 Oct we are excited to host…"
																: "Card blurb…"}
														/>
													</Field>
													<Field
														class="span-all"
														label={editingOccurrence ? "Description" : "Full description"}
														for="event-description"
														tooltip={editingOccurrence
															? "This night only. Leave empty to keep the series description."
															: "Series and night page. Use the short field for the What's on card."}
													>
														<MethodEditor
															id="event-description"
															value={description}
															label="Event description"
															placeholder="Set the scene…"
															onChange={(next) => (description = next)}
														/>
													</Field>
												</div>
											</div>
											<aside class="details-side">
												<figure
													class="details-photo"
													class:dragging={photoDragging}
													class:empty={!photoUrl}
													style:aspect-ratio={String(HERO_ASPECT)}
													ondragenter={onPhotoDragEnter}
													ondragover={onPhotoDragOver}
													ondragleave={onPhotoDragLeave}
													ondrop={onPhotoDrop}
												>
													<label
														class="details-photo-hit"
														aria-label={photoUrl ? "Replace photo" : "Add photo"}
														title={editingOccurrence
															? "This night only. What's on uses this flyer while this is the next night."
															: "What's on shows the next night's flyer when that night has its own photo. This is the fallback."}
													>
														{#if photoUrl}
															<img src={photoUrl} alt="" />
														{:else}
															<span class="details-photo-empty">
																<Icon name="upload" size={18} />
																Add photo
															</span>
														{/if}
														<input
															class="sr-only"
															type="file"
															accept="image/jpeg,image/png,image/webp,image/gif"
															onchange={onPhotoInput}
															disabled={!eventId}
														/>
													</label>
													{#if canRemovePhoto}
														<button
															class="thumb-remove"
															type="button"
															disabled={busy}
															aria-label="Remove photo"
															onclick={() => onClearImage("main")}
														>
															<Icon name="close" size={12} />
														</button>
													{/if}
													{#if photoDragging}
														<div class="photo-drop" aria-hidden="true">
															<span>Drop to {photoUrl ? "replace" : "add"}</span>
														</div>
													{/if}
												</figure>
												<Field
													label="Operations notes"
													for="event-operations-notes"
													tooltip="Internal only. Never published to the website."
												>
													<TextArea
														id="event-operations-notes"
														bind:value={operationsNotes}
														rows={5}
														placeholder="Contacts, fee, setup, access, equipment…"
													/>
												</Field>
											</aside>
										</section>
									{:else if tab === "schedule"}
										<section class="block">
											{#if repeatUnit === "none"}
												<p class="hint">
													This series does not repeat. Add each night when it is
													scheduled (Details → Series, or New with this series
													selected).
												</p>
											{/if}
											<div class="rule-fields">
												<Field
													label="Starts on"
													for="event-starts"
													tooltip={repeatUnit === "none"
														? "First scheduled night. Leave empty until you add a night."
														: "First night of the series. Recurrence builds forward from here."}
												>
													<TextField
														id="event-starts"
														size="sm"
														type="date"
														bind:value={startsOn}
														required={repeatUnit !== "none"}
														disabled={editingOccurrence}
													/>
												</Field>
												<Field
													label="Ends on"
													for="event-ends"
													tooltip={repeatUnit === "none"
														? "Optional. Not used when nights are scheduled one by one."
														: "Last night of the series. Required when it repeats."}
												>
													<TextField
														id="event-ends"
														size="sm"
														type="date"
														bind:value={endsOn}
														required={repeatUnit !== "none"}
														disabled={editingOccurrence}
													/>
												</Field>
												<Field
													label="Unit"
													for="event-unit"
													tooltip="Weekly or monthly builds the calendar. Does not repeat is for series like Gwenda Nights, where each night is added on its own date."
												>
													<NativeSelect
														id="event-unit"
														size="sm"
														bind:value={repeatUnit}
														disabled={editingOccurrence}
														options={[
															{ value: "none", label: "Does not repeat" },
															{ value: "day", label: "Day" },
															{ value: "week", label: "Week" },
															{ value: "month", label: "Month" },
														]}
													/>
												</Field>
												{#if repeatUnit !== "none"}
													<Field
														label="Every"
														for="event-every"
														tooltip="How often the pattern repeats. 1 with Week means every week."
													>
														<TextField
															id="event-every"
															size="sm"
															type="number"
															min="1"
															max="52"
															bind:value={repeatEvery}
															disabled={editingOccurrence}
														/>
													</Field>
												{/if}
												{#if repeatUnit === "week"}
													<fieldset class="days full" disabled={editingOccurrence}>
														<legend>On</legend>
														<div class="chips">
															{#each WEEKDAYS as day (day)}
																<button
																	type="button"
																	class="chip"
																	class:on={weekdays.includes(day)}
																	onclick={() => toggleWeekday(day)}
																>
																	{WEEKDAY_LABELS[day]}
																</button>
															{/each}
														</div>
													</fieldset>
												{/if}
												{#if repeatUnit === "month"}
													<Field
														label="Day of month"
														for="event-month-day"
														tooltip="Which day of the month the night falls on. Leave empty to follow Starts on."
													>
														<TextField
															id="event-month-day"
															size="sm"
															type="number"
															min="1"
															max="31"
															bind:value={monthDay}
															disabled={editingOccurrence}
															placeholder="From the start date"
														/>
													</Field>
												{/if}
											</div>
											{#if previewDates.length}
												<h2 class="section-title">
													<span class="section-label">
														Upcoming
														<Tip
															label="Upcoming"
															tooltip={repeatUnit === "none"
																? "Each night is its own date. A star marks a night with its own guest artist."
																: "Nights from this series rule. Guest and times show when a night overrides the series defaults."}
														/>
													</span>
												</h2>
												<ul class="occurrences">
													{#each previewDates as date (date)}
														{@const occurrence = current?.dates.find((row) => row.date === date)}
														{@const special = nightIsSpecialEvent(occurrence)}
														{@const details = nightDetailLines(occurrence, date)}
														<li>
															<div class="occurrence-main">
																<strong class="occurrence-title">
																	{#if special}
																		<span
																			class="occurrence-special"
																			title="Special event"
																			aria-label="Special event"
																		>
																			<Icon name="star" size={13} />
																		</span>
																	{/if}
																	{nightHeadline(occurrence, date)}
																</strong>
																{#each details as line (line)}
																	<span class="occurrence-detail">{line}</span>
																{/each}
															</div>
															{#if eventId}
																<a
																	class="occurrence-link"
																	href={eventItemPath(`${eventId}@${date}`)}
																>
																	Edit night
																</a>
															{/if}
														</li>
													{/each}
												</ul>
											{:else}
												<p class="hint">
													{repeatUnit === "none"
														? "No nights scheduled yet."
														: "No upcoming date for this rule."}
												</p>
											{/if}
										</section>
									{:else if tab === "gallery"}
										<section class="block">
											{#if !eventId}
												<p class="hint">Save before adding images.</p>
											{:else}
												<HeroImagePanel
													sourceUrl={framingUrl}
													crops={heroCrops}
													disabled={busy}
													tooltip={editingOccurrence
														? "This night only. What's on uses this flyer while this is the next night."
														: "What's on shows the next night's flyer when that night has its own photo. This is the fallback."}
													onchangecrops={onHeroCropsChange}
													onpickfile={(file) => void onImage("main", file)}
												/>
												<div class="drive-head">
													<h2 class="section-title">
														<span class="section-label">
															Drive
															<Tip
																label="Drive"
																tooltip="Image library for this series. The Hero above is what What's on uses for framing."
															/>
														</span>
													</h2>
													{#if driveFolderUrl}
														<a
															class="drive-link"
															href={driveFolderUrl}
															target="_blank"
															rel="noreferrer">Open folder</a
														>
													{/if}
												</div>
												{#if driveError}
													<p class="error">{driveError}</p>
												{/if}
												<div
													class="drive-drop"
													class:dragging={driveDragging}
													class:busy={driveLoading || driveUploading}
													ondragenter={onDriveDragEnter}
													ondragover={onDriveDragOver}
													ondragleave={onDriveDragLeave}
													ondrop={onDriveDrop}
												>
													{#if driveLoading && !driveFiles.length}
														<p class="hint">Loading…</p>
													{:else}
														<ul class="gallery">
															{#each driveFiles as image (image.id)}
																<li class="tile">
																	<a
																		href={image.url || eventDriveFileUrl(eventId, image.id)}
																		target="_blank"
																		rel="noreferrer"
																		title={image.name}
																	>
																		<img
																			src={eventDriveFileUrl(eventId, image.id)}
																			alt={image.name}
																			loading="lazy"
																		/>
																	</a>
																</li>
															{/each}
															<li>
																<label class="tile add">
																	<span class="photo-btn primary">
																		<Icon name="upload" size={16} />
																		{driveUploading ? "Uploading…" : "Add images"}
																	</span>
																	<input
																		type="file"
																		accept="image/jpeg,image/png,image/webp,image/gif"
																		multiple
																		disabled={busy}
																		onchange={onGalleryInput}
																	/>
																</label>
															</li>
														</ul>
													{/if}
													{#if driveDragging}
														<div class="drive-drop-veil" aria-hidden="true">
															<span>Drop to upload</span>
														</div>
													{/if}
												</div>
											{/if}
										</section>
									{:else if tab === "publish"}
										<section class="block publish-block">
											{#if !eventId}
												<p class="hint">Save the event before publishing.</p>
											{:else}
												<ol class="publish-flow">
													<li
														class="publish-step"
														class:done={stagingPreviewCurrent}
														class:active={!stagingPreviewCurrent}
														class:busy={publishing === "staging"}
													>
														<span class="step-mark" aria-hidden="true">
															{#if stagingPreviewCurrent}
																✓
															{:else if publishing === "staging"}
																…
															{:else}
																1
															{/if}
														</span>
														<div class="step-body">
															<h3 class="step-title">Update preview</h3>
															<p class="step-copy">
																{#if stagingPreviewCurrent}
																	The staging diary has this series. Refresh What's on to check the flyer.
																{:else if current?.publish.preview === "stale"}
																	Saved changes are not in the staging diary yet.
																{:else}
																	Writes this series into the staging diary. What's on shows it on refresh, without a site rebuild.
																{/if}
															</p>
															{#if !stagingPreviewCurrent}
																<Button
																	type="button"
																	variant="primary"
																	size="sm"
																	busy={publishing === "staging"}
																	disabled={Boolean(publishing) || formDirty}
																	onclick={() => onPublish("staging")}
																>
																	{publishing === "staging" ? "Updating…" : "Update preview"}
																</Button>
															{/if}
														</div>
													</li>
													<li
														class="publish-step"
														class:done={stagingPreviewCurrent}
														class:locked={!stagingPreviewCurrent}
													>
														<span class="step-mark" aria-hidden="true">
															{#if stagingPreviewCurrent}✓{:else}2{/if}
														</span>
														<div class="step-body">
															<h3 class="step-title">Check What's on</h3>
															<p class="step-copy">
																{#if stagingPreviewCurrent}
																	Open What's on and refresh. The flyer, copy, and times come from this preview.
																{:else}
																	Available after the preview is current.
																{/if}
															</p>
															{#if stagingPreviewCurrent}
																<a
																	class="step-link"
																	href={stagingVerifyHref}
																	target="_blank"
																	rel="noreferrer"
																>
																	Open What's on
																</a>
															{/if}
														</div>
													</li>
													<li
														class="publish-step"
														class:done={liveCurrent}
														class:active={stagingPreviewCurrent && !liveCurrent}
														class:locked={!stagingPreviewCurrent}
													>
														<span class="step-mark" aria-hidden="true">
															{#if liveCurrent}
																✓
															{:else if publishing === "production"}
																…
															{:else}
																3
															{/if}
														</span>
														<div class="step-body">
															<h3 class="step-title">Push live</h3>
															<p class="step-copy">
																{#if liveCurrent}
																	Live on gwenda.co.uk.
																{:else if stagingPreviewCurrent}
																	Copy the staging nights to the live site.
																{:else}
																	Unlocks after staging is current.
																{/if}
															</p>
															{#if stagingPreviewCurrent && !liveCurrent}
																<Button
																	type="button"
																	variant="primary"
																	size="sm"
																	busy={publishing === "production"}
																	disabled={Boolean(publishing) || formDirty}
																	onclick={() => onPublish("production")}
																>
																	{publishing === "production" ? "Pushing…" : "Push live"}
																</Button>
															{:else if liveCurrent}
																<a
																	class="step-link"
																	href={liveVerifyHref}
																	target="_blank"
																	rel="noreferrer"
																>
																	Open What's on
																</a>
															{/if}
														</div>
													</li>
												</ol>
												{#if formDirty}
													<p class="hint">Save before publishing.</p>
												{/if}
												<SitePublishMonitor showStart />
												{#if warnings.length}
													<ul class="warnings">
														{#each warnings as warning (warning)}
															<li>{warning}</li>
														{/each}
													</ul>
												{/if}
											{/if}
										</section>
									{/if}
									{#if error}<p class="error">{error}</p>{/if}
								</div>
							{/key}
						</div>
					</div>

					<footer class="panel-foot">
						{#if eventId}
							<Button
								class="delete-btn"
								variant="destructive"
								size="sm"
								type="button"
								disabled={busy}
								onclick={requestDelete}
							>
								Delete
							</Button>
						{/if}
						<Button
							variant="primary"
							size="sm"
							type="submit"
							disabled={busy}
							busy={saving && intent === "save"}
						>
							{#snippet icon()}
								<Icon name="save" />
							{/snippet}
							{saving && intent === "save" ? "Saving…" : "Save"}
						</Button>
					</footer>
				</div>
			</div>

			<Dialog open={discardOpen} title="Discard unsaved changes?" onclose={cancelDiscard}>
				<p class="delete-copy">
					{discardKind === "reload"
						? "Reload will discard unsaved changes."
						: "You have edits that have not been saved. Close without saving?"}
				</p>
				{#snippet footer()}
					<Button variant="outline" size="sm" type="button" onclick={cancelDiscard}>
						Keep editing
					</Button>
					<Button variant="destructive" size="sm" type="button" onclick={confirmDiscard}>
						Discard
					</Button>
				{/snippet}
			</Dialog>

			<Dialog
				open={saveScopeOpen}
				title="Which events should change?"
				onclose={() => (saveScopeOpen = false)}
			>
				<p class="delete-copy">
					Choose how widely to apply these edits. Past events will not be changed.
				</p>
				<div class="scope-options">
					<Button type="button" variant="outline" onclick={() => saveOccurrenceWithScope("this")}>
						This event
					</Button>
					<Button
						type="button"
						variant="outline"
						onclick={() => saveOccurrenceWithScope("following")}
					>
						This and following
					</Button>
					<Button type="button" onclick={() => saveOccurrenceWithScope("all")}>
						All future events
					</Button>
				</div>
			</Dialog>

			<Dialog
				open={deleteScopeOpen}
				title="Which events should be deleted?"
				onclose={cancelDelete}
			>
				<p class="delete-copy">
					Choose how widely to delete. Past events will not be changed.
				</p>
				<div class="scope-options">
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onclick={() => void performDelete("this")}
					>
						This event
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onclick={() => void performDelete("following")}
					>
						This and following
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={busy}
						busy={saving && intent === "delete"}
						onclick={() => void performDelete("all")}
					>
						All future events
					</Button>
				</div>
			</Dialog>

			<Dialog open={deleteOpen} title="Delete event?" onclose={cancelDelete}>
				<p class="delete-copy">
					Delete <strong>{name.trim() || "this event"}</strong>
					{repeatUnit !== "none" ? " and its recurrence" : ""}? This cannot be undone.
				</p>
				{#snippet footer()}
					<Button variant="outline" size="sm" type="button" disabled={busy} onclick={cancelDelete}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						type="button"
						disabled={busy}
						busy={saving && intent === "delete"}
						onclick={() => void performDelete("series")}
					>
						{saving && intent === "delete" ? "Deleting…" : "Delete"}
					</Button>
				{/snippet}
			</Dialog>
		</form>
	{/if}
	<BusyOverlay active={busy} label={busyLabel} />
</div>

<style>
	.events-root {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	.list-page {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: auto;
		padding: var(--page-gutter);
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		background: var(--background);
	}

	.list-page.parked {
		/* Keep the list laid out and scrolled under the detail. */
		pointer-events: none;
	}

	.series-link {
		margin-left: 0.65rem;
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}

	.series-link:hover {
		text-decoration: underline;
	}

	.list-filters {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) 14rem 9.5rem 9.5rem auto;
		gap: 0.75rem;
		align-items: end;
		justify-content: start;
	}

	.filter-search {
		min-width: 0;
	}

	.filter-search :global(.wrap) {
		height: var(--control-h-sm);
	}

	.filter-label {
		display: block;
		margin: 0 0 0.35rem;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.filter-clear {
		align-self: end;
		height: var(--control-h-sm);
		padding: 0 0.75rem;
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.filter-clear:hover:not(:disabled) {
		color: var(--foreground);
		background: var(--accent);
	}

	.filter-clear:disabled {
		opacity: 0;
		pointer-events: none;
	}

	@media (max-width: 720px) {
		.list-filters {
			grid-template-columns: 1fr 1fr;
		}

		.filter-search,
		.filter-events {
			grid-column: 1 / -1;
		}
	}

	.meta-line.muted {
		color: var(--muted-foreground);
	}

	.occurrence-link {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
	}

	.scope-options {
		display: grid;
		gap: 0.625rem;
		margin-top: 1rem;
	}

	.rows {
		display: grid;
		grid-template-columns: 7.25rem auto fit-content(28rem) max-content minmax(0, 1fr);
		column-gap: 0.75rem;
		width: 100%;
		min-width: 0;
		align-content: start;
	}

	.week {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
	}

	.week + .week {
		margin-top: 1.5rem;
	}

	.week-heading {
		grid-column: 1 / -1;
		margin: 0;
		padding: 0.65rem 0.15rem;
		border-bottom: 1px solid var(--border-strong);
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.week-rows {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
	}

	.series-table {
		display: grid;
		grid-template-columns:
			7.25rem
			2.5rem
			fit-content(18rem)
			fit-content(8.75rem)
			fit-content(10rem)
			fit-content(16rem)
			fit-content(10rem)
			max-content
			minmax(0, 1fr);
		column-gap: 0.85rem;
		width: 100%;
		align-content: start;
		overflow-x: auto;
	}

	.series-head,
	.series-row {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
	}

	.series-head {
		column-gap: 0.85rem;
		padding: 0.15rem 0 0.45rem;
		border-bottom: 1px solid var(--border-strong);
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	.series-compact {
		display: none;
	}

	.series-table .empty {
		grid-column: 1 / -1;
	}

	.cell {
		min-width: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		width: auto;
		min-height: 3.35rem;
		padding: 0.55rem 0.15rem;
		border-bottom: 1px solid var(--border);
		color: inherit;
		text-decoration: none;
	}

	.series-row {
		grid-template-columns: subgrid;
		column-gap: 0.85rem;
		width: auto;
		max-width: none;
		padding: 0.55rem 0;
	}

	.row-fill {
		min-width: 0;
	}

	.item:hover {
		background: color-mix(in srgb, var(--foreground) 4%, transparent);
	}

	.item:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.day {
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
		min-width: 0;
		font-variant-numeric: tabular-nums;
		text-decoration: none;
	}

	.weekday {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.14em;
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.day-date {
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		line-height: 1.2;
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		min-width: 0;
	}

	.name {
		font-weight: 500;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta,
	.badge,
	.empty,
	.hint,
	.status,
	.lede {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.meta {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.3;
	}

	.badge.live {
		color: var(--primary);
	}

	.badge.preview {
		color: var(--foreground);
	}

	.badge.unpublished {
		color: var(--primary);
		font-weight: 700;
	}

	.missing,
	.editor {
		position: absolute;
		inset: 0;
		z-index: 1;
		background: var(--background);
	}

	.missing {
		display: grid;
		gap: 0.8rem;
		align-content: start;
		padding: var(--page-gutter);
	}

	.editor {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: "panel";
		column-gap: 0;
		row-gap: var(--gap);
		flex: 1;
		min-height: 0;
		height: 100%;
		padding: var(--gap) var(--page-gutter) var(--gap);
	}

	.hero {
		display: none;
	}

	.photo-collapse {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		left: auto;
		z-index: 3;
		display: grid;
		place-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--card) 88%, transparent);
		color: var(--muted-foreground);
		backdrop-filter: blur(8px);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.hero:hover .photo-collapse,
	.hero:focus-within .photo-collapse,
	.photo-collapse:focus-visible {
		opacity: 1;
	}

	.photo-collapse:hover,
	.photo-collapse:focus-visible {
		color: var(--foreground);
		border-color: var(--border-strong, var(--border));
		background: var(--card);
	}

	.hero.dragging {
		border-color: var(--primary);
		box-shadow: var(--shadow-primary);
	}

	.hero-img,
	.tile img {
		flex: 1;
		min-height: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
		display: block;
		background: #0a0a0a;
		pointer-events: none;
	}

	.photo-hit {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.55rem;
		margin: 0;
		cursor: pointer;
	}

	.photo-hit.empty,
	.tile.add {
		background:
			radial-gradient(ellipse at 50% 30%, var(--primary-wash-strong), transparent 55%),
			var(--sunken);
	}

	.photo-hit.has-photo,
	.tile-hit {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: transparent;
		opacity: 0;
		transition: opacity var(--t-fast) var(--ease-in-out);
	}

	.photo-hit.has-photo .photo-btn,
	.tile-hit .photo-btn {
		pointer-events: none;
	}

	.photo-hit.has-photo:hover,
	.photo-hit.has-photo:focus-within,
	.hero.dragging .photo-hit.has-photo,
	.tile:hover .tile-hit,
	.tile:focus-within .tile-hit {
		opacity: 1;
		background: color-mix(in srgb, #0d0d0d 45%, transparent);
	}

	.photo-hit.has-photo:hover .photo-btn,
	.photo-hit.has-photo:focus-within .photo-btn,
	.hero.dragging .photo-hit.has-photo .photo-btn,
	.tile:hover .tile-hit .photo-btn,
	.tile:focus-within .tile-hit .photo-btn {
		pointer-events: auto;
	}

	.photo-hit.empty input,
	.tile.add input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.photo-btn {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: var(--control-h-sm);
		padding: 0 0.95rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--card) 88%, transparent);
		color: var(--foreground);
		font-family: inherit;
		font-size: var(--text);
		font-weight: 500;
		line-height: 1;
		appearance: none;
		backdrop-filter: blur(8px);
		cursor: pointer;
	}

	.photo-hit.empty .photo-btn,
	.tile.add .photo-btn {
		pointer-events: none;
	}

	.photo-btn.primary {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--primary-foreground);
	}

	.photo-btn.remove {
		color: var(--destructive);
		border-color: color-mix(in srgb, var(--destructive) 45%, var(--border-strong));
	}

	.photo-btn.remove:hover:not(:disabled),
	.photo-btn.remove:focus-visible {
		background: var(--destructive-wash);
		border-color: var(--destructive);
	}

	.photo-btn.remove:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.photo-hint {
		position: relative;
		z-index: 1;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		pointer-events: none;
	}

	.photo-drop {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		place-content: center;
		pointer-events: none;
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		color: var(--primary);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.panel {
		grid-area: panel;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition: border-color var(--t-fast) var(--ease-in-out);
	}

	.panel.dirty {
		border-color: color-mix(in srgb, var(--destructive) 32%, var(--border));
	}

	.thumb {
		display: block;
		position: relative;
		grid-column: 3;
		grid-row: 1 / span 2;
		width: 4.25rem;
		height: 4.25rem;
		justify-self: end;
		align-self: start;
		margin-top: 0.1rem;
	}

	.panel-head.no-thumb {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.panel-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 4.25rem;
		align-items: start;
		column-gap: 0.85rem;
		row-gap: 0.2rem;
		flex-shrink: 0;
		padding: 0.55rem var(--card-pad-lg) 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.type-line {
		grid-column: 1;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		align-self: center;
		height: var(--control-h-sm);
	}

	.eyebrow {
		min-width: 0;
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dirty-dot {
		display: inline-flex;
		flex-shrink: 0;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--destructive);
		box-shadow: 0 0 0 3px var(--destructive-wash);
	}

	.head-tools {
		grid-column: 2;
		grid-row: 1;
		display: flex;
		align-items: center;
		justify-self: end;
		height: var(--control-h-sm);
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: 0.25rem;
		height: var(--control-h-sm);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.head-tools :global(.close-btn:hover:not(:disabled)) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.thumb-hit {
		display: block;
		width: 100%;
		height: 100%;
		margin: 0;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--sunken);
		cursor: pointer;
	}

	.thumb-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb-empty {
		display: grid;
		place-content: center;
		width: 100%;
		height: 100%;
		color: var(--muted-foreground);
	}

	.thumb-hit:focus-within {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.thumb-remove {
		position: absolute;
		top: -0.35rem;
		right: -0.35rem;
		display: grid;
		place-content: center;
		width: 1.35rem;
		height: 1.35rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.thumb-remove:hover:not(:disabled),
	.thumb-remove:focus-visible {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.title-name {
		grid-column: 1;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.15rem;
		min-width: 0;
	}

	.title-input {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 0.08em 0.35rem 0.22em;
		margin: 0 -0.35rem;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: 1.85rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.3;
		outline: none;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.title-input::placeholder {
		color: var(--subtle-foreground);
	}

	.title-input:hover {
		border-color: var(--border);
	}

	.title-input:focus {
		border-color: var(--ring);
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--ring-wash);
	}

	.title-meta {
		grid-column: 2;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-self: stretch;
		gap: 0.08rem;
		padding-top: 0.12rem;
		min-width: 0;
	}

	.date-readout {
		margin: 0;
		font-family: var(--font);
		font-size: 1.85rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.3;
		color: var(--primary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.date-readout.muted {
		color: var(--muted-foreground);
		font-weight: 500;
		font-size: 1.2rem;
	}

	.status-flag {
		display: inline-flex;
		align-items: center;
		width: fit-content;
		margin: 0.28rem 0 0;
		padding: 0.18rem 0.5rem;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status-flag.unpublished,
	.status-flag.unsaved {
		color: var(--primary-foreground);
		background: var(--primary);
	}

	.status-flag.preview {
		color: var(--foreground);
		background: var(--primary-wash-strong);
	}

	.status-flag.live {
		color: var(--primary);
		background: var(--primary-wash);
	}

	.status-flag.muted {
		color: var(--muted-foreground);
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: none;
		padding: 0;
		background: transparent;
	}

	.occurrence-note {
		grid-column: 1 / -1;
		grid-row: 3;
		margin: 0;
		padding-top: 0.4rem;
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.02em;
		line-height: 1.4;
		color: var(--muted-foreground);
		max-width: 36rem;
	}

	.create-mode {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.45rem;
		margin-top: 0.35rem;
	}

	.create-hint {
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
	}

	.create-hint.muted {
		color: var(--muted-foreground);
	}

	.sub {
		margin: 0;
		font-size: var(--text);
		color: var(--muted-foreground);
	}

	.tabs {
		flex-shrink: 0;
		padding: 0.65rem var(--card-pad-lg) 0.35rem;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}

	.tab-scroll {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}

	.tab-body {
		position: relative;
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
		container-type: inline-size;
		container-name: event-detail;
	}

	.tab-panel {
		min-width: 0;
	}

	.block {
		display: grid;
		gap: 0.85rem;
	}

	.lede {
		margin: 0;
		line-height: 1.45;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0.4rem 0 0;
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.3;
		color: var(--primary);
	}

	.section-title::after {
		content: "";
		flex: 1 1 auto;
		height: 1px;
		min-width: 1.5rem;
		background: var(--border-strong);
	}

	.section-label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.full {
		grid-column: 1 / -1;
	}

	.details-board {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem 1.35rem;
		align-items: start;
	}

	.details-main,
	.details-side {
		display: grid;
		gap: 0.85rem;
		align-content: start;
		min-width: 0;
	}

	.control-grid {
		--time: 8.25rem;
		--gutter: 0rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.8rem 0.7rem;
		align-items: start;
		min-width: 0;
	}

	.control-grid > :global(.span-all),
	.night-schedule {
		grid-column: 1 / -1;
	}

	.rule-fields {
		display: grid;
		gap: 0.7rem 0.85rem;
		align-items: start;
	}

	.rule-fields {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-start;
	}

	.rule-fields > :global(.field) {
		flex: 1 1 11rem;
		max-width: 14rem;
		min-width: min(100%, 11rem);
	}

	.rule-fields > .days {
		flex: 1 1 100%;
		max-width: 40rem;
	}

	.details-photo {
		position: relative;
		margin: 0;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		overflow: hidden;
		background: #0a0a0a;
		min-width: 0;
	}

	.details-photo.dragging {
		border-color: var(--primary);
	}

	.details-photo-hit {
		display: block;
		margin: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.details-photo img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
	}

	.details-photo-empty {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.4rem;
		width: 100%;
		height: 100%;
		min-height: 8rem;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		background: var(--sunken);
	}

	.details-photo-hit:focus-within {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.details-photo .thumb-remove {
		top: 0.4rem;
		right: 0.4rem;
	}

	.days {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}

	.days legend {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.chips,
	.publish-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.publish-block {
		max-width: 36rem;
	}

	.publish-flow {
		list-style: none;
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
	}

	.publish-step {
		display: grid;
		grid-template-columns: 1.75rem minmax(0, 1fr);
		gap: 0.85rem;
		align-items: start;
		padding: 1rem 0;
		border-top: 1px solid var(--border);
	}

	.publish-step:first-child {
		border-top: 0;
		padding-top: 0.25rem;
	}

	.publish-step.locked {
		opacity: 0.45;
	}

	.publish-step.busy .step-mark {
		color: var(--primary);
	}

	.step-mark {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-weight: 700;
		line-height: 1;
	}

	.publish-step.done .step-mark {
		border-color: color-mix(in srgb, #6aab7a 55%, var(--border));
		background: color-mix(in srgb, #6aab7a 18%, var(--surface));
		color: #8fce9c;
	}

	.publish-step.active:not(.done) .step-mark {
		border-color: var(--primary);
		color: var(--primary);
	}

	.step-body {
		display: grid;
		gap: 0.45rem;
		padding-top: 0.15rem;
	}

	.step-title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.step-copy {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.step-link {
		justify-self: start;
		color: var(--primary);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.step-link:hover {
		text-decoration: underline;
	}

	.chip {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		border-radius: var(--radius-pill);
		padding: 0.3rem 0.7rem;
		font: inherit;
		font-size: var(--text-sm);
	}

	.chip {
		cursor: pointer;
	}

	.chip.on {
		border-color: var(--primary);
		color: var(--primary);
		background: var(--primary-wash);
	}

	.occurrences {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.night-schedule {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}

	.night-schedule-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.night-schedule-list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.night-slot {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 7.25rem 7.25rem auto;
		gap: 0.45rem;
		align-items: center;
	}

	.slot-remove {
		display: grid;
		place-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.slot-remove:hover:not(:disabled),
	.slot-remove:focus-visible {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	@media (max-width: 40rem) {
		.night-slot {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.night-slot :global(input[type="time"]) {
			grid-column: 1 / -1;
		}
	}

	/*
	  One grid: who | from | until. Slot times sit on the same tracks as the
	  night window. Offer and the descriptions span the row.
	*/
	@container event-detail (min-width: 28rem) {
		.control-grid {
			grid-template-columns: minmax(0, 1fr) var(--time) var(--time);
		}

		.control-grid.has-slots {
			--gutter: 2.15rem;
			margin-right: var(--gutter);
		}

		.control-grid.with-series > :global(.series) {
			grid-column: 1 / -1;
		}

		.control-grid.with-series.with-date > :global(.series) {
			grid-column: 1;
		}

		.control-grid.with-date > :global(.when) {
			grid-column: 1;
			max-width: 12rem;
		}

		.control-grid.with-series.with-date > :global(.when) {
			grid-column: 2 / -1;
			max-width: none;
		}

		.control-grid > :global(.guest) {
			grid-column: 1;
		}

		.control-grid > :global(.start) {
			grid-column: 2;
		}

		.control-grid > :global(.end) {
			grid-column: 3;
		}

		.night-schedule-head {
			margin-right: calc(var(--gutter) * -1);
		}

		.night-slot {
			position: relative;
			grid-template-columns: minmax(0, 1fr) var(--time) var(--time);
			column-gap: 0.7rem;
		}

		.night-slot :global(input[type="time"]) {
			grid-column: auto;
		}

		.slot-remove {
			position: absolute;
			top: 50%;
			right: calc(var(--gutter) * -1);
			transform: translateY(-50%);
		}
	}

	.night-schedule-empty {
		margin: 0;
	}

	.occurrences li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.occurrence-main {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}

	.occurrence-title {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.occurrence-special {
		display: inline-flex;
		color: var(--muted-foreground);
	}

	.occurrence-detail {
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		line-height: 1.35;
	}

	.occurrences .occurrence-flag {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.hint,
	.status,
	.error,
	.warnings,
	.delete-copy {
		margin: 0;
	}

	.hint a {
		color: inherit;
	}

	.error,
	.warnings {
		color: var(--destructive);
	}

	.warnings {
		display: grid;
		gap: 0.3rem;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}

	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 0.75rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.drive-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1.25rem;
	}

	.drive-head .section-title {
		flex: 1 1 auto;
		margin: 0;
	}

	.drive-link {
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}

	.drive-link:hover {
		color: var(--foreground);
		text-decoration: underline;
	}

	.drive-drop {
		position: relative;
		min-height: 8rem;
		border-radius: var(--radius-lg);
		border: 1px dashed transparent;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out);
	}

	.drive-drop.dragging {
		border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	.drive-drop.busy {
		opacity: 0.85;
	}

	.drive-drop-veil {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		place-content: center;
		pointer-events: none;
		border-radius: inherit;
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		color: var(--primary);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.tile,
	.tile.add {
		position: relative;
		aspect-ratio: 4 / 3;
		border-radius: var(--radius-xl);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--sunken);
	}

	.tile.add {
		display: grid;
		place-content: center;
		cursor: pointer;
	}

	.tile a {
		display: block;
		width: 100%;
		height: 100%;
	}

	.tile img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tile-hit {
		position: absolute;
		inset: 0;
	}

	.panel-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-shrink: 0;
		margin-top: auto;
		padding: 0.65rem var(--card-pad-lg) 0.85rem;
		border-top: 1px solid var(--border);
	}

	.panel-foot :global(.delete-btn) {
		margin-right: auto;
	}

	.delete-copy {
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--foreground);
	}

	.delete-copy strong {
		font-weight: 600;
	}

	@media (max-width: 900px) {
		.split {
			padding: 0;
		}

		.panel {
			border-radius: 0;
			border-left: none;
			border-right: none;
		}

		.head-tools :global(.close-btn),
		.head-tools :global(.photo-expand) {
			display: none;
		}

		.occurrence-note {
			grid-row: 4;
		}

		.panel-head,
		.tabs,
		.tab-body,
		.panel-foot {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}

		.tab-body {
			padding-top: 1rem;
			padding-bottom: max(var(--page-gutter), 1.125rem);
		}

		.panel-foot {
			padding-bottom: max(0.85rem, env(safe-area-inset-bottom, 0px));
		}

		.rows,
		.week,
		.week-rows,
		.series-table {
			display: flex;
			flex-direction: column;
			width: 100%;
			overflow: visible;
		}

		.series-head {
			display: none;
		}

		.item,
		.series-row {
			grid-column: auto;
			grid-template-columns: 4.75rem auto minmax(0, 1fr);
			gap: 0.75rem;
			width: 100%;
			max-width: none;
			padding: 0.55rem 0.15rem;
		}

		.series-row .cell,
		.badge,
		.row-fill {
			display: none;
		}

		.series-compact {
			display: block;
		}
	}

	@container event-detail (min-width: 54rem) {
		.details-board {
			grid-template-columns: minmax(0, 1fr) minmax(24rem, 28rem);
		}
	}

	@media (max-width: 880px) {
		.details-main,
		.details-side {
			display: contents;
		}

		.details-photo {
			order: -1;
			max-width: 22rem;
		}
	}

	@media (max-width: 600px) {
		.title-input,
		.date-readout {
			font-size: 1.35rem;
		}
	}
</style>
