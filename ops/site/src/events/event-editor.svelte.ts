import {
	queueWebsiteJob,
	retryWebsiteJob,
	websiteJobFor,
	websiteJobSettled,
} from "./website-jobs.svelte";
import { preparePhoto } from "../ui/photo-prep";
import {
	clearEventImage,
	clearEventOccurrenceImage,
	createEvent,
	deleteEvent,
	deleteEventOccurrence,
	ensureEventOccurrence,
	getEvents,
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
	eventItemPath,
	eventListPath,
	eventNewPath,
	leaveEditor,
	loginNext,
	navigate,
	normalizeEventTab,
	parseShellPath,
} from "../app/nav";
import { toast } from "../ui/toast.svelte";
import { refreshSitePending } from "../website/site-pending.svelte";
import { beginLeave } from "../ui/unsaved.svelte";
import { EventGallery } from "./event-gallery.svelte";
import { EventForm } from "./event-form.svelte";

/**
 * The event editor's state and actions: the events list, the event being
 * edited (a series, a special event or one night), saving, deleting, photos,
 * the calendar and Update website. EventsPage renders it; the route comes
 * from `getPath`.
 */
export class EventEditor {
	constructor(private readonly getPath: () => string) {}

	events = $state<OpsEvent[]>([]);
	loading = $state(true);
	saving = $state(false);
	intent = $state<"" | "save" | "delete" | "image">("");
	calendarSyncing = $state(false);

	/** Local ops stages drafts for the local site and never releases. */
	localOps = $state(false);

	error = $state("");
	warnings = $state<string[]>([]);
	deleteOpen = $state(false);
	deleteScopeOpen = $state(false);
	saveScopeOpen = $state(false);
	gallery = new EventGallery();

	/** Photo picked on a new event: shown now, uploaded right after the first save. */
	pendingPhoto = $state<File | null>(null);

	pendingPhotoUrl = $state("");
	form = new EventForm();

	replacePrompt = $state<{
		id: string;
		name: string;
		slug: string;
		date: string;
		skippedDates: string[];
	} | null>(null);

	skipReplaceAsk = false;
	replacing = $state(false);
	current = $state<OpsEvent | null>(null);
	attachSeriesId = $state("");

	/** Approved play applicants, suggested in Guest/collaboration. */
	approvedArtists = $state<ApprovedArtist[]>([]);

	/** Series to pick when the next new-event form opens ("Add night" on a series). */
	presetSeriesId = "";

	/** "Update website": confirm, then publish just this event. */
	putOpen = $state(false);

	putError = $state("");
	putting = $state(false);
	retrying = $state(false);

	route = $derived.by(() => parseShellPath(this.getPath()));
	editing = $derived(this.route.page === "events" && (this.route.isNew || Boolean(this.route.slug)));
	creatingNight = $derived(Boolean(this.route.isNew && this.attachSeriesId));

	/** "New event" (Schedule): a night for a series, or a special event without one. */
	newEventRoute = $derived(
		Boolean(this.route.isNew) && (this.route as { kind?: string }).kind === "once",
	);

	creatingOnce = $derived(this.newEventRoute && !this.attachSeriesId);

	seriesOptions = $derived(
		this.events
			.filter((event) => event.repeatUnit !== "once")
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((event) => ({ value: event.id, label: event.name })),
	);

	occurrenceRoute = $derived.by(() => {
		const match = /^([^@]+)@(\d{4}-\d{2}-\d{2})$/.exec(String(this.route.slug || ""));
		return match ? { eventId: match[1], date: match[2] } : null;
	});

	eventId = $derived(
		this.route.isNew ? "" : this.occurrenceRoute?.eventId || String(this.route.slug || ""),
	);

	occurrenceDate = $derived(this.occurrenceRoute?.date || "");
	editingOccurrence = $derived(Boolean(this.occurrenceDate));

	editingOnce = $derived(
		!this.route.isNew &&
			!this.editingOccurrence &&
			String(this.current?.repeatUnit || this.form.repeatUnit || "").toLowerCase() === "once",
	);

	currentOccurrence = $derived(
		this.current?.dates.find((occurrence) => occurrence.date === this.occurrenceDate) || null,
	);

	tab = $derived(normalizeEventTab(this.route.tab));

	busy = $derived(
		this.loading || this.saving || this.gallery.uploading || this.calendarSyncing,
	);

	busyLabel = $derived(
		this.calendarSyncing
			? "Updating calendar…"
			: this.loading
				? "Loading…"
				: this.gallery.uploading
					? "Uploading…"
					: this.intent === "delete"
						? "Deleting…"
						: this.intent === "image"
							? "Updating photo…"
							: "Saving…",
	);

	missing = $derived(
		this.editing && !this.route.isNew && !this.loading && !this.current && Boolean(this.error),
	);

	formDirty = $derived(
		this.form.isDirty(this.current, { occurrenceDate: this.occurrenceDate, creatingOnce: this.creatingOnce }) ||
			(this.editingOccurrence && Boolean(this.current) && this.attachSeriesId !== this.eventId),
	);

	webAddressChanged = $derived(this.form.webAddressChanged(this.current));
	previewDates = $derived(this.form.upcomingDates(this.current));

	/** Photo owned by this editor (series main, or night override). */
	framingUrl = $derived(
		this.pendingPhotoUrl ||
			(this.editingOccurrence
				? this.currentOccurrence?.overrides?.image?.url || ""
				: this.current?.mainImage?.url || ""),
	);

	/** Open series (Gwenda Nights): one night at a time, no future-events scope. */
	isOpenSeries = $derived(
		String(this.current?.repeatUnit || this.form.repeatUnit || "none").toLowerCase() === "none",
	);

	editingNight = $derived(this.editingOccurrence || this.creatingNight);

	parentSeriesName = $derived(
		this.editingOccurrence
			? String(this.current?.name || "").trim()
			: this.creatingNight
				? this.events.find((event) => event.id === this.attachSeriesId)?.name || ""
				: "",
	);

	websiteJob = $derived(websiteJobFor(this.current?.id));

	/** On gwenda.co.uk: deleting waits for Update website, and the dialog says so. */
	onWebsite = $derived(
		Boolean(this.current?.publish) && this.current?.publish.live !== "unpublished",
	);

	applyWarnings = (list?: string[]) => {
		this.warnings = (list || []).filter(Boolean);
		if (this.warnings.length) toast.info(this.warnings[0]);
	};

	/**
	 * After a save: the save is done. The calendar and the website copy follow
	 * in the background (lib/website-jobs), so the editor can carry on.
	 */
	stageAfterSave = (id: string, saved: string) => {
		if (saved) toast.ok(saved);
		queueWebsiteJob(id);
	};

	/** An event came back ready from the background work: show its new state. */
	takeReadyEvent = (event: OpsEvent) => {
		if (String(event.id) === String(this.eventId) && this.current) {
			// Mid-edit: only the status changes, never the fields being typed.
			if (this.formDirty) {
				this.current = { ...this.current, publish: event.publish };
				this.events = this.events.map((row) => (row.id === event.id ? { ...row, publish: event.publish } : row));
			} else this.rememberEvent(event, false);
		} else if (this.events.some((row) => row.id === event.id)) {
			this.events = this.events.map((row) => (row.id === event.id ? event : row));
		}
	};

	fill = (event: OpsEvent) => {
		this.current = event;
		this.form.fill(event, this.occurrenceDate);
		this.attachSeriesId = event.id;
	};

	blank = () => {
		this.current = null;
		this.clearPendingPhoto();
		this.form.reset(this.newEventRoute ? "once" : "none");
		this.attachSeriesId = this.presetSeriesId;
		this.presetSeriesId = "";
		this.warnings = [];
	};

	/** "Add night" on a series: the New event form with this series picked. */
	addNightToSeries = () => {
		this.presetSeriesId = this.eventId;
		navigate("/events/new/once");
	};

	rememberEvent = (event: OpsEvent, replaceFields: boolean) => {
		this.events = this.events.some((row) => row.id === event.id)
			? this.events.map((row) => (row.id === event.id ? event : row))
			: [...this.events, event];
		if (replaceFields) this.fill(event);
		else {
			this.current = event;
			this.form.syncHeroCrops(event, this.occurrenceDate);
		}
	};

	useSeriesDefaults = async () => {
		if (this.currentOccurrence?.overrides?.image?.url) {
			await this.onClearImage("main");
			if (this.currentOccurrence?.overrides?.image?.url) return;
		}
		this.form.useSeriesDefaults(this.current);
	};

	reload = async () => {
		this.loading = true;
		this.error = "";
		try {
			const data = await getEvents();
			this.events = data.events || [];
			if (this.eventId) {
				const found = this.events.find((event) => event.id === this.eventId);
				if (found) this.fill(found);
				else this.error = "Event not found.";
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not load events.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/events"))}`;
				return;
			}
			this.error = message;
		} finally {
			this.loading = false;
		}
	};

	listHomePath = () => {
		return this.editingOccurrence || this.creatingOnce || this.editingOnce
			? eventListPath("schedule")
			: eventListPath("series");
	};

	requestDelete = () => {
		if (!this.eventId || this.busy) return;
		if (this.editingOccurrence && !this.isOpenSeries) {
			this.deleteScopeOpen = true;
			return;
		}
		this.deleteOpen = true;
	};

	cancelDelete = () => {
		if (this.busy) return;
		this.deleteOpen = false;
		this.deleteScopeOpen = false;
	};

	performDelete = async (scope: "this" | "following" | "all" | "series" = "series") => {
		if (!this.eventId || this.busy) return;
		// A night of an open series gets the plain confirm, not the scope
		// dialog: its Delete removes that night, never the whole series (#151).
		if (scope === "series" && this.editingOccurrence && this.isOpenSeries) scope = "this";
		this.deleteOpen = false;
		this.deleteScopeOpen = false;
		this.saving = true;
		this.intent = "delete";
		try {
			if (scope === "series" || !this.editingOccurrence || !this.occurrenceDate) {
				const data = await deleteEvent(this.eventId);
				this.events = this.events.filter((row) => row.id !== this.eventId);
				toast.ok(
					data.pending
						? "Event deleted. It comes off the website when you press Update website on the Website page."
						: "Event deleted.",
				);
				void refreshSitePending();
				this.applyWarnings(data.warnings);
				beginLeave();
				leaveEditor(this.listHomePath(), { force: true });
			} else {
				const data = await deleteEventOccurrence(this.eventId, this.occurrenceDate, scope);
				this.applyWarnings(data.warnings);
				void refreshSitePending();
				if (data.deleted || !data.event) {
					this.events = this.events.filter((row) => row.id !== this.eventId);
					toast.ok(
						data.pending
							? "Event deleted. It comes off the website when you press Update website on the Website page."
							: scope === "this"
								? "Night deleted."
								: "Events deleted.",
					);
					beginLeave();
					leaveEditor(this.listHomePath(), { force: true });
				} else {
					this.rememberEvent(data.event, true);
					// The background job takes the nights off the preview and the calendar.
					queueWebsiteJob(this.eventId);
					const count = Number(data.removed) || 1;
					toast.ok(count === 1 ? "Night deleted." : `${count} nights deleted.`);
					beginLeave();
					leaveEditor(this.listHomePath(), { force: true });
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not delete the event.";
			this.error = message;
			toast.error(message);
		} finally {
			this.saving = false;
			this.intent = "";
		}
	};

	chooseConflict = async (replace: boolean) => {
		const target = this.replacePrompt;
		if (!target || this.replacing) return;
		const previous = this.form.replacesSeries;
		this.replacePrompt = null;
		this.replacing = true;
		try {
			if (replace) {
				this.form.replacesSeries = target.slug;
				const skipped = [
					...new Set([...(target.skippedDates || []), target.date]),
				];
				const data = await updateEvent(target.id, { skippedDates: skipped });
				this.events = this.events.map((row) =>
					row.id === data.event.id ? data.event : row,
				);
			} else {
				this.form.replacesSeries = `keep:${target.slug}`;
			}
			this.skipReplaceAsk = true;
			await this.onSave(new Event("submit"));
		} catch (err) {
			this.form.replacesSeries = previous;
			const message =
				err instanceof Error ? err.message : "Could not cancel that night.";
			this.error = message;
			toast.error(message);
		} finally {
			this.replacing = false;
		}
	};

	onSave = async (event: Event) => {
		event.preventDefault();
		if (this.busy) return;
		if (this.creatingNight) {
			if (!this.attachSeriesId || !this.form.startsOn) {
				const message = !this.attachSeriesId ? "Choose a series." : "Add a date.";
				this.error = message;
				toast.error(message);
				return;
			}
			this.saving = true;
			this.intent = "save";
			this.error = "";
			// Filling from the saved series resets the form's date, so keep the night's.
			const seriesId = this.attachSeriesId;
			const date = this.form.startsOn;
			// The new night's form starts empty, so any slots are the night's own.
			const nightSchedule = this.form.nightSchedule
				.map((slot) => ({ label: slot.label.trim(), startTime: slot.startTime, endTime: slot.endTime }))
				.filter((slot) => slot.label);
			try {
				const data = await ensureEventOccurrence(seriesId, date, {
					name: this.form.name.trim(),
					artist: this.form.artist.trim(),
					offer: this.form.offer.trim(),
					pageUrl: this.form.pageUrl.trim(),
					description: this.form.description.trim(),
					shortDescription: this.form.shortDescription.trim(),
					operationsNotes: this.form.operationsNotes.trim(),
					imageLinks: this.form.imageLinksText
						.split(/\r?\n/)
						.map((link) => link.trim())
						.filter(Boolean),
					time: this.form.startTime && this.form.endTime ? "" : this.form.time.trim(),
					startTime: this.form.startTime,
					endTime: this.form.endTime,
					...(nightSchedule.length ? { nightSchedule } : {}),
				});
				this.rememberEvent(data.event, true);
				this.applyWarnings(data.warnings);
				await this.uploadPendingPhoto(String(data.event?.id || seriesId), date);
				// A new night on an existing series: stage that series.
				await this.stageAfterSave(String(data.event?.id || seriesId), "");
				toast.ok(data.created ? "Night added to the series." : "Night opened.");
				navigate(eventItemPath(`${seriesId}@${date}`), { replace: true });
			} catch (err) {
				const message = err instanceof Error ? err.message : "Could not add the night.";
				this.error = message;
				toast.error(message);
			} finally {
				this.saving = false;
				this.intent = "";
			}
			return;
		}
		if (
			(!this.editingOccurrence && !this.form.name.trim()) ||
			(!this.creatingNight && !this.editingOccurrence && !this.form.startsOn && this.form.repeatUnit === "once")
		) {
			const message = !this.form.name.trim() ? "Add a name." : "Add a date.";
			this.error = message;
			toast.error(message);
			const target = this.route.isNew
				? eventNewPath(!this.form.name.trim() ? "details" : "schedule", { once: this.newEventRoute })
				: eventItemPath(this.route.slug || this.eventId, !this.form.name.trim() ? "details" : "schedule");
			if (this.getPath() !== target) navigate(target);
			return;
		}
		// The website needs one (publishEventPreview); a night uses its series'.
		if (!this.editingOccurrence && !this.form.description.replace(/<[^>]*>/g, "").trim()) {
			this.error = "Add a description. The website needs one.";
			toast.error(this.error);
			const target = this.route.isNew
				? eventNewPath("details", { once: this.newEventRoute })
				: eventItemPath(this.route.slug || this.eventId, "details");
			if (this.getPath() !== target) navigate(target);
			return;
		}
		if (
			!this.editingOccurrence &&
			this.form.repeatUnit !== "none" &&
			this.form.repeatUnit !== "once" &&
			this.form.startsOn &&
			!this.form.endsOn
		) {
			this.error = "Add an end date for the recurring event.";
			toast.error(this.error);
			return;
		}
		if (this.form.repeatUnit === "once" && !this.skipReplaceAsk) {
			const hit = this.events.find(
				(event) =>
					event.id !== this.eventId &&
					event.repeatUnit !== "once" &&
					(event.dates || []).some((row) => row.date === this.form.startsOn),
			);
			const decided =
				this.form.replacesSeries === hit?.slug ||
				this.form.replacesSeries === `keep:${hit?.slug || ""}`;
			if (hit?.slug && !decided) {
				this.replacePrompt = {
					id: hit.id,
					name: hit.name,
					slug: hit.slug,
					date: this.form.startsOn,
					skippedDates: hit.skippedDates || [],
				};
				return;
			}
		}
		this.skipReplaceAsk = false;
		if (this.editingOccurrence) {
			if (this.isOpenSeries || this.form.startsOn !== this.occurrenceDate) {
				await this.saveOccurrenceWithScope("this");
			} else {
				this.saveScopeOpen = true;
			}
			return;
		}
		this.saving = true;
		this.intent = "save";
		this.error = "";
		try {
			if (!this.eventId) {
				const data = await createEvent(this.form.body(this.current));
				this.rememberEvent(data.event, true);
				this.applyWarnings(data.warnings);
				await this.uploadPendingPhoto(String(data.event.id));
				await this.stageAfterSave(String(data.event.id), this.form.repeatUnit === "once" ? "Event saved." : "Series saved.");
				navigate(eventItemPath(data.event.id, this.tab), { replace: true });
			} else {
				const data = await updateEvent(this.eventId, this.form.body(this.current));
				this.rememberEvent(data.event, true);
				this.applyWarnings(data.warnings);
				await this.stageAfterSave(this.eventId, this.form.repeatUnit === "once" ? "Event saved." : "Series saved.");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not save the event.";
			this.error = message;
			toast.error(message);
		} finally {
			this.saving = false;
			this.intent = "";
		}
	};

	saveOccurrenceWithScope = async (scope: "this" | "following" | "all") => {
		if (!this.eventId || !this.occurrenceDate || this.busy) return;
		this.saveScopeOpen = false;
		this.saving = true;
		this.intent = "save";
		this.error = "";
		try {
			const data = await updateEventOccurrence(
				this.eventId,
				this.occurrenceDate,
				this.form.occurrenceBody(scope, this.current, { seriesId: this.eventId, occurrenceDate: this.occurrenceDate, hasOwnPhoto: Boolean(this.framingUrl) }),
			);
			this.rememberEvent(data.event, true);
			this.applyWarnings(data.warnings);
			const movedTo = data.movedTo || "";
			const assignedTo = String(data.assignedTo || this.eventId);
			if (assignedTo !== this.eventId || (movedTo && movedTo !== this.occurrenceDate)) {
				if (data.sourceDeleted) {
					this.events = this.events.filter((row) => row.id !== this.eventId);
				} else {
					try {
						const refreshed = await getEvents();
						this.events = refreshed.events || this.events;
					} catch {
						/* keep local list */
					}
				}
				// Both series changed: stage the one it left and the one it joined.
				if (!data.sourceDeleted && assignedTo !== this.eventId) await this.stageAfterSave(this.eventId, "");
				await this.stageAfterSave(assignedTo, assignedTo !== this.eventId ? "Night assigned to series." : "Night moved.");
				beginLeave();
				navigate(eventItemPath(`${assignedTo}@${movedTo || this.form.startsOn}`, this.tab), {
					replace: true,
					force: true,
				});
			} else {
				const count = "updated" in data ? Number(data.updated) || 1 : 1;
				await this.stageAfterSave(this.eventId, count === 1 ? "Event saved." : `${count} events saved.`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not save the event.";
			this.error = message;
			toast.error(message);
		} finally {
			this.saving = false;
			this.intent = "";
		}
	};

	onSyncCalendar = async () => {
		if (!this.eventId || this.busy || this.formDirty) return;
		this.calendarSyncing = true;
		this.error = "";
		this.warnings = [];
		try {
			const data = await syncEventCalendar(this.eventId);
			this.rememberEvent(data.event, false);
			this.warnings = (data.warnings || []).filter(Boolean);
			if (this.warnings.length === 1) toast.error(this.warnings[0]);
			else if (this.warnings.length) {
				toast.error(`Calendar updated with ${this.warnings.length} warnings.`);
			} else toast.ok("Calendar updated.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not update the calendar.";
			this.error = message;
			toast.error(message);
		} finally {
			this.calendarSyncing = false;
		}
	};

	openPutOnWebsite = () => {
		if (!this.eventId || this.busy || this.formDirty) return;
		this.putError = "";
		this.putOpen = true;
	};

	onRetryWebsiteJob = async () => {
		if (!this.eventId || this.retrying) return;
		this.retrying = true;
		try {
			await retryWebsiteJob(this.eventId);
			toast.ok("Trying again. It carries on in the background.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "It still didn't work.");
		} finally {
			this.retrying = false;
		}
	};

	confirmPutOnWebsite = async () => {
		if (!this.eventId || this.putting) return;
		this.putting = true;
		try {
			// Let the background work for this event finish first, so the two
			// never write the same nights at once.
			await websiteJobSettled(this.eventId);
			const data = await putEventOnWebsite(this.eventId);
			this.rememberEvent(data.event, false);
			this.putOpen = false;
			for (const warning of data.warnings || []) toast.info(warning);
			toast.ok("On the website now.");
			void refreshSitePending();
		} catch (err) {
			this.putError = err instanceof Error ? err.message : "Could not update the website.";
		} finally {
			this.putting = false;
		}
	};

	clearPendingPhoto = () => {
		if (this.pendingPhotoUrl) URL.revokeObjectURL(this.pendingPhotoUrl);
		this.pendingPhoto = null;
		this.pendingPhotoUrl = "";
	};

	acceptPhotoFile = (file: File | undefined | null) => {
		if (!file || !file.type.startsWith("image/")) return;
		void preparePhoto(file).then((ready) => {
			if (!ready) return;
			if (this.eventId) return this.onImage("main", ready);
			// Not saved yet: hold it and show it; Save uploads it.
			this.clearPendingPhoto();
			this.pendingPhoto = ready;
			this.pendingPhotoUrl = URL.createObjectURL(ready);
		});
	};

	/** After the first save of a new event or night: upload the photo picked before it. */
	uploadPendingPhoto = async (id: string, nightDate = "") => {
		const photo = this.pendingPhoto;
		this.clearPendingPhoto();
		if (!photo || !id) return;
		try {
			const data = nightDate
				? await uploadEventOccurrenceImage(id, nightDate, photo)
				: await uploadEventImage(id, photo, "main");
			this.rememberEvent(data.event, false);
		} catch (err) {
			toast.error(
				`Saved, but the photo didn't upload: ${err instanceof Error ? err.message : "something went wrong."} Add it again.`,
			);
		}
	};

	onImage = async (role: "main" | "gallery", file: File | null) => {
		if (!file || !this.eventId) return;
		this.saving = true;
		this.intent = "image";
		try {
			if (this.editingOccurrence && this.occurrenceDate && role === "main") {
				const data = await uploadEventOccurrenceImage(
					this.eventId,
					this.occurrenceDate,
					file,
				);
				this.rememberEvent(data.event, false);
				await this.stageAfterSave(this.eventId, "Photo saved.");
			} else {
				const data = await uploadEventImage(this.eventId, file, role);
				this.rememberEvent(data.event, false);
				if (role === "main") await this.stageAfterSave(this.eventId, "Photo saved.");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not upload the image.";
			this.error = message;
			toast.error(message);
		} finally {
			this.saving = false;
			this.intent = "";
		}
	};

	onClearImage = async (role: "main" | "gallery", imageName = "") => {
		if (!this.eventId || this.busy) return;
		this.saving = true;
		this.intent = "image";
		try {
			if (this.editingOccurrence && this.occurrenceDate && role === "main") {
				const data = await clearEventOccurrenceImage(this.eventId, this.occurrenceDate);
				this.rememberEvent(data.event, false);
				await this.stageAfterSave(this.eventId, "Photo removed.");
			} else {
				const data = await clearEventImage(this.eventId, role, imageName);
				this.rememberEvent(data.event, false);
				if (role === "main") {
					await this.stageAfterSave(this.eventId, "Photo removed.");
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not remove the image.";
			toast.error(message);
		} finally {
			this.saving = false;
			this.intent = "";
		}
	};
}
