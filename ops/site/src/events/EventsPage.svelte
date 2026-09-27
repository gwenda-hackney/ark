<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		BusyOverlay,
		Button,
		Dialog,
		EditorBackBar,
		MultiSelect,
		PageHeader,
		SearchField,
		Segmented,
	} from "../ui";
	import type { SegmentedItem } from "../ui/types";
	import {
		onWebsiteJobEvent,
		queueWebsiteJob,
		retryWebsiteJob,
		websiteJobFor,
		websiteJobSettled,
	} from "./website-jobs.svelte";
	import { preparePhoto } from "../ui/photo-prep";
	import EditorHeader from "./EditorHeader.svelte";
	import EventsList from "./EventsList.svelte";
	import DetailsTab from "./tabs/DetailsTab.svelte";
	import GalleryTab from "./tabs/GalleryTab.svelte";
	import ScheduleTab from "./tabs/ScheduleTab.svelte";
	import DeleteEventDialog from "./dialogs/DeleteEventDialog.svelte";
	import DiscardDialog from "./dialogs/DiscardDialog.svelte";
	import ReplaceNightDialog from "./dialogs/ReplaceNightDialog.svelte";
	import ScopeDialog from "./dialogs/ScopeDialog.svelte";
	import UpdateWebsiteDialog from "./dialogs/UpdateWebsiteDialog.svelte";
	import { formatDate } from "./event-labels";
	import {
	} from "./hero-crops";
	import {
		clearEventImage,
		clearEventOccurrenceImage,
		createEvent,
		deleteEvent,
		deleteEventOccurrence,
		ensureEventOccurrence,
		getApprovedArtists,
		getEvents,
		getMe,
		putEventOnWebsite,
		syncEventCalendar,
		updateEvent,
		updateEventOccurrence,
		uploadEventImage,
		uploadEventOccurrenceImage,
		type ApprovedArtist,
		type OpsEvent,
	} from "../app/api";
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
	import { EventGallery } from "./event-gallery.svelte";
	import { EventForm } from "./event-form.svelte";

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
	const gallery = new EventGallery();
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

	/** Series to pick when the next new-event form opens ("Add night" on a series). */
	let presetSeriesId = "";

	let listOrigin = $state<"series" | "schedule">("series");
	const route = $derived(parseShellPath(path));
	const editing = $derived(route.page === "events" && (route.isNew || Boolean(route.slug)));
	const routeList = $derived(
		(route as { list?: string }).list === "schedule" ? "schedule" : (route as { list?: string }).list === "series" ? "series" : null,
	);
	const creatingNight = $derived(Boolean(route.isNew && attachSeriesId));
	/** "New event" (Schedule): a night for a series, or a special event without one. */
	const newEventRoute = $derived(
		Boolean(route.isNew) && (route as { kind?: string }).kind === "once",
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
		loading || saving || gallery.uploading || calendarSyncing,
	);
	const busyLabel = $derived(
		calendarSyncing
			? "Updating calendar…"
			: loading
				? "Loading…"
				: gallery.uploading
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
	const parentSeriesName = $derived(
		editingOccurrence
			? String(current?.name || "").trim()
			: creatingNight
				? events.find((event) => event.id === attachSeriesId)?.name || ""
				: "",
	);
	const websiteJob = $derived(websiteJobFor(current?.id));

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
		const id = eventId;
		void gallery.load(id).then((folder) => {
			if (!folder || current?.id !== id) return;
			current = {
				...current,
				driveFolderId: folder.id,
				driveFolderUrl: folder.url || current.driveFolderUrl,
			};
		});
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
					<EditorHeader
						{form}
						{current}
						{eventId}
						{occurrenceDate}
						{busy}
						dirty={formDirty}
						isNew={Boolean(route.isNew)}
						{creatingNight}
						{creatingOnce}
						{editingOnce}
						{parentSeriesName}
						{calendarSyncing}
						{localOps}
						onusedefaults={() => void useSeriesDefaults()}
						onaddnight={addNightToSeries}
						onsynccalendar={() => void onSyncCalendar()}
						onputonwebsite={openPutOnWebsite}
						onreload={requestReload}
						onclose={requestClose}
					/>

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
										<DetailsTab
											{form}
											{current}
											{eventId}
											{busy}
											isNew={Boolean(route.isNew)}
											{newEventRoute}
											{creatingNight}
											{creatingOnce}
											{editingOnce}
											{editingOccurrence}
											bind:attachSeriesId
											{seriesOptions}
											{approvedArtists}
											{webAddressChanged}
											{framingUrl}
											onpickphoto={acceptPhotoFile}
											onclearphoto={() => (pendingPhoto ? clearPendingPhoto() : void onClearImage("main"))}
										/>
									{:else if tab === "schedule"}
										<ScheduleTab {form} {current} {eventId} {editingOccurrence} {previewDates} />
									{:else if tab === "gallery"}
										<GalleryTab {gallery} {eventId} {busy} />
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

</style>
