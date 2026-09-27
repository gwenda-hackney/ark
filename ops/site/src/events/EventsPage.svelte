<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		BusyOverlay,
		ComboBox,
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
		TimeField,
		Tip,
	} from "../ui";
	import type { SegmentedItem } from "../ui/types";
	import MethodEditor from "../menu/MethodEditor.svelte";
	import { EVENTS_HELP } from "./events-help";
	import { eventHeaderFlag } from "./event-header-status";
	import HeroImagePanel from "./HeroImagePanel.svelte";
	import {
		onWebsiteJobEvent,
		queueWebsiteJob,
		retryWebsiteJob,
		websiteJobFor,
		websiteJobSettled,
	} from "./website-jobs.svelte";
	import { preparePhoto } from "../ui/photo-prep";
	import EventsList from "./EventsList.svelte";
	import DeleteEventDialog from "./dialogs/DeleteEventDialog.svelte";
	import DiscardDialog from "./dialogs/DiscardDialog.svelte";
	import ReplaceNightDialog from "./dialogs/ReplaceNightDialog.svelte";
	import ScopeDialog from "./dialogs/ScopeDialog.svelte";
	import UpdateWebsiteDialog from "./dialogs/UpdateWebsiteDialog.svelte";
	import { WEEKDAY_LABELS, formatDate, repeatLabel } from "./event-labels";
	import {
		hasMeaningfulFraming,
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
		getApprovedArtists,
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
		type ApprovedArtist,
		type EventDriveFile,
		type OpsEvent,
	} from "../app/api";
	import {
		editorKey,
		eventItemPath,
		eventListPath,
		eventNewPath,
		eventTabPath,
		itemSlug,
		leaveEditor,
		loginNext,
		navigate,
		normalizeEventTab,
		parseShellPath,
	} from "../app/nav";
	import { setActiveNavOverride, setCrumbLeaf } from "../ui/crumbs.svelte";
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
	} from "./event-schedule";
	import { toast } from "../ui/toast.svelte";
	import { refreshSitePending } from "../website/site-pending.svelte";
	import { easeOut, fadeMs, flyMs } from "../ui/motion";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../ui/unsaved.svelte";
	import { WEEKDAYS } from "./event-recurrence.js";
	import {
		EventForm,
		lockedReadout as lockedReadoutOf,
		seriesText as seriesTextOf,
		type SeriesTextKey,
	} from "./event-form.svelte";

	let { path = "/" }: { path?: string } = $props();

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
	/** Photo picked on a new event: shown now, uploaded right after the first save. */
	let pendingPhoto = $state<File | null>(null);
	let pendingPhotoUrl = $state("");

	const form = new EventForm();
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
	/** Approved play applicants, suggested in Guest/collaboration. */
	let approvedArtists = $state<ApprovedArtist[]>([]);

	/** Picked from the Guest/collaboration list: their name, and their Instagram or website. */
	function pickApprovedArtist(id: string) {
		const hit = approvedArtists.find((row) => row.id === id);
		if (!hit) return;
		form.artist = hit.name;
		if (hit.link) form.pageUrl = hit.link;
	}

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
			String(current?.repeatUnit || form.repeatUnit || "").toLowerCase() === "once",
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

	const formDirty = $derived(
		form.isDirty(current, { occurrenceDate, creatingOnce }) ||
			(editingOccurrence && Boolean(current) && attachSeriesId !== eventId),
	);
	const webAddressChanged = $derived(form.webAddressChanged(current));
	const previewDates = $derived(form.upcomingDates(current));

	/** Photo owned by this editor (series main, or night override). */
	const framingUrl = $derived(
		pendingPhotoUrl ||
			(editingOccurrence
				? currentOccurrence?.overrides?.image?.url || ""
				: current?.mainImage?.url || ""),
	);
	/** Open series (Gwenda Nights): one night at a time, no future-events scope. */
	const isOpenSeries = $derived(
		String(current?.repeatUnit || form.repeatUnit || "none").toLowerCase() === "none",
	);
	const editingNight = $derived(editingOccurrence || creatingNight);
	const showHeaderDate = $derived(creatingOnce || editingOnce);
	const seriesRepeatLine = $derived(
		repeatLabel({
			repeatEvery: Number(form.repeatEvery) || 1,
			repeatUnit: form.repeatUnit as OpsEvent["repeatUnit"],
			weekdays: form.weekdays,
			monthDay: Number(form.monthDay) || 0,
		}),
	);
	const typeLine = $derived(
		editingNight
			? "This night"
			: creatingOnce || editingOnce
				? "Special event"
				: form.repeatUnit === "none" || form.repeatUnit === "once"
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
			: form.startsOn
				? formatDate(form.startsOn)
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

	function fill(event: OpsEvent) {
		current = event;
		form.fill(event, occurrenceDate);
		attachSeriesId = event.id;
	}

	function blank() {
		current = null;
		clearPendingPhoto();
		form.reset(newEventRoute ? "once" : "none");
		attachSeriesId = presetSeriesId;
		presetSeriesId = "";
		warnings = [];
	}

	/** A new form starts in its name, or its date when the series is already picked. */
	async function focusFirstField() {
		await tick();
		const id = attachSeriesId ? "event-date" : "event-name";
		(document.getElementById(id) as HTMLInputElement | null)?.focus();
	}

	/** "Add night" on a series: the New event form with this series picked. */
	function addNightToSeries() {
		presetSeriesId = eventId;
		navigate("/events/new/once");
	}

	function rememberEvent(event: OpsEvent, replaceFields: boolean) {
		events = events.some((row) => row.id === event.id)
			? events.map((row) => (row.id === event.id ? event : row))
			: [...events, event];
		if (replaceFields) fill(event);
		else {
			current = event;
			form.syncHeroCrops(event, occurrenceDate);
		}
	}

	const seriesText = (key: SeriesTextKey) => seriesTextOf(current, key);
	const lockedReadout = (key: SeriesTextKey) => lockedReadoutOf(current, key);

	function unlockDefaults() {
		form.defaultsUnlocked = true;
	}

	async function useSeriesDefaults() {
		if (currentOccurrence?.overrides?.image?.url) {
			await onClearImage("main");
			if (currentOccurrence?.overrides?.image?.url) return;
		}
		form.useSeriesDefaults(current);
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
		// A hint only: Guest/collaboration still takes any name without it.
		getApprovedArtists()
			.then((data) => (approvedArtists = data.artists || []))
			.catch(() => {});
		const stopJobEvents = onWebsiteJobEvent(takeReadyEvent);
		getMe()
			.then((me) => {
				localOps = me.siteEnv === "local";
			})
			.catch(() => undefined);
		return stopJobEvents;
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
				? [formatDate(occurrenceDate), current?.name || form.name.trim()]
						.filter(Boolean)
						.join(" · ")
				: form.name.trim() ||
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
				void focusFirstField();
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
		const previous = form.replacesSeries;
		replacePrompt = null;
		replacing = true;
		try {
			if (replace) {
				form.replacesSeries = target.slug;
				const skipped = [
					...new Set([...(target.skippedDates || []), target.date]),
				];
				const data = await updateEvent(target.id, { skippedDates: skipped });
				events = events.map((row) =>
					row.id === data.event.id ? data.event : row,
				);
			} else {
				form.replacesSeries = `keep:${target.slug}`;
			}
			skipReplaceAsk = true;
			await onSave(new Event("submit"));
		} catch (err) {
			form.replacesSeries = previous;
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
			if (!attachSeriesId || !form.startsOn) {
				const message = !attachSeriesId ? "Choose a series." : "Add a date.";
				error = message;
				toast.error(message);
				return;
			}
			saving = true;
			intent = "save";
			error = "";
			try {
				const data = await ensureEventOccurrence(attachSeriesId, form.startsOn, {
					name: form.name.trim(),
					artist: form.artist.trim(),
					offer: form.offer.trim(),
					pageUrl: form.pageUrl.trim(),
					description: form.description.trim(),
					shortDescription: form.shortDescription.trim(),
					operationsNotes: form.operationsNotes.trim(),
					imageLinks: form.imageLinksText
						.split(/\r?\n/)
						.map((link) => link.trim())
						.filter(Boolean),
					time: form.startTime && form.endTime ? "" : form.time.trim(),
					startTime: form.startTime,
					endTime: form.endTime,
				});
				rememberEvent(data.event, true);
				applyWarnings(data.warnings);
				await uploadPendingPhoto(String(data.event?.id || attachSeriesId), form.startsOn);
				// A new night on an existing series: stage that series.
				await stageAfterSave(String(data.event?.id || attachSeriesId), "");
				toast.ok(data.created ? "Night added to the series." : "Night opened.");
				navigate(eventItemPath(`${attachSeriesId}@${form.startsOn}`), { replace: true });
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
			(!editingOccurrence && !form.name.trim()) ||
			(!creatingNight && !editingOccurrence && !form.startsOn && form.repeatUnit === "once")
		) {
			const message = !form.name.trim() ? "Add a name." : "Add a date.";
			error = message;
			toast.error(message);
			const target = route.isNew
				? eventNewPath(!form.name.trim() ? "details" : "schedule", { once: newEventRoute })
				: eventItemPath(route.slug || eventId, !form.name.trim() ? "details" : "schedule");
			if (path !== target) navigate(target);
			return;
		}
		// The website needs one (publishEventPreview); a night uses its series'.
		if (!editingOccurrence && !form.description.replace(/<[^>]*>/g, "").trim()) {
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
			form.repeatUnit !== "none" &&
			form.repeatUnit !== "once" &&
			form.startsOn &&
			!form.endsOn
		) {
			error = "Add an end date for the recurring event.";
			toast.error(error);
			return;
		}
		if (form.repeatUnit === "once" && !skipReplaceAsk) {
			const hit = events.find(
				(event) =>
					event.id !== eventId &&
					event.repeatUnit !== "once" &&
					(event.dates || []).some((row) => row.date === form.startsOn),
			);
			const decided =
				form.replacesSeries === hit?.slug ||
				form.replacesSeries === `keep:${hit?.slug || ""}`;
			if (hit?.slug && !decided) {
				replacePrompt = {
					id: hit.id,
					name: hit.name,
					slug: hit.slug,
					date: form.startsOn,
					skippedDates: hit.skippedDates || [],
				};
				return;
			}
		}
		skipReplaceAsk = false;
		if (editingOccurrence) {
			if (isOpenSeries || form.startsOn !== occurrenceDate) {
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
				const data = await createEvent(form.body(current));
				rememberEvent(data.event, true);
				applyWarnings(data.warnings);
				await uploadPendingPhoto(String(data.event.id));
				await stageAfterSave(String(data.event.id), form.repeatUnit === "once" ? "Event saved." : "Series saved.");
				navigate(eventItemPath(data.event.id, tab), { replace: true });
			} else {
				const data = await updateEvent(eventId, form.body(current));
				rememberEvent(data.event, true);
				applyWarnings(data.warnings);
				await stageAfterSave(eventId, form.repeatUnit === "once" ? "Event saved." : "Series saved.");
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
				form.occurrenceBody(scope, current, { seriesId: eventId, occurrenceDate, hasOwnPhoto: Boolean(framingUrl) }),
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
				navigate(eventItemPath(`${assignedTo}@${movedTo || form.startsOn}`, tab), {
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
		form.heroCrops = next && hasMeaningfulFraming(next) ? next : null;
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
	<EventsList {events} {listView} {listTitle} {busy} {error} {loading} {editing} {missing} onreload={() => void reload()} />
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
							<p class="status-flag {headerFlag.tone}">{headerFlag.label}</p>
						</div>
						<div class="head-tools">
							<div class="toolbar-actions">
								{#if editingOccurrence}
									<Button
										variant="accent"
										size="sm"
										type="button"
										disabled={busy}
										aria-label={form.defaultsUnlocked ? "Use series defaults" : "Override defaults"}
										title={form.defaultsUnlocked ? "Use series defaults" : "Override defaults"}
										onclick={() =>
											form.defaultsUnlocked ? void useSeriesDefaults() : unlockDefaults()}
									>
										{#snippet icon()}
											<Icon name={form.defaultsUnlocked ? "undo" : "lock"} />
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
								</div>
								{#if editingOccurrence && !form.defaultsUnlocked}
									<p class="locked-title">{lockedReadout("name")}</p>
								{:else}
									<input
										class="title-input night-title"
										id="event-name"
										required={!creatingNight && !editingOccurrence}
										autocomplete="off"
										aria-label="Night title"
										placeholder={creatingNight ? "Night title (optional)" : "Night title"}
										bind:value={form.name}
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
										bind:value={form.name}
									/>
								</div>
							{/if}
							{#if (!editingOccurrence || form.defaultsUnlocked) && form.artist.trim()}
								<p class="sub">{form.artist.trim()}</p>
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
									{#if editingOccurrence && !form.defaultsUnlocked}
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
																bind:value={form.startsOn}
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
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value">{lockedReadout("startTime")}</p>
														{:else}
															<TimeField
																id="event-start-time"
																size="sm"
																bind:value={form.startTime}
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
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value">{lockedReadout("endTime")}</p>
														{:else}
															<TimeField
																id="event-end-time"
																size="sm"
																bind:value={form.endTime}
																suggest={form.startTime || "23:00"}
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
																	onclick={() => form.addNightSlot()}
																>
																	Add slot
																</Button>
															</div>
															{#if form.nightSchedule.length}
																<ul class="night-schedule-list">
																	{#each form.nightSchedule as slot, index (index)}
																		<li class="night-slot">
																			<TextField
																				size="sm"
																				placeholder="Open decks"
																				bind:value={form.nightSchedule[index].label}
																				aria-label={`Slot ${index + 1} label`}
																			/>
																			<TimeField
																				size="sm"
																				bind:value={form.nightSchedule[index].startTime}
																				aria-label={`Slot ${index + 1} start`}
																			/>
																			<TimeField
																				size="sm"
																				bind:value={form.nightSchedule[index].endTime}
																				suggest={form.nightSchedule[index].startTime || form.endTime || "23:00"}
																				aria-label={`Slot ${index + 1} end`}
																			/>
																			<button
																				class="slot-remove"
																				type="button"
																				disabled={busy}
																				aria-label={`Remove slot ${index + 1}`}
																				onclick={() => form.removeNightSlot(index)}
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
													<div class="guest guest-group">
													<Field
														label="Guest/collaboration"
														for="event-artist"
														tooltip={editingOccurrence
															? "From the series until you override defaults. A guest of its own is a special edition on What's on."
															: "Optional default. Type any name, or pick an approved artist from the list (approve them in Play applications) to bring their link too. A night with its own guest is labelled Guest on Upcoming and What's on."}
													>
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value">{lockedReadout("artist")}</p>
														{:else}
															<ComboBox
																id="event-artist"
																size="sm"
																bind:value={form.artist}
																placeholder="Artist, DJ or collaborator"
																emptyText="No approved artists yet. Approve them in Play applications."
																options={approvedArtists.map((row) => ({ value: row.id, label: row.name }))}
																onpick={(option) => pickApprovedArtist(option.value)}
															/>
														{/if}
													</Field>
													<Field
														label="Guest/collaboration link"
														for="event-page-url"
														tooltip={editingOccurrence
															? "From the series until you override defaults. A guest of this night can link their own Instagram or website."
															: "Optional. Their Instagram or website (an @handle works), linked on the website."}
													>
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value">{lockedReadout("pageUrl")}</p>
														{:else}
															<TextField
																id="event-page-url"
																size="sm"
																bind:value={form.pageUrl}
																placeholder="Instagram or website link"
															/>
														{/if}
													</Field>
													</div>
													<Field
														class="offer"
														label="Offer"
														for="event-offer"
														tooltip={editingOccurrence
															? "From the series until you override defaults."
															: "Default public wording, such as a drink deal. A night can override it."}
													>
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value">{lockedReadout("offer")}</p>
														{:else}
															<TextField
																id="event-offer"
																size="sm"
																bind:value={form.offer}
																placeholder="£10 Negroni"
															/>
														{/if}
													</Field>
													<Field
														class="span-all"
														label="Short description"
														for="event-short-description"
														tooltip={editingOccurrence
															? "From the series until you override defaults. The What's on card sentence."
															: "What's on card. One or two lines on what this night is."}
													>
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value">{lockedReadout("shortDescription")}</p>
														{:else}
															<TextArea
																id="event-short-description"
																bind:value={form.shortDescription}
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
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value prose">{lockedReadout("description")}</p>
														{:else}
															<MethodEditor
																id="event-description"
																value={form.description}
																label="Event description"
																placeholder="Set the scene…"
																onChange={(next) => (form.description = next)}
															/>
														{/if}
													</Field>
													{#if current && !editingOccurrence}
														<Field
															class="span-all"
															label="Web address"
															for="event-web-address"
															tooltip="The end of this {editingOnce ? 'event' : 'series'}'s page address on the website. Letters, numbers and dashes. If you change it, old links still lead here."
														>
															<div class="web-address">
																<span class="web-address-base">gwenda.co.uk/whats-on/</span>
																<TextField
																	id="event-web-address"
																	size="sm"
																	bind:value={form.webAddress}
																	placeholder={current.slug}
																	autocomplete="off"
																	spellcheck="false"
																/>
															</div>
															{#if webAddressChanged}
																<p class="hint">
																	New address: gwenda.co.uk/whats-on/{itemSlug(form.webAddress)}. The website
																	changes when you press Update website, and old links will lead here.
																</p>
															{/if}
														</Field>
													{/if}
													<Field
														class="span-all"
														label="Operations notes"
														for="event-operations-notes"
														tooltip="Internal only. Never published to the website."
													>
														{#if editingOccurrence && !form.defaultsUnlocked}
															<p class="locked-value prose">{lockedReadout("operationsNotes")}</p>
														{:else}
															<TextArea
																id="event-operations-notes"
																bind:value={form.operationsNotes}
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
												{#if editingOccurrence && !form.defaultsUnlocked}
													<HeroImagePanel
														sourceUrl={current?.mainImage?.url || ""}
														locked
														tooltip="Series flyer. Override defaults to give this night its own photo. Original downloads the file as uploaded."
														onchangecrops={() => undefined}
														onpickfile={() => undefined}
														onclear={() => undefined}
													/>
												{:else}
													<HeroImagePanel
														sourceUrl={framingUrl}
														crops={form.heroCrops}
														disabled={busy}
														tooltip={editingOccurrence
															? "This night's flyer. What's on uses it while this is the next night. Original downloads the file as uploaded."
															: "What's on shows the next night's flyer when that night has its own photo. This is the fallback. Original downloads the file as uploaded."}
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
											{#if form.repeatUnit === "none"}
												<p class="hint">
													This series does not repeat. Add each night when it is
													scheduled (Details → Series, or New with this series
													selected).
												</p>
											{/if}
											<div class="rule-fields">
												<div class="rule-row">
													<Field
														label="Unit"
														for="event-unit"
														tooltip="Weekly or monthly builds the calendar. Does not repeat is for series like Gwenda Nights, where each night is added on its own date."
													>
														<NativeSelect
															id="event-unit"
															size="sm"
															bind:value={form.repeatUnit}
															disabled={editingOccurrence}
															options={[
																{ value: "none", label: "Does not repeat" },
																{ value: "day", label: "Day" },
																{ value: "week", label: "Week" },
																{ value: "month", label: "Month" },
															]}
														/>
													</Field>
													{#if form.repeatUnit !== "none"}
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
																bind:value={form.repeatEvery}
																disabled={editingOccurrence}
															/>
														</Field>
													{/if}
													{#if form.repeatUnit === "week"}
														<Field
															label="On"
															class="days"
															tooltip="Which weekdays the night falls on. Pick more than one for a series that runs several nights a week."
														>
															<div class="chips" role="group" aria-label="Weekdays">
																{#each WEEKDAYS as day (day)}
																	<button
																		type="button"
																		class="chip"
																		class:on={form.weekdays.includes(day)}
																		aria-pressed={form.weekdays.includes(day)}
																		disabled={editingOccurrence}
																		onclick={() => form.toggleWeekday(day)}
																	>
																		{WEEKDAY_LABELS[day]}
																	</button>
																{/each}
															</div>
														</Field>
													{/if}
													{#if form.repeatUnit === "month"}
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
																bind:value={form.monthDay}
																disabled={editingOccurrence}
																placeholder="From the start date"
															/>
														</Field>
													{/if}
												</div>
												<div class="rule-row">
													<Field
														label="Starts on"
														for="event-starts"
														tooltip={form.repeatUnit === "none"
															? "First scheduled night. Leave empty until you add a night."
															: "First night of the series. Recurrence builds forward from here. Leave empty if it is not fixed yet: the website says “Check back soon for the next date”."}
													>
														<TextField
															id="event-starts"
															size="sm"
															type="date"
															bind:value={form.startsOn}
															disabled={editingOccurrence}
														/>
													</Field>
													<Field
														label="Ends on"
														for="event-ends"
														tooltip={form.repeatUnit === "none"
															? "Optional. Not used when nights are scheduled one by one."
															: "Last night of the series. Required once it has a start date."}
													>
														<TextField
															id="event-ends"
															size="sm"
															type="date"
															bind:value={form.endsOn}
															required={form.repeatUnit !== "none" && Boolean(form.startsOn)}
															disabled={editingOccurrence}
														/>
													</Field>
												</div>
											</div>
											{#if previewDates.length}
												<h2 class="section-title">
													<span class="section-label">
														Upcoming
														<Tip
															label="Upcoming"
															tooltip={form.repeatUnit === "none"
																? "Each night is its own date. A star marks a night with its own guest or collaboration."
																: "Nights from this series rule. Guest and times show when a night overrides the series defaults."}
														/>
													</span>
												</h2>
												<ul class="occurrences">
													{#each previewDates as date (date)}
														{@const occurrence = current?.dates.find((row) => row.date === date)}
														{@const special = form.nightIsSpecialEvent(occurrence)}
														{@const details = form.nightDetailLines(current, occurrence, date)}
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
																	{form.nightHeadline(current, occurrence, date)}
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
													{form.startsOn
														? form.repeatUnit === "none"
															? "No nights scheduled yet."
															: "No upcoming date for this rule."
														: "No start date yet. The website shows this series with “Check back soon for the next date” and a link to our Instagram."}
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
													role="group"
													aria-label="Drop images here to add them to the gallery"
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

			<DiscardDialog
				open={discardOpen}
				kind={discardKind}
				oncancel={cancelDiscard}
				onconfirm={confirmDiscard}
			/>

			<ScopeDialog
				open={saveScopeOpen}
				title="Which events should change?"
				message="Choose how widely to apply these edits. Past events will not be changed."
				onchoose={(scope) => saveOccurrenceWithScope(scope)}
				onclose={() => (saveScopeOpen = false)}
			/>

			<ReplaceNightDialog
				prompt={replacePrompt}
				eventName={form.name.trim() || "this event"}
				{replacing}
				onchoose={(replace) => void chooseConflict(replace)}
				onclose={() => (replacePrompt = null)}
			/>

			<ScopeDialog
				open={deleteScopeOpen}
				title="Which events should be deleted?"
				message="Choose how widely to delete. Past events will not be changed."
				alsoWebsite={onWebsite}
				disabled={busy}
				destructive
				allBusy={saving && intent === "delete"}
				onchoose={(scope) => void performDelete(scope)}
				onclose={cancelDelete}
			/>

			<DeleteEventDialog
				open={deleteOpen}
				eventName={form.name.trim() || "this event"}
				recurring={form.repeatUnit !== "none"}
				{onWebsite}
				{busy}
				deleting={saving && intent === "delete"}
				oncancel={cancelDelete}
				onconfirm={() => void performDelete("series")}
			/>

			<UpdateWebsiteDialog
				open={putOpen}
				{putting}
				error={putError}
				onclose={() => (putOpen = false)}
				onconfirm={() => void confirmPutOnWebsite()}
			/>
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

	.meta-line.muted {
		color: var(--muted-foreground);
	}

	.occurrence-link {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
	}

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

	.photo-hit.has-photo:hover,
	.photo-hit.has-photo:focus-within {
		opacity: 1;
		background: color-mix(in srgb, #0d0d0d 45%, transparent);
	}

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

	.web-address {
		display: flex;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	.web-address :global(input) {
		flex: 1;
		min-width: 0;
	}

	.web-address-base {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		white-space: nowrap;
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

	/* Empty: an ordinary-looking field with a quiet prompt; the name itself stays title-sized. */
	.title-input::placeholder {
		color: var(--subtle-foreground);
		font-family: var(--font);
		font-size: 1rem;
		font-weight: 400;
		letter-spacing: 0;
	}

	.name-line .title-input:placeholder-shown {
		min-width: min(100%, 20rem);
		border-color: var(--border);
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
		flex-shrink: 0;
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

	.status-flag.new {
		color: var(--foreground);
		background: var(--muted);
		box-shadow: inset 0 0 0 1px var(--border-strong);
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

	.guest-group {
		display: grid;
		gap: 0.8rem;
		min-width: 0;
	}

	.control-grid > :global(.span-all),
	.night-schedule {
		grid-column: 1 / -1;
	}

	.rule-fields {
		display: grid;
		gap: 1rem;
		padding-bottom: 0.4rem;
	}

	/* Repeat pattern on the first row, dates on the second; fields share one width so the rows line up. */
	.rule-row {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		gap: 0.85rem 1rem;
	}

	.rule-row > :global(.field) {
		flex: 0 1 13rem;
		min-width: min(100%, 11rem);
	}

	.rule-row > :global(.field.days) {
		flex: 0 1 auto;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.chip {
		min-width: 3.25rem;
		height: var(--control-h-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		border-radius: var(--radius-pill);
		padding: 0 0.8rem;
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.chip:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.chip.on {
		border-color: var(--primary);
		color: var(--primary);
		background: var(--primary-wash);
	}

	.occurrences {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
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

	.hint,
	.status,
	.error,
	.warnings {
		margin: 0;
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
