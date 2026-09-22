<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { fly } from "svelte/transition";
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
		Segmented,
		TextArea,
		TextField,
	} from "../../ui";
	import type { SegmentedItem } from "../../ui/types";
	import PhotoCell from "../menu/cells/PhotoCell.svelte";
	import MethodEditor from "../menu/MethodEditor.svelte";
	import {
		clearEventImage,
		createEvent,
		deleteEvent,
		deleteEventOccurrence,
		eventDriveFileUrl,
		getEventDrive,
		getEvents,
		publishAllEventsPreview,
		publishEvent,
		updateEvent,
		updateEventOccurrence,
		uploadEventDriveImage,
		uploadEventImage,
		type EventDriveFile,
		type OpsEvent,
	} from "../../lib/api";
	import {
		editorKey,
		eventItemPath,
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
		filterEventSchedule,
		formatScheduleDate,
		formatScheduleWeekday,
		groupEventSchedule,
	} from "../../lib/event-schedule";
	import { toast } from "../../lib/toast.svelte";
	import { easeOut, flyMs } from "../../lib/motion";
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

	const PHOTO_KEY = "ops.events.photo";

	function readPhotoOpen(): boolean {
		try {
			return localStorage.getItem(PHOTO_KEY) !== "closed";
		} catch {
			return true;
		}
	}

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
	let listEventIds = $state<string[]>([]);
	let listFrom = $state("");
	let listTo = $state("");
	let discardKind = $state<"close" | "reload">("close");
	let photoDragging = $state(false);
	let photoDragDepth = 0;
	let photoOpen = $state(readPhotoOpen());
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

	let name = $state("");
	let artist = $state("");
	let offer = $state("");
	let description = $state("");
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

	const route = $derived(parseShellPath(path));
	const editing = $derived(route.page === "events" && (route.isNew || Boolean(route.slug)));
	const occurrenceRoute = $derived.by(() => {
		const match = /^([^@]+)@(\d{4}-\d{2}-\d{2})$/.exec(String(route.slug || ""));
		return match ? { eventId: match[1], date: match[2] } : null;
	});
	const eventId = $derived(
		route.isNew ? "" : occurrenceRoute?.eventId || String(route.slug || ""),
	);
	const occurrenceDate = $derived(occurrenceRoute?.date || "");
	const editingOccurrence = $derived(Boolean(occurrenceDate));
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
		description?: string;
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
			description: String(row.description || "").trim(),
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
			time: String(row.time || "").trim(),
			startTime: row.startTime || "",
			endTime: row.endTime || "",
		});
	}

	const formDirty = $derived.by(() => {
		if (editingOccurrence && current) {
			const overrides = currentOccurrence?.overrides;
			return (
				occurrenceSnapshot({
					name,
					artist,
					offer,
					description,
					operationsNotes,
					imageLinks: imageLinksText.split(/\r?\n/),
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
					time: overrides?.time || current.time,
					startTime: overrides?.startTime || current.startTime,
					endTime: overrides?.endTime || current.endTime,
				})
			);
		}
		const draft = fieldSnapshot({
			name,
			artist,
			offer,
			description,
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
					description: "",
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
		return draft !== fieldSnapshot(current);
	});

	const previewDates = $derived(
		expandSeriesOccurrenceDates({
			startsOn,
			repeatEvery: Number(repeatEvery) || 1,
			repeatUnit,
			weekdays,
			monthDay: Number(monthDay) || undefined,
			endsOn,
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
			eventIds: listEventIds,
			from: listFrom,
			to: listTo,
		}),
	);
	const visibleSchedule = $derived(filteredSchedule);
	const filtersActive = $derived(
		listEventIds.length > 0 || Boolean(listFrom) || Boolean(listTo),
	);

	const photoUrl = $derived(current?.mainImage?.url || "");
	const canRemovePhoto = $derived(Boolean(current?.mainImage));
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
	const headerStatus = $derived(current ? statusLabel(current) : "Not saved");

	const tabs = $derived.by((): SegmentedItem[] => {
		const base = route.isNew
			? "/events/new"
			: route.slug
				? `/events/${encodeURIComponent(route.slug)}`
				: "/events/new";
		const hrefFor = (id: string) => eventTabPath(base, id);
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
		return "One night";
	}

	function statusLabel(event: OpsEvent): string {
		if (event.publish.live === "current") return "Live";
		if (event.publish.preview === "current") return "On preview";
		if (event.publish.preview === "stale") return "Preview out of date";
		return "Not published";
	}

	function statusTone(event: OpsEvent | null): string {
		if (!event) return "muted";
		if (event.publish.live === "current") return "live";
		if (event.publish.preview === "current") return "preview";
		return "muted";
	}

	function formatDate(iso: string): string {
		if (!iso) return "";
		const [year, month, day] = iso.split("-").map(Number);
		if (!year || !month || !day) return iso;
		return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	}

	function fill(event: OpsEvent) {
		current = event;
		const occurrence = occurrenceDate
			? event.dates.find((row) => row.date === occurrenceDate)
			: null;
		name = occurrence?.overrides.name || event.name;
		artist = occurrence?.overrides.artist || event.artist || "";
		offer = occurrence?.overrides.offer || event.offer || "";
		description = occurrence?.overrides.description || event.description || "";
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
	}

	function blank() {
		current = null;
		name = "";
		artist = "";
		offer = "";
		description = "";
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
		warnings = [];
	}

	function rememberEvent(event: OpsEvent, replaceFields: boolean) {
		events = events.some((row) => row.id === event.id)
			? events.map((row) => (row.id === event.id ? event : row))
			: [...events, event];
		if (replaceFields) fill(event);
		else current = event;
	}

	function body() {
		return {
			name: name.trim(),
			artist: artist.trim(),
			offer: offer.trim(),
			description: description.trim(),
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
		};
	}

	function occurrenceBody(scope: "this" | "following" | "all") {
		return {
			scope,
			name: name.trim(),
			artist: artist.trim(),
			offer: offer.trim(),
			description: description.trim(),
			operationsNotes: operationsNotes.trim(),
			imageLinks: imageLinksText
				.split(/\r?\n/)
				.map((link) => link.trim())
				.filter(Boolean),
			time: startTime && endTime ? "" : time.trim(),
			startTime,
			endTime,
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
		listEventIds = [];
		listFrom = "";
		listTo = "";
	}

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

	function requestClose() {
		if (busy) return;
		if (formDirty) {
			discardKind = "close";
			discardOpen = true;
			return;
		}
		leaveEditor("/events");
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
		leaveEditor("/events", { force: true });
	}

	function requestDelete() {
		if (!eventId || busy) return;
		if (editingOccurrence && repeatUnit !== "none") {
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
				leaveEditor("/events", { force: true });
			} else {
				const data = await deleteEventOccurrence(eventId, occurrenceDate, scope);
				warnings = data.warnings || [];
				if (data.deleted || !data.event) {
					events = events.filter((row) => row.id !== eventId);
					toast.ok(
						scope === "this" ? "Night deleted." : "Events deleted.",
					);
					beginLeave();
					leaveEditor("/events", { force: true });
				} else {
					rememberEvent(data.event, true);
					const count = Number(data.removed) || 1;
					toast.ok(count === 1 ? "Night deleted." : `${count} nights deleted.`);
					beginLeave();
					leaveEditor("/events", { force: true });
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
		if (!name.trim() || !startsOn) {
			const message = !name.trim() ? "Add a name." : "Add a start date.";
			error = message;
			toast.error(message);
			const target = route.isNew
				? eventNewPath("details")
				: eventItemPath(route.slug || eventId, "details");
			if (path !== target) navigate(target);
			return;
		}
		if (!editingOccurrence && repeatUnit !== "none" && !endsOn) {
			error = "Add an end date for the recurring event.";
			toast.error(error);
			return;
		}
		if (editingOccurrence) {
			if (repeatUnit === "none") await saveOccurrenceWithScope("this");
			else saveScopeOpen = true;
			return;
		}
		saving = true;
		intent = "save";
		error = "";
		try {
			if (!eventId) {
				const data = await createEvent(body());
				rememberEvent(data.event, true);
				toast.ok("Event saved.");
				navigate(eventItemPath(data.event.id, tab), { replace: true });
			} else {
				const data = await updateEvent(eventId, body());
				rememberEvent(data.event, true);
				toast.ok("Event saved.");
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
			const count = "updated" in data ? Number(data.updated) || 1 : 1;
			toast.ok(count === 1 ? "Event saved." : `${count} events saved.`);
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
			toast.ok(target === "staging" ? "Preview updated." : "Pushed live.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Publish failed.";
			error = message;
			toast.error(message);
		} finally {
			publishing = "";
		}
	}

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

	function setPhotoOpen(next: boolean) {
		photoOpen = next;
		try {
			localStorage.setItem(PHOTO_KEY, next ? "open" : "closed");
		} catch {
			/* ignore quota / private mode */
		}
	}

	async function onImage(role: "main" | "gallery", file: File | null) {
		if (!file || !eventId) return;
		saving = true;
		intent = "image";
		try {
			// Hero / main photo is always the series image (every night).
			// Per-night guest flyers are not edited from this panel.
			const data = await uploadEventImage(eventId, file, role);
			rememberEvent(data.event, false);
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
			const data = await clearEventImage(eventId, role, imageName);
			rememberEvent(data.event, false);
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
	{#if missing}
		<div class="missing">
			<EditorBackBar label="Events" onback={() => leaveEditor("/events")} />
			<p>{error}</p>
			<Button type="button" variant="outline" onclick={() => leaveEditor("/events")}>
				Back to events
			</Button>
		</div>
	{:else if editing}
		<form
			class="editor"
			aria-busy={busy || undefined}
			onsubmit={onSave}
		>
			<EditorBackBar label="Events" dirty={formDirty} onback={requestClose} />
			<div class="split" class:photo-collapsed={!photoOpen}>
				<aside
					class="hero"
					class:dragging={photoDragging}
					aria-hidden={!photoOpen}
					inert={!photoOpen}
					ondragenter={onPhotoDragEnter}
					ondragover={onPhotoDragOver}
					ondragleave={onPhotoDragLeave}
					ondrop={onPhotoDrop}
				>
					<button
						class="photo-collapse"
						type="button"
						title="Hide photo"
						aria-label="Hide photo"
						tabindex={photoOpen ? 0 : -1}
						onclick={() => setPhotoOpen(false)}
					>
						<Icon name="chevron-right" size={16} />
					</button>
					{#if photoUrl}
						<img class="hero-img" src={photoUrl} alt={name || ""} />
						<div class="photo-hit has-photo">
							<label class="photo-btn">
								<Icon name="upload" size={16} />
								Replace photo
								<input
									class="sr-only"
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									onchange={onPhotoInput}
								/>
							</label>
							{#if canRemovePhoto}
								<button
									class="photo-btn remove"
									type="button"
									disabled={busy}
									onclick={() => onClearImage("main")}
								>
									<Icon name="trash" size={16} />
									Remove photo
								</button>
							{/if}
						</div>
					{:else}
						<label class="photo-hit empty">
							<span class="photo-btn primary">
								<Icon name="upload" size={16} />
								Add photo
							</span>
							<span class="photo-hint">
								{eventId ? "or drop an image here" : "Save the event first"}
							</span>
							{#if eventId}
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									onchange={onPhotoInput}
								/>
							{/if}
						</label>
					{/if}
					{#if photoDragging}
						<div class="photo-drop" aria-hidden="true">
							<span>Drop to {photoUrl ? "replace" : "add"}</span>
						</div>
					{/if}
				</aside>

				<div class="panel" class:dirty={formDirty}>
					<header class="panel-head">
						<div class="thumb">
							<label class="thumb-hit" aria-label={photoUrl ? "Replace photo" : "Add photo"}>
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
						<div class="type-line">
							<p class="eyebrow">{typeLine}</p>
							{#if formDirty}
								<span class="dirty-dot" title="Unsaved" aria-live="polite">
									<span class="sr-only">Unsaved</span>
								</span>
							{/if}
						</div>
						<div class="head-tools">
							<div class="toolbar-actions">
								{#if !photoOpen}
									<Button
										class="photo-expand"
										variant="ghost"
										size="sm"
										type="button"
										title="Show photo"
										aria-label="Show photo"
										onclick={() => setPhotoOpen(true)}
									>
										{#snippet icon()}
											<Icon name="chevron-right" />
										{/snippet}
									</Button>
								{/if}
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
								required
								autocomplete="off"
								aria-label="Event name"
								placeholder="Event name"
								bind:value={name}
							/>
							{#if artist.trim()}
								<p class="sub">{artist.trim()}</p>
							{/if}
						</div>
						<div class="title-meta">
							<p class="date-readout" class:muted={headerDate === "No date"}>{headerDate}</p>
							<p class="meta-line">{headerStatus}</p>
						</div>
						{#if editingOccurrence}
							<p class="occurrence-note">
								This night only. Open Schedule to change the series. The photo is shared by
								every night.
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
										<section class="block">
											<div class="grid">
												<Field label="Artist" for="event-artist">
													<TextField id="event-artist" size="sm" bind:value={artist} />
												</Field>
												<Field
													label="Offer"
													hint="Optional public wording, e.g. £10 Negroni"
													for="event-offer"
												>
													<TextField id="event-offer" size="sm" bind:value={offer} />
												</Field>
												<Field label={editingOccurrence ? "Date" : "Starts on"} for="event-date">
													<TextField
														id="event-date"
														size="sm"
														type="date"
														bind:value={startsOn}
														required
														disabled={editingOccurrence}
													/>
												</Field>
												<Field label="Start" for="event-start-time">
													<TextField
														id="event-start-time"
														size="sm"
														type="time"
														bind:value={startTime}
													/>
												</Field>
												<Field
													label="End"
													hint="Shown under the day. Extra sets go in the description."
													for="event-end-time"
												>
													<TextField
														id="event-end-time"
														size="sm"
														type="time"
														bind:value={endTime}
													/>
												</Field>
												<div class="full">
													<Field label="Description" for="event-description">
														<MethodEditor
															id="event-description"
															value={description}
															label="Event description"
															placeholder="Set the scene…"
															onChange={(next) => (description = next)}
														/>
													</Field>
												</div>
												<div class="full">
													<Field
														label="Operations notes"
														hint="Internal only. Never published to the website."
														for="event-operations-notes"
													>
														<TextArea
															id="event-operations-notes"
															bind:value={operationsNotes}
															rows={5}
															placeholder="Contacts, fee, setup, access, equipment…"
														/>
													</Field>
												</div>
											</div>
										</section>
									{:else if tab === "schedule"}
										<section class="block">
											<p class="lede">One rule. Daily, weekly on chosen days, or monthly.</p>
											<div class="grid">
												<Field label="Unit" for="event-unit">
													<NativeSelect
														id="event-unit"
														size="sm"
														bind:value={repeatUnit}
														options={[
															{ value: "none", label: "Does not repeat" },
															{ value: "day", label: "Day" },
															{ value: "week", label: "Week" },
															{ value: "month", label: "Month" },
														]}
													/>
												</Field>
												{#if repeatUnit !== "none"}
													<Field label="Every" for="event-every">
														<TextField
															id="event-every"
															size="sm"
															type="number"
															min="1"
															max="52"
															bind:value={repeatEvery}
														/>
													</Field>
												{/if}
												{#if repeatUnit === "week"}
													<fieldset class="days full">
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
													<Field label="Day of month" for="event-month-day">
														<TextField
															id="event-month-day"
															size="sm"
															type="number"
															min="1"
															max="31"
															bind:value={monthDay}
															placeholder="From the start date"
														/>
													</Field>
												{/if}
												<Field
													label="Ends on"
													for="event-ends"
													hint={repeatUnit === "none"
														? "Optional for a one-night event."
														: "Required. One editable event is created for every date."}
												>
													<TextField
														id="event-ends"
														size="sm"
														type="date"
														bind:value={endsOn}
														required={repeatUnit !== "none"}
													/>
												</Field>
											</div>
											{#if previewDates.length}
												<h2 class="section-title">Upcoming</h2>
												<ul class="occurrences">
													{#each previewDates as date (date)}
														{@const occurrence = current?.dates.find((row) => row.date === date)}
														<li class:special={occurrence?.isSpecialEdition}>
															<div>
																<strong>{formatDate(date)}</strong>
																{#if occurrence?.overrides.artist}
																	<span>{occurrence.overrides.artist}</span>
																{:else}
																	<span>{artist || "No artist"}</span>
																{/if}
															</div>
															{#if eventId}
																<a
																	class="occurrence-link"
																	href={eventItemPath(`${eventId}@${date}`)}
																>
																	Edit event
																</a>
															{/if}
														</li>
													{/each}
												</ul>
											{:else}
												<p class="hint">No upcoming date for this rule.</p>
											{/if}
										</section>
									{:else if tab === "gallery"}
										<section class="block">
											<p class="lede">
												Event photo library in Google Drive. The website hero is set from
												the photo beside the name.
											</p>
											{#if !eventId}
												<p class="hint">Save the event before opening the library.</p>
											{:else}
												{#if driveFolderUrl}
													<p class="hint">
														<a href={driveFolderUrl} target="_blank" rel="noreferrer"
															>Open Drive folder</a
														>
													</p>
												{/if}
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
														<p class="hint">Loading Drive images…</p>
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
															<span>Drop images to upload</span>
														</div>
													{/if}
												</div>
												<p class="hint">Drag and drop images here, or choose files.</p>
											{/if}
										</section>
									{:else if tab === "publish"}
										<section class="block">
											<p class="lede">Preview first. Push live copies only these nights.</p>
											{#if !eventId}
												<p class="hint">Save the event before publishing.</p>
											{:else}
												<p class="status">
													Preview: {current?.publish.preview === "current"
														? "Up to date"
														: current?.publish.preview === "stale"
															? "Out of date"
															: "Not published"}.
													Live: {current?.publish.live === "current" ? "Up to date" : "Not live"}.
												</p>
												<div class="publish-actions">
													<Button
														type="button"
														variant="outline"
														size="sm"
														busy={publishing === "staging"}
														disabled={Boolean(publishing) || formDirty}
														onclick={() => onPublish("staging")}
													>
														Update preview
													</Button>
													<Button
														type="button"
														size="sm"
														busy={publishing === "production"}
														disabled={Boolean(publishing) || formDirty || current?.publish.preview !== "current"}
														onclick={() => onPublish("production")}
													>
														Push live
													</Button>
												</div>
												<p class="hint">
													{#if formDirty}Save before publishing. {/if}
													<a href="https://gwenda-staging.pages.dev/events" target="_blank" rel="noreferrer">Preview site</a>
													·
													<a href="https://gwenda.co.uk/events" target="_blank" rel="noreferrer">Live site</a>
												</p>
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
	{:else}
		<div class="list-page scrollbar-fade">
			<PageHeader title="Events" subtitle="Upcoming nights, week by week.">
				{#snippet actions()}
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
					<Button type="button" disabled={busy} onclick={() => navigate("/events/new")}>
						{#snippet icon()}
							<Icon name="plus" size={16} />
						{/snippet}
						New event
					</Button>
				{/snippet}
			</PageHeader>
			{#if error}<p class="error">{error}</p>{/if}
			{#if !error && !loading}
				<div class="list-filters">
					<div class="filter-events">
						<label class="filter-label" for="event-filter">Events</label>
						<MultiSelect
							id="event-filter"
							size="sm"
							bind:value={listEventIds}
							options={eventFilterOptions}
							placeholder="All events"
						/>
					</div>
					<div class="filter-dates">
						<label class="filter-label" for="event-from">From</label>
						<TextField id="event-from" size="sm" type="date" bind:value={listFrom} />
					</div>
					<div class="filter-dates">
						<label class="filter-label" for="event-to">To</label>
						<TextField id="event-to" size="sm" type="date" bind:value={listTo} />
					</div>
					<button
						type="button"
						class="filter-clear"
						disabled={!filtersActive}
						onclick={clearListFilters}
					>
						Clear
					</button>
				</div>
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
									</a>
								{/each}
							</div>
						</section>
					{:else}
						<p class="empty">
							{filtersActive ? "No events match these filters." : "No upcoming events."}
						</p>
					{/each}
				</div>
			{/if}
		</div>
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
	}

	.events-root.editing {
		overflow: hidden;
	}

	.list-page {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--page-gutter);
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.list-filters {
		display: grid;
		grid-template-columns: 16rem 9.5rem 9.5rem auto;
		gap: 0.75rem;
		align-items: end;
		justify-content: start;
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
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.week + .week {
		margin-top: 1.5rem;
	}

	.week-heading {
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
		display: flex;
		flex-direction: column;
	}

	.item {
		display: grid;
		grid-template-columns: 5.5rem auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		min-height: 3.35rem;
		padding: 0.55rem 0.15rem;
		border-bottom: 1px solid var(--border);
		color: inherit;
		text-decoration: none;
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
		color: var(--foreground);
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1.2;
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

	.missing {
		display: grid;
		gap: 0.8rem;
		align-content: start;
		padding: var(--page-gutter);
	}

	.editor {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 34%);
		grid-template-areas: "panel hero";
		column-gap: var(--gap);
		row-gap: var(--gap);
		flex: 1;
		min-height: 0;
		height: 100%;
		padding: var(--gap) var(--page-gutter) var(--gap);
		transition:
			grid-template-columns var(--t-slow) var(--ease),
			column-gap var(--t-slow) var(--ease);
	}

	.hero {
		grid-area: hero;
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--sunken);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
		opacity: 1;
		transition:
			opacity var(--t) var(--ease),
			border-color var(--t-slow) var(--ease),
			box-shadow var(--t-slow) var(--ease);
	}

	.photo-collapse {
		position: absolute;
		top: 0.55rem;
		left: 0.55rem;
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

	.split.photo-collapsed {
		grid-template-columns: minmax(0, 1fr) 0%;
		column-gap: 0;
	}

	.split.photo-collapsed .hero {
		opacity: 0;
		border-color: transparent;
		box-shadow: none;
		pointer-events: none;
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

	.thumb {
		display: none;
	}

	.split.photo-collapsed .thumb {
		display: block;
		position: relative;
		grid-column: 1;
		grid-row: 1 / span 2;
		width: 3.75rem;
		height: 3.75rem;
		align-self: start;
		margin-top: 0.15rem;
	}

	.split.photo-collapsed .panel-head {
		grid-template-columns: 3.75rem minmax(0, 1fr) auto;
		column-gap: 0.7rem;
	}

	.split.photo-collapsed .type-line {
		grid-column: 2;
		grid-row: 1;
	}

	.split.photo-collapsed .head-tools {
		grid-column: 3;
		grid-row: 1;
	}

	.split.photo-collapsed .title-name {
		grid-column: 2;
		grid-row: 2;
	}

	.split.photo-collapsed .title-meta {
		grid-column: 3;
		grid-row: 2;
		align-items: flex-end;
		padding-top: 0.12rem;
	}

	.split.photo-collapsed .occurrence-note {
		grid-column: 1 / -1;
		grid-row: 3;
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

	.meta-line {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.04em;
		line-height: 1.2;
		color: var(--muted-foreground);
		white-space: nowrap;
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

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem 0.85rem;
		align-items: start;
	}

	.full {
		grid-column: 1 / -1;
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
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.occurrences li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}

	.occurrences li.special {
		border-color: var(--primary);
		background: var(--primary-wash);
	}

	.occurrences li > div {
		display: grid;
		gap: 0.15rem;
	}

	.occurrences strong {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.occurrences span {
		color: var(--muted-foreground);
		font-size: var(--text-xs);
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

	@media (max-width: 1100px) {
		.split {
			grid-template-columns: minmax(0, 1fr) minmax(0, 30%);
		}

		.split.photo-collapsed {
			grid-template-columns: minmax(0, 1fr) 0%;
		}
	}

	@media (max-width: 900px) {
		.split,
		.split.photo-collapsed {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr);
			flex: 1;
			min-height: 0;
			padding: 0;
			column-gap: 0;
			row-gap: 0;
			transition: none;
		}

		.hero {
			display: none;
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

		.thumb {
			display: block;
			position: relative;
			grid-column: 1;
			grid-row: 1 / span 2;
			width: 3.75rem;
			height: 3.75rem;
			align-self: start;
			margin-top: 0.15rem;
		}

		.panel-head {
			grid-template-columns: 3.75rem minmax(0, 1fr) auto;
			column-gap: 0.7rem;
		}

		.type-line {
			grid-column: 2;
			grid-row: 1;
		}

		.head-tools {
			grid-column: 3;
			grid-row: 1;
		}

		.title-name {
			grid-column: 2 / -1;
			grid-row: 2;
		}

		.title-meta {
			grid-column: 1 / -1;
			grid-row: 3;
			align-items: flex-start;
			padding-top: 0.35rem;
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

		.item {
			grid-template-columns: 4.75rem auto minmax(0, 1fr);
		}

		.badge {
			display: none;
		}
	}

	@media (max-width: 880px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 600px) {
		.title-input,
		.date-readout {
			font-size: 1.35rem;
		}
	}
</style>
