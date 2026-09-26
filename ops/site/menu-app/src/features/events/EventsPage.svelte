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
	import MethodEditor from "../menu/MethodEditor.svelte";
	import { EVENTS_HELP } from "./events-help";
	import { eventHeaderFlag } from "../../lib/event-header-status";
	import HeroImagePanel from "./HeroImagePanel.svelte";
	import {
		onWebsiteJobEvent,
		queueWebsiteJob,
		retryWebsiteJob,
		websiteJobFor,
		websiteJobSettled,
	} from "../../lib/website-jobs.svelte";
	import { preparePhoto } from "../../lib/photo-prep";
	import ScheduleCalendar from "./ScheduleCalendar.svelte";
	import ScheduleListGrid from "./ScheduleListGrid.svelte";
	import SeriesGrid from "./SeriesGrid.svelte";
	import {
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
		getMe,
		putEventOnWebsite,
		syncEventCalendar,
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
	import { setActiveNavOverride, setCrumbLeaf } from "../../lib/crumbs.svelte";
	import {
		compareSeriesByWeekday,
		countEventScheduleRows,
		currentScheduleMonth,
		filterEventSchedule,
		formatScheduleDate,
		formatScheduleWeekday,
		groupEventSchedule,
		scheduleToday,
		seriesNextNightLabel,
		seriesWeekdayLabel,
	} from "../../lib/event-schedule";
	import { toast } from "../../lib/toast.svelte";
	import { refreshSitePending } from "../../lib/site-pending.svelte";
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
	let calendarSyncing = $state(false);
	/** Local ops stages drafts for the local site and never releases. */
	let localOps = $state(false);
	let error = $state("");
	let warnings = $state<string[]>([]);

	function applyWarnings(list?: string[]) {
		warnings = (list || []).filter(Boolean);
		if (warnings.length) toast.info(warnings[0]);
	}

	/**
	 * After a save: the save is done. The calendar and the website copy follow
	 * in the background (lib/website-jobs), so the editor can carry on.
	 */
	function stageAfterSave(id: string, saved: string) {
		if (saved) toast.ok(saved);
		queueWebsiteJob(id);
	}

	/** An event came back ready from the background work: show its new state. */
	function takeReadyEvent(event: OpsEvent) {
		if (String(event.id) === String(eventId) && current) {
			// Mid-edit: only the status changes, never the fields being typed.
			if (formDirty) {
				current = { ...current, publish: event.publish };
				events = events.map((row) => (row.id === event.id ? { ...row, publish: event.publish } : row));
			} else rememberEvent(event, false);
		} else if (events.some((row) => row.id === event.id)) {
			events = events.map((row) => (row.id === event.id ? event : row));
		}
	}
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
	const SCHEDULE_VIEW_KEY = "ops.events.scheduleView";
	function readScheduleView(): string {
		try {
			return localStorage.getItem(SCHEDULE_VIEW_KEY) === "calendar" ? "calendar" : "list";
		} catch {
			return "list";
		}
	}
	let scheduleView = $state(readScheduleView());
	let calendarMonth = $state(currentScheduleMonth());
	const scheduleTodayIso = scheduleToday();
	const scheduleViewItems: SegmentedItem[] = [
		{ id: "list", label: "List" },
		{ id: "calendar", label: "Calendar" },
	];
	let discardKind = $state<"close" | "reload">("close");
	let driveFiles = $state<EventDriveFile[]>([]);
	let driveFolderUrl = $state("");
	let driveOutsideGallery = $state(0);
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
	/** Photo picked on a new event: shown now, uploaded right after the first save. */
	let pendingPhoto = $state<File | null>(null);
	let pendingPhotoUrl = $state("");

	let name = $state("");
	let defaultsUnlocked = $state(false);
	let artist = $state("");
	let offer = $state("");
	let pageUrl = $state("");
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
	let replacesSeries = $state("");
	let replacePrompt = $state<{
		id: string;
		name: string;
		slug: string;
		date: string;
		skippedDates: string[];
	} | null>(null);
	let skipReplaceAsk = false;
	let replacing = $state(false);
	let current = $state<OpsEvent | null>(null);
	let attachSeriesId = $state("");
	/** Series to pick when the next new-event form opens ("Add night" on a series). */
	let presetSeriesId = "";

	let listOrigin = $state<"series" | "schedule">("series");
	const route = $derived(parseShellPath(path));
	const editing = $derived(route.page === "events" && (route.isNew || Boolean(route.slug)));
	const routeList = $derived(
		(route as { list?: string }).list === "schedule" ? "schedule" : (route as { list?: string }).list === "series" ? "series" : null,
	);
	const creatingNight = $derived(route.isNew && Boolean(attachSeriesId));
	/** "New event" (Schedule): a night for a series, or a special event without one. */
	const newEventRoute = $derived(
		route.isNew && (route as { kind?: string }).kind === "once",
	);
	const creatingOnce = $derived(newEventRoute && !attachSeriesId);
	const seriesOptions = $derived(
		events
			.filter((event) => event.repeatUnit !== "once")
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
	const editingOnce = $derived(
		!route.isNew &&
			!editingOccurrence &&
			String(current?.repeatUnit || repeatUnit || "").toLowerCase() === "once",
	);
	// A special event is not a series: keep Schedule highlighted in the menu.
	$effect(() => {
		setActiveNavOverride(editingOnce ? "events-schedule" : "");
		return () => setActiveNavOverride("");
	});
	const listView = $derived<"series" | "schedule">(
		routeList ??
			(editingOccurrence || creatingOnce || editingOnce
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
		loading || saving || driveUploading || calendarSyncing,
	);
	const busyLabel = $derived(
		calendarSyncing
			? "Updating calendar…"
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
					shortDescription,
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
					repeatUnit: creatingOnce ? "once" : "none",
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
			.filter((event) => event.repeatUnit !== "once")
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
			.filter((event) => event.repeatUnit !== "once")
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

	/** Photo owned by this editor (series main, or night override). */
	const framingUrl = $derived(
		pendingPhotoUrl ||
			(editingOccurrence
				? currentOccurrence?.overrides?.image?.url || ""
				: current?.mainImage?.url || ""),
	);
	/** Open series (Gwenda Nights): one night at a time, no future-events scope. */
	const isOpenSeries = $derived(
		String(current?.repeatUnit || repeatUnit || "none").toLowerCase() === "none",
	);
	const editingNight = $derived(editingOccurrence || creatingNight);
	const showHeaderDate = $derived(creatingOnce || editingOnce);
	const seriesRepeatLine = $derived(
		repeatLabel({
			repeatEvery: Number(repeatEvery) || 1,
			repeatUnit: repeatUnit as OpsEvent["repeatUnit"],
			weekdays,
			monthDay: Number(monthDay) || 0,
		}),
	);
	const typeLine = $derived(
		editingNight
			? "This night"
			: creatingOnce || editingOnce
				? "Special event"
				: repeatUnit === "none" || repeatUnit === "once"
					? "Series"
					: `Series · ${seriesRepeatLine}`,
	);
	const parentSeriesName = $derived(
		editingOccurrence
			? String(current?.name || "").trim()
			: creatingNight
				? events.find((event) => event.id === attachSeriesId)?.name || ""
				: "",
	);
	const headerDate = $derived(
		occurrenceDate
			? formatDate(occurrenceDate)
			: startsOn
				? formatDate(startsOn)
				: "No date",
	);
	const websiteJob = $derived(websiteJobFor(current?.id));
	const headerFlag = $derived(
		eventHeaderFlag(current?.publish, formDirty, {
			job: websiteJob?.state ?? null,
		}),
	);
	const liveCurrent = $derived(current?.publish.live === "current");

	const tabs = $derived.by((): SegmentedItem[] => {
		const base = route.isNew
			? "/events/new"
			: route.slug
				? `/events/${encodeURIComponent(route.slug)}`
				: "/events/new";
		const hrefFor = (id: string) => eventTabPath(base, id);
		if (creatingNight) {
			return [
				{ id: "details", label: "Details", href: newEventRoute ? "/events/new/once" : hrefFor("details") },
			];
		}
		if (creatingOnce) {
			return [{ id: "details", label: "Details", href: "/events/new/once" }];
		}
		if (editingOnce) {
			return [
				{ id: "details", label: "Details", href: hrefFor("details") },
				{ id: "gallery", label: "Images", href: hrefFor("gallery") },
			];
		}
		if (editingOccurrence) {
			return [
				{ id: "details", label: "Details", href: hrefFor("details") },
				{
					id: "schedule",
					label: "Schedule",
					href: hrefFor("schedule"),
				},
				{ id: "gallery", label: "Images", href: hrefFor("gallery") },
			];
		}
		return [
			{ id: "details", label: "Details", href: hrefFor("details") },
			{ id: "schedule", label: "Schedule", href: hrefFor("schedule") },
			{ id: "gallery", label: "Images", href: hrefFor("gallery") },
		];
	});

	function repeatLabel(event: {
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

	function statusLabel(event: OpsEvent): string {
		if (event.publish.live === "current") return "On website";
		return "Not on website yet";
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

	const seriesRows = $derived.by(() =>
		filteredSeries.map((event) => {
			const time = seriesTimeLabel(event);
			const guest = seriesGuestLabel(event);
			const next = seriesNextCell(event);
			const offer = seriesOfferLabel(event);
			return {
				id: event.id,
				href: eventItemPath(event.id),
				when: seriesWeekdayLabel(event) || repeatLabel(event),
				photo: event.mainImage?.url || "",
				name: event.name,
				blurb: seriesBlurb(event),
				detail: [time, guest, next, offer].filter(Boolean).join(" · "),
				time,
				guest,
				next,
				offer,
				status: statusLabel(event),
				tone: statusTone(event),
			};
		}),
	);

	const scheduleRows = $derived.by(() =>
		visibleSchedule.flatMap((week) => [
			{ kind: "week" as const, id: `week:${week.start}`, label: week.label },
			...week.rows.map((occurrence) => {
				const artist =
					occurrence.occurrence?.overrides.artist || occurrence.event.artist || "";
				const when =
					occurrence.event.repeatUnit === "once"
						? formatDate(occurrence.date)
						: repeatLabel(occurrence.event);
				return {
					kind: "night" as const,
					id: `${occurrence.event.id}:${occurrence.occurrence?.id || occurrence.date}`,
					href:
						occurrence.event.repeatUnit === "once"
							? eventItemPath(occurrence.event.id)
							: eventItemPath(`${occurrence.event.id}@${occurrence.date}`),
					weekday: formatScheduleWeekday(occurrence.date),
					dayDate: formatScheduleDate(occurrence.date),
					photo:
						occurrence.occurrence?.overrides.image?.url ||
						occurrence.event.mainImage?.url ||
						"",
					name: occurrence.occurrence?.overrides.name || occurrence.event.name,
					meta: artist ? `${artist} · ${when}` : when,
					status: statusLabel(occurrence.event),
					tone: statusTone(occurrence.event),
				};
			}),
		]),
	);

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
		pageUrl = event.pageUrl || "";
		const onceNight =
			event.repeatUnit === "once"
				? event.dates.find((row) => row.overrides?.description || row.overrides?.shortDescription) ||
					event.dates[0]
				: null;
		shortDescription = occurrence
			? occurrence.overrides.shortDescription || ""
			: event.shortDescription || onceNight?.overrides.shortDescription || "";
		description = occurrence
			? occurrence.overrides.description || event.description || ""
			: event.description || onceNight?.overrides.description || "";
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
		replacesSeries = event.replacesSeries || "";
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
		syncNightLocks(event, occurrence);
	}

	function blank() {
		current = null;
		clearPendingPhoto();
		name = "";
		artist = "";
		offer = "";
		pageUrl = "";
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
		repeatUnit = newEventRoute ? "once" : "none";
		weekdays = [];
		monthDay = "";
		endsOn = "";
		replacesSeries = "";
		attachSeriesId = presetSeriesId;
		presetSeriesId = "";
		warnings = [];
		heroCrops = null;
		defaultsUnlocked = false;
	}

	/** "Add night" on a series: the New event form with this series picked. */
	function addNightToSeries() {
		presetSeriesId = eventId;
		navigate("/events/new/once");
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
			pageUrl: pageUrl.trim(),
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
			...(repeatUnit === "once" ? { replacesSeries } : {}),
			heroCrops: heroCrops || null,
		};
	}

	function seriesText(key: string): string {
		const event = current;
		if (!event) return "";
		if (key === "name") return String(event.name || "").trim();
		if (key === "artist") return String(event.artist || "").trim();
		if (key === "offer") return String(event.offer || "").trim();
		if (key === "shortDescription") return String(event.shortDescription || "").trim();
		if (key === "description") return String(event.description || "").trim();
		if (key === "startTime") return String(event.startTime || "").trim();
		if (key === "endTime") return String(event.endTime || "").trim();
		if (key === "operationsNotes") return String(event.operationsNotes || "").trim();
		return "";
	}

	function lockedReadout(key: string): string {
		const raw = seriesText(key);
		if (!raw) return "None on the series";
		if (key === "startTime" || key === "endTime") return formatClock(raw) || raw;
		return raw;
	}

	function nightHasOwnCopy(
		event: OpsEvent,
		occurrence: OpsEvent["dates"][number] | null | undefined,
	): boolean {
		const overrides = occurrence?.overrides;
		if (!overrides) return false;
		const title = String(overrides.name || "").trim();
		const seriesName = String(event.name || "").trim().toLowerCase();
		return Boolean(
			(title && title.toLowerCase() !== seriesName) ||
				String(overrides.artist || "").trim() ||
				String(overrides.offer || "").trim() ||
				String(overrides.shortDescription || "").trim() ||
				String(overrides.description || "").trim() ||
				String(overrides.startTime || "").trim() ||
				String(overrides.endTime || "").trim() ||
				String(overrides.operationsNotes || "").trim() ||
				overrides.image?.url,
		);
	}

	function syncNightLocks(
		event: OpsEvent,
		occurrence: OpsEvent["dates"][number] | null | undefined,
	) {
		defaultsUnlocked = nightHasOwnCopy(event, occurrence);
	}

	function unlockDefaults() {
		defaultsUnlocked = true;
	}

	async function useSeriesDefaults() {
		if (currentOccurrence?.overrides?.image?.url) {
			await onClearImage("main");
			if (currentOccurrence?.overrides?.image?.url) return;
		}
		heroCrops = null;
		name = seriesText("name");
		artist = seriesText("artist");
		offer = seriesText("offer");
		shortDescription = "";
		description = seriesText("description");
		startTime = seriesText("startTime");
		endTime = seriesText("endTime");
		operationsNotes = seriesText("operationsNotes");
		defaultsUnlocked = false;
	}

	/** Empty means this night keeps the series value. */
	function nightField(key: string, value: string): string {
		const trimmed = value.trim();
		if (!defaultsUnlocked || trimmed.toLowerCase() === seriesText(key).toLowerCase()) {
			return "";
		}
		return trimmed;
	}

	function occurrenceBody(scope: "this" | "following" | "all") {
		const ownLinks = currentOccurrence?.overrides?.imageLinks?.length
			? currentOccurrence.overrides.imageLinks
			: [];
		return {
			scope,
			date: startsOn,
			seriesId: eventId,
			name: nightField("name", name),
			artist: nightField("artist", artist),
			offer: nightField("offer", offer),
			description: nightField("description", description),
			shortDescription: nightField("shortDescription", shortDescription),
			operationsNotes: nightField("operationsNotes", operationsNotes),
			imageLinks: ownLinks,
			time: !defaultsUnlocked || (startTime && endTime) ? "" : time.trim(),
			startTime: nightField("startTime", startTime),
			endTime: nightField("endTime", endTime),
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
		const stopJobEvents = onWebsiteJobEvent(takeReadyEvent);
		getMe()
			.then((me) => {
				localOps = me.siteEnv === "local";
			})
			.catch(() => undefined);
		return stopJobEvents;
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
		const view = scheduleView === "calendar" ? "calendar" : "list";
		try {
			localStorage.setItem(SCHEDULE_VIEW_KEY, view);
		} catch {
			/* Private browsing can block storage. The toggle still works. */
		}
	});

	let appliedScheduleFrom = "";
	$effect(() => {
		const from = scheduleFrom;
		if (from === appliedScheduleFrom) return;
		appliedScheduleFrom = from;
		if (/^\d{4}-\d{2}-\d{2}$/.test(from)) calendarMonth = from.slice(0, 7);
	});

	$effect(() => {
		if (routeList) listOrigin = routeList;
	});

	$effect(() => {
		if (!editingOnce || tab !== "schedule" || !eventId) return;
		navigate(eventItemPath(eventId, "details"), { replace: true });
	});

	$effect(() => {
		if (!editingOccurrence || !eventId || !occurrenceDate) return;
		if (String(current?.repeatUnit || "").toLowerCase() !== "once") return;
		navigate(eventItemPath(eventId, tab === "schedule" ? "details" : tab), {
			replace: true,
		});
	});

	$effect(() => {
		if (!editing) return;
		const canonical = route.isNew
			? eventNewPath(route.tab || "details", { once: newEventRoute })
			: route.slug
				? eventItemPath(route.slug, route.tab || "details")
				: "";
		if (canonical && canonical !== path) navigate(canonical, { replace: true });
	});

	$effect(() => {
		const label = !editing
			? ""
			: editingOccurrence && occurrenceDate
				? [formatDate(occurrenceDate), current?.name || name.trim()]
						.filter(Boolean)
						.join(" · ")
				: name.trim() ||
					(route.isNew ? (creatingNight ? "New night" : creatingOnce ? "New event" : "New series") : "Event");
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
		const order = ["details", "schedule", "gallery"];
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
		return editingOccurrence || creatingOnce || editingOnce
			? eventListPath("schedule")
			: eventListPath("series");
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

	/** Deleting takes it off gwenda.co.uk too; the dialog says so when it is there. */
	const onWebsite = $derived(
		Boolean(current?.publish) && current?.publish.live !== "unpublished",
	);

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
				const data = await deleteEvent(eventId);
				events = events.filter((row) => row.id !== eventId);
				toast.ok(onWebsite ? "Event deleted and taken off the website." : "Event deleted.");
				void refreshSitePending();
				applyWarnings(data.warnings);
				beginLeave();
				leaveEditor(listHomePath(), { force: true });
			} else {
				const data = await deleteEventOccurrence(eventId, occurrenceDate, scope);
				applyWarnings(data.warnings);
				void refreshSitePending();
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

	async function chooseConflict(replace: boolean) {
		const target = replacePrompt;
		if (!target || replacing) return;
		const previous = replacesSeries;
		replacePrompt = null;
		replacing = true;
		try {
			if (replace) {
				replacesSeries = target.slug;
				const skipped = [
					...new Set([...(target.skippedDates || []), target.date]),
				];
				const data = await updateEvent(target.id, { skippedDates: skipped });
				events = events.map((row) =>
					row.id === data.event.id ? data.event : row,
				);
			} else {
				replacesSeries = `keep:${target.slug}`;
			}
			skipReplaceAsk = true;
			await onSave(new Event("submit"));
		} catch (err) {
			replacesSeries = previous;
			const message =
				err instanceof Error ? err.message : "Could not cancel that night.";
			error = message;
			toast.error(message);
		} finally {
			replacing = false;
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
				applyWarnings(data.warnings);
				await uploadPendingPhoto(String(data.event?.id || attachSeriesId), startsOn);
				// A new night on an existing series: stage that series.
				await stageAfterSave(String(data.event?.id || attachSeriesId), "");
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
		if (
			(!editingOccurrence && !name.trim()) ||
			(!creatingNight && !editingOccurrence && !startsOn && repeatUnit !== "none")
		) {
			const message = !name.trim()
				? "Add a name."
				: repeatUnit === "once"
					? "Add a date."
					: "Add a start date on Schedule.";
			error = message;
			toast.error(message);
			const target = route.isNew
				? eventNewPath(!name.trim() ? "details" : "schedule", { once: newEventRoute })
				: eventItemPath(route.slug || eventId, !name.trim() ? "details" : "schedule");
			if (path !== target) navigate(target);
			return;
		}
		// The website needs one (publishEventPreview); a night uses its series'.
		if (!editingOccurrence && !description.replace(/<[^>]*>/g, "").trim()) {
			error = "Add a description. The website needs one.";
			toast.error(error);
			const target = route.isNew
				? eventNewPath("details", { once: newEventRoute })
				: eventItemPath(route.slug || eventId, "details");
			if (path !== target) navigate(target);
			return;
		}
		if (
			!editingOccurrence &&
			repeatUnit !== "none" &&
			repeatUnit !== "once" &&
			!endsOn
		) {
			error = "Add an end date for the recurring event.";
			toast.error(error);
			return;
		}
		if (repeatUnit === "once" && !skipReplaceAsk) {
			const hit = events.find(
				(event) =>
					event.id !== eventId &&
					event.repeatUnit !== "once" &&
					(event.dates || []).some((row) => row.date === startsOn),
			);
			const decided =
				replacesSeries === hit?.slug ||
				replacesSeries === `keep:${hit?.slug || ""}`;
			if (hit?.slug && !decided) {
				replacePrompt = {
					id: hit.id,
					name: hit.name,
					slug: hit.slug,
					date: startsOn,
					skippedDates: hit.skippedDates || [],
				};
				return;
			}
		}
		skipReplaceAsk = false;
		if (editingOccurrence) {
			if (isOpenSeries || startsOn !== occurrenceDate) {
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
				applyWarnings(data.warnings);
				await uploadPendingPhoto(String(data.event.id));
				await stageAfterSave(String(data.event.id), repeatUnit === "once" ? "Event saved." : "Series saved.");
				navigate(eventItemPath(data.event.id, tab), { replace: true });
			} else {
				const data = await updateEvent(eventId, body());
				rememberEvent(data.event, true);
				applyWarnings(data.warnings);
				await stageAfterSave(eventId, repeatUnit === "once" ? "Event saved." : "Series saved.");
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
			applyWarnings(data.warnings);
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
				// Both series changed: stage the one it left and the one it joined.
				if (!data.sourceDeleted && assignedTo !== eventId) await stageAfterSave(eventId, "");
				await stageAfterSave(assignedTo, assignedTo !== eventId ? "Night assigned to series." : "Night moved.");
				beginLeave();
				navigate(eventItemPath(`${assignedTo}@${movedTo || startsOn}`, tab), {
					replace: true,
					force: true,
				});
			} else {
				const count = "updated" in data ? Number(data.updated) || 1 : 1;
				await stageAfterSave(eventId, count === 1 ? "Event saved." : `${count} events saved.`);
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

	async function onSyncCalendar() {
		if (!eventId || busy || formDirty) return;
		calendarSyncing = true;
		error = "";
		warnings = [];
		try {
			const data = await syncEventCalendar(eventId);
			rememberEvent(data.event, false);
			warnings = (data.warnings || []).filter(Boolean);
			if (warnings.length === 1) toast.error(warnings[0]);
			else if (warnings.length) {
				toast.error(`Calendar updated with ${warnings.length} warnings.`);
			} else toast.ok("Calendar updated.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not update the calendar.";
			error = message;
			toast.error(message);
		} finally {
			calendarSyncing = false;
		}
	}


	/** "Update website": confirm, then publish just this event. */
	let putOpen = $state(false);
	let putError = $state("");
	let putting = $state(false);

	function openPutOnWebsite() {
		if (!eventId || busy || formDirty) return;
		putError = "";
		putOpen = true;
	}

	let retrying = $state(false);

	async function onRetryWebsiteJob() {
		if (!eventId || retrying) return;
		retrying = true;
		try {
			await retryWebsiteJob(eventId);
			toast.ok("Trying again. It carries on in the background.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "It still didn't work.");
		} finally {
			retrying = false;
		}
	}

	async function confirmPutOnWebsite() {
		if (!eventId || putting) return;
		putting = true;
		try {
			// Let the background work for this event finish first, so the two
			// never write the same nights at once.
			await websiteJobSettled(eventId);
			const data = await putEventOnWebsite(eventId);
			rememberEvent(data.event, false);
			putOpen = false;
			for (const warning of data.warnings || []) toast.info(warning);
			toast.ok("Website updated. What's on shows it now; its page follows in a few minutes.");
			void refreshSitePending();
		} catch (err) {
			putError = err instanceof Error ? err.message : "Could not update the website.";
		} finally {
			putting = false;
		}
	}


	function clearPendingPhoto() {
		if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
		pendingPhoto = null;
		pendingPhotoUrl = "";
	}

	function acceptPhotoFile(file: File | undefined | null) {
		if (!file || !file.type.startsWith("image/")) return;
		void preparePhoto(file).then((ready) => {
			if (!ready) return;
			if (eventId) return onImage("main", ready);
			// Not saved yet: hold it and show it; Save uploads it.
			clearPendingPhoto();
			pendingPhoto = ready;
			pendingPhotoUrl = URL.createObjectURL(ready);
		});
	}

	/** After the first save of a new event or night: upload the photo picked before it. */
	async function uploadPendingPhoto(id: string, nightDate = "") {
		const photo = pendingPhoto;
		clearPendingPhoto();
		if (!photo || !id) return;
		try {
			const data = nightDate
				? await uploadEventOccurrenceImage(id, nightDate, photo)
				: await uploadEventImage(id, photo, "main");
			rememberEvent(data.event, false);
		} catch (err) {
			toast.error(
				`Saved, but the photo didn't upload: ${err instanceof Error ? err.message : "something went wrong."} Add it again.`,
			);
		}
	}

	function onHeroCropsChange(next: HeroFraming | null) {
		heroCrops = next && hasMeaningfulFraming(next) ? next : null;
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
			driveOutsideGallery = 0;
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
			driveFolderUrl = data.gallery?.url || "";
			driveOutsideGallery = data.outsideGallery || 0;
			driveLoadedFor = eventId;
			if (current && data.folder?.id) {
				current = {
					...current,
					driveFolderId: data.folder.id,
					driveFolderUrl: data.folder.url || current.driveFolderUrl,
				};
			}
		} catch (err) {
			driveError =
				err instanceof Error ? err.message : "Could not load gallery images.";
			driveFiles = [];
			driveOutsideGallery = 0;
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
			let outside = driveOutsideGallery;
			for (const file of files) {
				const data = await uploadEventDriveImage(eventId, file);
				latest = data.files || [];
				driveFolderUrl = data.gallery?.url || driveFolderUrl;
				outside = data.outsideGallery || outside;
			}
			driveFiles = latest;
			driveOutsideGallery = outside;
			driveLoadedFor = eventId;
			toast.ok(files.length === 1 ? "Image uploaded." : `${files.length} images uploaded.`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not upload the gallery image.";
			driveError = message;
			toast.error(message);
		} finally {
			driveUploading = false;
		}
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
				await stageAfterSave(eventId, "Photo saved.");
			} else {
				const data = await uploadEventImage(eventId, file, role);
				rememberEvent(data.event, false);
				if (role === "main") await stageAfterSave(eventId, "Photo saved.");
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
				await stageAfterSave(eventId, "Photo removed.");
			} else {
				const data = await clearEventImage(eventId, role, imageName);
				rememberEvent(data.event, false);
				if (role === "main") {
					await stageAfterSave(eventId, "Photo removed.");
				}
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
					{#if listView === "schedule"}
						<Segmented
							bind:value={scheduleView}
							items={scheduleViewItems}
							size="sm"
							ariaLabel="Schedule layout"
						/>
					{/if}
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
					{#if listView === "series"}
						<Button type="button" disabled={busy} onclick={() => navigate("/events/new")}>
							{#snippet icon()}
								<Icon name="plus" size={16} />
							{/snippet}
							New series
						</Button>
					{:else}
						<Button type="button" disabled={busy} onclick={() => navigate("/events/new/once")}>
							{#snippet icon()}
								<Icon name="plus" size={16} />
							{/snippet}
							New event
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
				<div class="list-main fill">
				{#if listView === "series"}
					{#if seriesRows.length}
						<div class="grid-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
							<SeriesGrid rows={seriesRows} />
						</div>
					{:else}
						<p class="empty">
							{filtersActive ? "No series match these filters." : "No series yet."}
						</p>
					{/if}
				{:else if scheduleView === "calendar"}
					<div class="calendar-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
						<ScheduleCalendar
							weeks={visibleSchedule}
							bind:month={calendarMonth}
							today={scheduleTodayIso}
							filtersActive={scheduleFiltersActive}
						/>
					</div>
				{:else if scheduleRows.length}
					<div class="grid-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
						<ScheduleListGrid rows={scheduleRows} />
					</div>
				{:else}
					<p class="empty">
						{filtersActive ? "No nights match these filters." : "No upcoming nights."}
					</p>
				{/if}
				</div>
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
					<header class="panel-head">
						<div class="type-line">
							{#if editingNight}
								<Icon name="events" size={14} />
							{/if}
							<p class="eyebrow">{typeLine}</p>
						</div>
						<div class="head-tools">
							<div class="toolbar-actions">
								{#if editingOccurrence}
									<Button
										variant="accent"
										size="sm"
										type="button"
										disabled={busy}
										aria-label={defaultsUnlocked ? "Use series defaults" : "Override defaults"}
										title={defaultsUnlocked ? "Use series defaults" : "Override defaults"}
										onclick={() =>
											defaultsUnlocked ? void useSeriesDefaults() : unlockDefaults()}
									>
										{#snippet icon()}
											<Icon name={defaultsUnlocked ? "undo" : "lock"} />
										{/snippet}
									</Button>
									<span class="tool-sep" aria-hidden="true"></span>
								{/if}
								{#if eventId && !route.isNew && !editingOccurrence && !editingOnce}
									<Button
										variant="outline"
										size="sm"
										type="button"
										disabled={busy}
										title="Add a night to this series."
										onclick={addNightToSeries}
									>
										{#snippet icon()}
											<Icon name="plus" size={16} />
										{/snippet}
										Add night
									</Button>
								{/if}
								{#if eventId && !route.isNew}
									<Button
										variant="outline"
										size="sm"
										type="button"
										disabled={busy || formDirty}
										busy={calendarSyncing}
										title={
											formDirty
												? "Save before updating the calendar."
												: "Send the upcoming nights for this series to Google Calendar."
										}
										onclick={() => void onSyncCalendar()}
									>
										Update calendar
									</Button>
									{#if !liveCurrent}
										<Button
											variant="primary"
											size="sm"
											type="button"
											disabled={busy || formDirty}
											title={formDirty ? "Save first." : "Put this version of the event on gwenda.co.uk."}
											onclick={openPutOnWebsite}
										>
											Update website
										</Button>
									{/if}
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
							{#if editingNight}
								<div class="name-line">
									<p class="night-headline">
										{headerDate === "No date" ? "Pick a date" : headerDate}
									</p>
									<p class="status-flag {headerFlag.tone}">{headerFlag.label}</p>
								</div>
								{#if editingOccurrence && !defaultsUnlocked}
									<p class="locked-title">{lockedReadout("name")}</p>
								{:else}
									<input
										class="title-input night-title"
										id="event-name"
										required={!creatingNight && !editingOccurrence}
										autocomplete="off"
										aria-label="Night title"
										placeholder={creatingNight ? "Night title (optional)" : "Night title"}
										bind:value={name}
									/>
								{/if}
							{:else}
								<div class="name-line">
									<input
										class="title-input"
										id="event-name"
										required
										autocomplete="off"
										aria-label={creatingOnce || editingOnce ? "Event name" : "Series name"}
										placeholder={creatingOnce || editingOnce ? "Event name" : "Series name"}
										bind:value={name}
									/>
									<p class="status-flag {headerFlag.tone}">{headerFlag.label}</p>
								</div>
							{/if}
							{#if (!editingOccurrence || defaultsUnlocked) && artist.trim()}
								<p class="sub">{artist.trim()}</p>
							{/if}
						</div>
						{#if showHeaderDate}
							<div class="title-meta">
								<p class="date-readout" class:muted={headerDate === "No date"}>{headerDate}</p>
							</div>
						{/if}
						{#if editingNight}
							<p class="head-note">
								{#if parentSeriesName}<span>Part of {parentSeriesName}.</span>{/if}
								<span>
									{#if editingOccurrence && !defaultsUnlocked}
										Times, flyer, and copy come from the series.
									{:else}
										Changes apply to this night only.
									{/if}
								</span>
								{#if editingOccurrence && eventId}
									<a class="series-link" href={eventItemPath(eventId)}>Edit series</a>
								{/if}
							</p>
						{:else if route.isNew && !creatingOnce}
							<div class="create-mode">
								<p class="create-hint muted">
									Pick a series below to add a night, or leave it empty for a new series.
								</p>
							</div>
						{:else if creatingOnce}
							<div class="create-mode">
								<p class="create-hint muted">
									Pick a series below to add a night to it, or leave it on "No series" for a special event.
								</p>
							</div>
						{:else if !editingOnce}
							<p class="head-note">Series defaults, shared by its nights.</p>
						{/if}
						{#if localOps && eventId}
							<p class="head-note local-note">
								Test copy of ops: Save and Update website change the Gwenda Dev copy of the website,
								never gwenda.co.uk.
							</p>
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
													class:with-series={route.isNew}
													class:with-date={editingOccurrence || creatingNight || creatingOnce || editingOnce}
												>
													{#if route.isNew}
														<Field
															class="series"
															label="Series"
															for="event-series"
															tooltip={newEventRoute
																? "Choose a series to add a night to it, or No series for a special event."
																: "Choose an existing series to add this night, or leave empty to create a new series."}
														>
															<NativeSelect
																id="event-series"
																size="sm"
																bind:value={attachSeriesId}
																options={[
																	{
																		value: "",
																		label: newEventRoute ? "No series (special event)" : "New series",
																	},
																	...seriesOptions,
																]}
															/>
														</Field>
													{/if}
													{#if editingOccurrence || creatingNight || creatingOnce || editingOnce}
														<Field
															class="when"
															label="Date"
															for="event-date"
															tooltip={creatingOnce || editingOnce
																? "The night this event happens."
																: "This night only. Series start and end stay on Schedule."}
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
														class="start"
														label="Start"
														for="event-start-time"
														tooltip={editingOccurrence
															? "Shown on What's on. From the series until you override defaults."
															: "Default start time for each night. A night can override it."}
													>
														{#if editingOccurrence && !defaultsUnlocked}
															<p class="locked-value">{lockedReadout("startTime")}</p>
														{:else}
															<TextField
																id="event-start-time"
																size="sm"
																type="time"
																bind:value={startTime}
															/>
														{/if}
													</Field>
													<Field
														class="end"
														label="End"
														for="event-end-time"
														tooltip={editingOccurrence
															? "Shown on What's on. From the series until you override defaults."
															: "Default end time for each night. A night can override it."}
													>
														{#if editingOccurrence && !defaultsUnlocked}
															<p class="locked-value">{lockedReadout("endTime")}</p>
														{:else}
															<TextField
																id="event-end-time"
																size="sm"
																type="time"
																bind:value={endTime}
															/>
														{/if}
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
														class="guest"
														label="Guest Artist"
														for="event-artist"
														tooltip={editingOccurrence
															? "From the series until you override defaults. A guest of its own is a special edition on What's on."
															: "Optional default. A night with its own guest is labelled Guest on Upcoming and What's on."}
													>
														{#if editingOccurrence && !defaultsUnlocked}
															<p class="locked-value">{lockedReadout("artist")}</p>
														{:else}
															<TextField id="event-artist" size="sm" bind:value={artist} />
														{/if}
													</Field>
													<Field
														class="offer"
														label="Offer"
														for="event-offer"
														tooltip={editingOccurrence
															? "From the series until you override defaults."
															: "Default public wording, such as a drink deal. A night can override it."}
													>
														{#if editingOccurrence && !defaultsUnlocked}
															<p class="locked-value">{lockedReadout("offer")}</p>
														{:else}
															<TextField
																id="event-offer"
																size="sm"
																bind:value={offer}
																placeholder="£10 Negroni"
															/>
														{/if}
													</Field>
													{#if !editingOccurrence}
														<Field
															class="span-all"
															label="Page link"
															for="event-page-url"
															tooltip="Optional. Their own page. Shown on the event when it is set."
														>
															<TextField
																id="event-page-url"
																size="sm"
																bind:value={pageUrl}
																placeholder="https://"
															/>
														</Field>
													{/if}
													<Field
														class="span-all"
														label="Short description"
														for="event-short-description"
														tooltip={editingOccurrence
															? "From the series until you override defaults. The What's on card sentence."
															: "What's on card. One or two lines on what this night is."}
													>
														{#if editingOccurrence && !defaultsUnlocked}
															<p class="locked-value">{lockedReadout("shortDescription")}</p>
														{:else}
															<TextArea
																id="event-short-description"
																bind:value={shortDescription}
																rows={2}
																placeholder={editingOccurrence
																	? seriesText("shortDescription") ||
																		"On Sat 10 Oct we are excited to host…"
																	: "Card blurb…"}
															/>
														{/if}
													</Field>
													<Field
														class="span-all"
														label={editingOccurrence ? "Description" : "Full description"}
														for="event-description"
														tooltip={editingOccurrence
															? "From the series until you override defaults."
															: "Series and night page. Use the short field for the What's on card."}
													>
														{#if editingOccurrence && !defaultsUnlocked}
															<p class="locked-value prose">{lockedReadout("description")}</p>
														{:else}
															<MethodEditor
																id="event-description"
																value={description}
																label="Event description"
																placeholder="Set the scene…"
																onChange={(next) => (description = next)}
															/>
														{/if}
													</Field>
													<Field
														class="span-all"
														label="Operations notes"
														for="event-operations-notes"
														tooltip="Internal only. Never published to the website."
													>
														{#if editingOccurrence && !defaultsUnlocked}
															<p class="locked-value prose">{lockedReadout("operationsNotes")}</p>
														{:else}
															<TextArea
																id="event-operations-notes"
																bind:value={operationsNotes}
																rows={4}
																placeholder="Contacts, fee, setup, access, equipment…"
															/>
														{/if}
													</Field>
												</div>
											</div>
											<aside class="details-side">
												{#if !eventId}
													<p class="hint">Save before adding a photo.</p>
												{/if}
												{#if editingOccurrence && !defaultsUnlocked}
													<HeroImagePanel
														sourceUrl={current?.mainImage?.url || ""}
														locked
														tooltip="Series flyer. Override defaults to give this night its own photo. The original is saved in this series Drive folder."
														onchangecrops={() => undefined}
														onpickfile={() => undefined}
														onclear={() => undefined}
													/>
												{:else}
													<HeroImagePanel
														sourceUrl={framingUrl}
														crops={heroCrops}
														disabled={busy}
														tooltip={editingOccurrence
															? "This night's flyer. What's on uses it while this is the next night. The original is saved in this series Drive folder."
															: "What's on shows the next night's flyer when that night has its own photo. This is the fallback. The original is saved in this series Drive folder."}
														onchangecrops={onHeroCropsChange}
														onpickfile={(file) => acceptPhotoFile(file)}
														onclear={() =>
															pendingPhoto ? clearPendingPhoto() : void onClearImage("main")}
													/>
												{/if}
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
												<div class="drive-head">
													<h2 class="section-title">
														<span class="section-label">
															Gallery
															<Tip
																label="Gallery"
																tooltip="Photos stored in this event's Drive gallery. The What's on flyer is the photo on Details."
															/>
														</span>
													</h2>
													{#if driveFolderUrl}
														<a
															class="drive-link"
															href={driveFolderUrl}
															target="_blank"
															rel="noreferrer">Open gallery</a
														>
													{/if}
												</div>
												{#if driveError}
													<p class="error">{driveError}</p>
												{/if}
												{#if driveOutsideGallery > 0}
													<p class="hint">
														{driveOutsideGallery === 1
															? "1 image is in the event folder, outside the gallery, so it is not shown here."
															: `${driveOutsideGallery} images are in the event folder, outside the gallery, so they are not shown here.`}
													</p>
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
									{/if}
									{#if websiteJob?.state === "failed" && !formDirty}
										<div class="job-failed" role="alert">
											<p>
												Saved, but it couldn't be got ready for the website: {websiteJob.error ||
													"something went wrong."}
											</p>
											<Button
												variant="outline"
												size="sm"
												type="button"
												busy={retrying}
												disabled={retrying}
												onclick={() => void onRetryWebsiteJob()}
											>
												Try again
											</Button>
										</div>
									{/if}
									{#if warnings.length}
										<ul class="warnings">
											{#each warnings as warning (warning)}
												<li>{warning}</li>
											{/each}
										</ul>
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
							{saving && intent === "save"
								? "Saving…"
								: editingNight
									? "Save this night"
									: creatingOnce || editingOnce
										? "Save"
										: "Save series"}
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
				open={replacePrompt !== null}
				title={replacePrompt
					? `${formatDate(replacePrompt.date)} already has ${replacePrompt.name}`
					: ""}
				onclose={() => (replacePrompt = null)}
			>
				<p class="delete-copy">
					Cancel that night and show {name.trim() || "this event"} instead, or keep both?
				</p>
				{#snippet footer()}
					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={replacing}
						onclick={() => void chooseConflict(false)}
					>
						Keep both
					</Button>
					<Button
						size="sm"
						type="button"
						disabled={replacing}
						busy={replacing}
						onclick={() => void chooseConflict(true)}
					>
						Show {name.trim() || "this event"} instead
					</Button>
				{/snippet}
			</Dialog>

			<Dialog
				open={deleteScopeOpen}
				title="Which events should be deleted?"
				onclose={cancelDelete}
			>
				<p class="delete-copy">
					Choose how widely to delete. Past events will not be changed.
				</p>
				{#if onWebsite}
					<p class="also-website">It comes off the website too, straight away.</p>
				{/if}
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
				{#if onWebsite}
					<p class="also-website">It comes off the website too, straight away.</p>
				{/if}
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

			<Dialog
				open={putOpen}
				title="Update the website?"
				onclose={() => {
					if (!putting) putOpen = false;
				}}
			>
				<p class="delete-copy">This changes gwenda.co.uk for everyone.</p>
				{#if putError}
					<p class="put-error">{putError}</p>
				{/if}
				{#snippet footer()}
					<Button variant="outline" size="sm" type="button" disabled={putting} onclick={() => (putOpen = false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						type="button"
						busy={putting}
						disabled={putting}
						onclick={() => void confirmPutOnWebsite()}
					>
						Update website
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
		overflow: hidden;
		padding: var(--page-gutter);
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		background: var(--background);
	}

	.list-main {
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: auto;
	}

	.list-main.fill {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.grid-host,
	.calendar-host {
		flex: 1;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.list-page.parked {
		/* Keep the list laid out and scrolled under the detail. */
		pointer-events: none;
	}

	.series-link {
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

	.empty,
	.hint,
	.status,
	.lede {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
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

	.panel-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
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

	.tool-sep {
		width: 1px;
		height: 1rem;
		margin: 0 0.15rem;
		background: var(--border);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.head-tools :global(.close-btn:hover:not(:disabled)) {
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

	.name-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem 0.7rem;
		min-width: 0;
	}

	.name-line .title-input {
		flex: 0 1 auto;
		width: auto;
		min-width: min(100%, 10rem);
		max-width: 100%;
		field-sizing: content;
	}

	.night-headline {
		margin: 0;
		font-family: var(--font);
		font-size: 1.85rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.3;
		color: var(--primary);
	}

	.locked-title {
		margin: 0.15rem 0 0;
		color: var(--foreground);
		font-size: 1.05rem;
		font-weight: 500;
		line-height: 1.3;
	}

	.locked-value {
		margin: 0;
		min-height: var(--control-h-sm);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.4;
	}

	.locked-value.prose {
		white-space: pre-wrap;
		max-height: 7.5rem;
		overflow: auto;
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

	.title-input.night-title {
		font-size: 1.05rem;
		font-weight: 500;
		letter-spacing: 0;
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
		margin: 0;
		padding: 0.18rem 0.5rem;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status-flag.unpublished {
		color: var(--primary-foreground);
		background: var(--primary);
	}

	.status-flag.unsaved {
		color: var(--destructive-foreground);
		background: var(--destructive);
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

	.head-note {
		grid-column: 1 / -1;
		grid-row: 3;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.65rem;
		margin: 0;
		padding-top: 0.45rem;
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.02em;
		line-height: 1.4;
		color: var(--muted-foreground);
		max-width: 40rem;
	}

	/* Its own row: the night/series note already sits in row 3. */
	.head-note.local-note {
		grid-row: 4;
		padding-top: 0.2rem;
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
		gap: 1.25rem 1.5rem;
		align-items: start;
	}

	.details-main,
	.details-side {
		display: grid;
		gap: 0.85rem;
		align-content: start;
		min-width: 0;
	}

	.details-side {
		order: -1;
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

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
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
		grid-template-columns: minmax(0, 1fr);
		gap: 0.45rem;
		align-items: center;
	}

	.slot-remove {
		display: grid;
		place-content: center;
		justify-self: start;
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

	/*
	  One breakpoint. Below it, the photo and every control stack.
	  At it, the photo sits beside the form and paired fields share a row.
	*/
	@container event-detail (min-width: 52rem) {
		.details-board {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.details-side {
			order: 0;
		}

		.control-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.control-grid.has-slots {
			--gutter: 2.15rem;
			margin-right: var(--gutter);
		}

		.control-grid > :global(.series),
		.control-grid > :global(.when) {
			grid-column: 1 / -1;
		}

		.control-grid > :global(.start),
		.control-grid > :global(.guest) {
			grid-column: 1;
		}

		.control-grid > :global(.end),
		.control-grid > :global(.offer) {
			grid-column: 2;
		}

		.night-schedule-head {
			margin-right: calc(var(--gutter) * -1);
		}

		.night-slot {
			position: relative;
			grid-template-columns: minmax(0, 1fr) var(--time) var(--time);
			column-gap: 0.7rem;
		}

		.slot-remove {
			position: absolute;
			top: 50%;
			right: calc(var(--gutter) * -1);
			justify-self: auto;
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

	.job-failed {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid color-mix(in srgb, var(--destructive) 35%, transparent);
		border-radius: var(--radius-md, 0.5rem);
		color: var(--destructive);
		font-size: var(--text-sm);
	}

	.job-failed p {
		flex: 1 1 16rem;
		margin: 0;
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

	.also-website {
		margin: 0.85rem 0 0;
		font-size: var(--text-sm);
	}

	.put-error {
		margin: 0.75rem 0 0;
		color: var(--destructive);
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

		.head-note {
			grid-row: 3;
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
	}

	@media (max-width: 600px) {
		.title-input,
		.date-readout,
		.night-headline {
			font-size: 1.35rem;
		}

		.title-input.night-title {
			font-size: 1rem;
		}
	}
</style>
