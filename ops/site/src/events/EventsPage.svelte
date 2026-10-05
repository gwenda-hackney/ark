<script lang="ts">
	import { EditorPlaceholder, EditorReveal, editorZoom } from "../ui";
	import { onDestroy, onMount, tick, untrack } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		BusyOverlay,
		Button,
		EditorActionBar,
		EditorBackBar,
		HelpDrawer,
		Segmented,
	} from "../ui";
	import { provideHelp } from "../ui/help.svelte";
	import { EVENTS_HELP } from "./events-help";
	import type { SegmentedItem } from "../ui/types";
	import { onWebsiteJobEvent } from "./website-jobs.svelte";
	import EditorHeader from "./EditorHeader.svelte";
	import EventsList from "./EventsList.svelte";
	import EventFields from "./tabs/EventFields.svelte";
	import GalleryTab from "./tabs/GalleryTab.svelte";
	import ScheduleTab from "./tabs/ScheduleTab.svelte";
	import DeleteEventDialog from "./dialogs/DeleteEventDialog.svelte";
	import DiscardDialog from "./dialogs/DiscardDialog.svelte";
	import ReplaceNightDialog from "./dialogs/ReplaceNightDialog.svelte";
	import ScopeDialog from "./dialogs/ScopeDialog.svelte";
	import UpdateWebsiteDialog from "./dialogs/UpdateWebsiteDialog.svelte";
	import { formatDate } from "./event-labels";
	import { getApprovedArtists, getMe } from "../app/api";
	import {
		editorKey,
		eventItemPath,
		eventNewPath,
		eventTabPath,
		leaveEditor,
		navigate,
	} from "../app/nav";
	import { setActiveNavOverride, setCrumbLeaf } from "../ui/crumbs.svelte";
	import { easeOut } from "../ui/motion";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../ui/unsaved.svelte";
	import { EventEditor } from "./event-editor.svelte";

	let { path = "/" }: { path?: string } = $props();

	const editor = new EventEditor(() => path);
	let openedKey = $state("");
	let discardOpen = $state(false);
	let discardKind = $state<"close" | "reload">("close");
	let tabSlide = $state(1);
	let tabPrev = "details";
	let tabReady = false;

	let listOrigin = $state<"series" | "schedule">("series");
	const routeList = $derived(
		(editor.route as { list?: string }).list === "schedule" ? "schedule" : (editor.route as { list?: string }).list === "series" ? "series" : null,
	);
	// A special event is not a series: keep Schedule highlighted in the menu.
	$effect(() => {
		setActiveNavOverride(editor.editingOnce ? "events-schedule" : "");
		return () => setActiveNavOverride("");
	});
	const listView = $derived<"series" | "schedule">(
		routeList ??
			(editor.editingOccurrence || editor.creatingOnce || editor.editingOnce
				? "schedule"
				: editor.editing && !editor.route.isNew
					? "series"
					: listOrigin),
	);
	const listTitle = $derived(listView === "schedule" ? "Schedule" : "Series");
	/** One Help drawer for the lists and the editor; a field's ? opens its topic. */
	const help = provideHelp(() => (editor.editing ? "Events" : listTitle), EVENTS_HELP);

	const tabs = $derived.by((): SegmentedItem[] => {
		const base = editor.route.isNew
			? "/events/new"
			: editor.route.slug
				? `/events/${encodeURIComponent(editor.route.slug)}`
				: "/events/new";
		const hrefFor = (id: string) => eventTabPath(base, id);
		// Everything new is one form: nights and photos come after the first save.
		if (editor.route.isNew) return [];
		if (editor.editingOnce || editor.editingOccurrence) {
			return [
				{ id: "details", label: "Details", href: hrefFor("details") },
				{ id: "ops", label: "Ops", href: hrefFor("ops") },
				{ id: "gallery", label: "Images", href: hrefFor("gallery") },
			];
		}
		return [
			{ id: "details", label: "Details", href: hrefFor("details") },
			{ id: "schedule", label: "Schedule", href: hrefFor("schedule") },
			{ id: "ops", label: "Ops", href: hrefFor("ops") },
			{ id: "gallery", label: "Images", href: hrefFor("gallery") },
		];
	});

	/** The form mounts once the editor has come forward; a page opened straight on an editor has no intro. */
	const reveal = new EditorReveal(untrack(() => editor.editing));

	/** A new form starts in its name, or its date when the series is already picked. */
	async function focusFirstField() {
		await tick();
		// The form mounts once the editor has come forward.
		for (let wait = 0; !reveal.settled && wait < 40; wait += 1) {
			await new Promise((done) => setTimeout(done, 25));
		}
		await tick();
		const id = editor.attachSeriesId ? "event-date" : "event-name";
		(document.getElementById(id) as HTMLInputElement | null)?.focus();
	}

	onMount(() => {
		void editor.reload();
		// A hint only: Guest/collaboration still takes any name without it.
		getApprovedArtists()
			.then((data) => (editor.approvedArtists = data.artists || []))
			.catch(() => {});
		const stopJobEvents = onWebsiteJobEvent(editor.takeReadyEvent);
		getMe()
			.then((me) => {
				editor.localOps = me.siteEnv === "local";
			})
			.catch(() => undefined);
		return stopJobEvents;
	});

	$effect(() => {
		if (routeList) listOrigin = routeList;
	});

	// A special event or a night has no Schedule tab: its date is under When on Details.
	$effect(() => {
		if (editor.tab !== "schedule" || !editor.eventId) return;
		if (editor.editingOnce) navigate(eventItemPath(editor.eventId, "details"), { replace: true });
		else if (editor.editingOccurrence && editor.occurrenceDate) {
			navigate(eventItemPath(`${editor.eventId}@${editor.occurrenceDate}`, "details"), { replace: true });
		}
	});

	$effect(() => {
		if (!editor.editingOccurrence || !editor.eventId || !editor.occurrenceDate) return;
		if (String(editor.current?.repeatUnit || "").toLowerCase() !== "once") return;
		navigate(eventItemPath(editor.eventId, editor.tab === "schedule" ? "details" : editor.tab), {
			replace: true,
		});
	});

	$effect(() => {
		if (!editor.editing) return;
		const canonical = editor.route.isNew
			? eventNewPath("details", { once: editor.newEventRoute })
			: editor.route.slug
				? eventItemPath(editor.route.slug, editor.route.tab || "details")
				: "";
		if (canonical && canonical !== path) navigate(canonical, { replace: true });
	});

	$effect(() => {
		const label = !editor.editing
			? ""
			: editor.editingOccurrence && editor.occurrenceDate
				? [formatDate(editor.occurrenceDate), editor.current?.name || editor.form.name.trim()]
						.filter(Boolean)
						.join(" · ")
				: editor.form.name.trim() ||
					(editor.route.isNew ? (editor.creatingNight ? "New night" : editor.creatingOnce ? "New event" : "New series") : "Event");
		setCrumbLeaf(label);
		return () => setCrumbLeaf("");
	});

	$effect(() => {
		if (!editor.editing) {
			openedKey = "";
			return;
		}
		const key = editorKey(path);
		const list = editor.events;
		if (key !== openedKey) {
			openedKey = key;
			editor.warnings = [];
			if (editor.route.isNew) {
				editor.blank();
				void focusFirstField();
				return;
			}
			if (editor.current?.id === editor.eventId) {
				editor.fill(editor.current);
				return;
			}
		}
		if (editor.route.isNew || editor.current?.id === editor.eventId) return;
		const found = list.find((event) => event.id === editor.eventId);
		if (found) editor.fill(found);
	});

	$effect(() => {
		const id = editor.tab;
		if (!editor.editing) return;
		if (!tabReady) {
			tabPrev = id;
			tabReady = true;
			return;
		}
		const order = ["details", "schedule", "ops", "gallery"];
		const from = order.indexOf(tabPrev);
		const to = order.indexOf(id);
		if (from >= 0 && to >= 0 && from !== to) tabSlide = to > from ? 1 : -1;
		tabPrev = id;
	});

	// After a Save found problems, keep them in step with what's typed.
	$effect(() => {
		if (!editor.errors.count) return;
		editor.errors.replace(editor.validate());
	});

	const saveLabel = $derived(
		editor.editingNight
			? "Save night"
			: editor.creatingOnce || editor.editingOnce
				? "Save event"
				: "Save series",
	);
	const deleteLabel = $derived(
		editor.editingNight
			? "Delete night"
			: editor.creatingOnce || editor.editingOnce
				? "Delete event"
				: "Delete series",
	);

	$effect(() => {
		if (!editor.editing) {
			clearUnsavedGuard();
			return;
		}
		setUnsavedGuard(editor.formDirty, () => {
			discardKind = "close";
			discardOpen = true;
		});
	});

	$effect(() => {
		if (!editor.editing || !editor.formDirty || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	$effect(() => {
		if (!editor.editing || typeof window === "undefined") return;
		function onKey(e: KeyboardEvent) {
			if (editor.busy) return;
			if (e.key !== "Escape") return;
			if (editor.deleteOpen || editor.deleteScopeOpen || discardOpen) return;
			e.preventDefault();
			requestClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	$effect(() => {
		if (!editor.editing || editor.tab !== "gallery") return;
		const id = editor.eventId;
		// A night shows its series' photos: one gallery per series (#30). Per-night photos are #146.
		void editor.gallery
			.load(id, false, "", editor.current?.gallery ?? null, editor.current?.driveFolderUrl || "")
			.then((folder) => {
				if (!folder || editor.current?.id !== id) return;
				editor.current = {
					...editor.current,
					driveFolderId: folder.id,
					driveFolderUrl: folder.url || editor.current.driveFolderUrl,
				};
			});
	});

	onDestroy(() => clearUnsavedGuard());

	function requestClose() {
		if (editor.busy) return;
		if (editor.formDirty) {
			discardKind = "close";
			discardOpen = true;
			return;
		}
		leaveEditor(editor.listHomePath());
	}

	function requestReload() {
		if (editor.busy || !editor.eventId) return;
		if (editor.formDirty) {
			discardKind = "reload";
			discardOpen = true;
			return;
		}
		void editor.reload();
	}

	function cancelDiscard() {
		discardOpen = false;
		takeBlockedNav();
	}

	function confirmDiscard() {
		if (editor.busy) return;
		const kind = discardKind;
		discardOpen = false;
		if (kind === "reload") {
			void editor.reload();
			return;
		}
		beginLeave();
		const pending = takeBlockedNav();
		if (pending?.path) {
			navigate(pending.path, { force: true, replace: pending.replace });
			return;
		}
		leaveEditor(editor.listHomePath(), { force: true });
	}

</script>

<div class="events-root" class:editor.editing>
	<!-- Keep the list mounted under the editor so week-list scroll survives open/close. -->
	<EventsList events={editor.events} {listView} {listTitle} busy={editor.busy} error={editor.error} loading={editor.loading} editing={editor.editing} missing={editor.missing} onreload={() => void editor.reload()} />
	{#if editor.missing}
		<div class="missing">
			<EditorBackBar label={listTitle} onback={() => leaveEditor(editor.listHomePath())} />
			<p>{editor.error}</p>
			<Button type="button" variant="outline" onclick={() => leaveEditor(editor.listHomePath())}>
				{#snippet icon()}<Icon name="chevron-left" size={16} />{/snippet}
				Back to {listTitle.toLowerCase()}
			</Button>
		</div>
	{:else if editor.editing}
		<form
			class="editor"
			novalidate
			aria-busy={editor.busy || undefined}
			transition:editorZoom
			onintroend={reveal.introend}
			onoutrostart={reveal.outrostart}
			onsubmit={editor.onSave}
		>
			{#if !reveal.settled}
				<EditorPlaceholder />
			{:else}
				<EditorBackBar label={listTitle} onback={requestClose} />
				<div class="split split--full">
					<div class="panel" class:dirty={editor.formDirty}>
						<EditorHeader
							form={editor.form}
							current={editor.current}
							eventId={editor.eventId}
							occurrenceDate={editor.occurrenceDate}
							busy={editor.busy}
							dirty={editor.formDirty}
							isNew={Boolean(editor.route.isNew)}
							creatingNight={editor.creatingNight}
							creatingOnce={editor.creatingOnce}
							editingOnce={editor.editingOnce}
							parentSeriesName={editor.parentSeriesName}
							calendarSyncing={editor.calendarSyncing}
							localOps={editor.localOps}
							onsynccalendar={() => void editor.onSyncCalendar()}
							onputonwebsite={editor.openPutOnWebsite}
							onreload={requestReload}
							onclose={requestClose}
						/>

						{#if tabs.length > 1}
							<div class="tabs">
								<Segmented
									value={editor.tab}
									items={tabs}
									tone="soft"
									size="sm"
									ariaLabel="Event sections"
								/>
							</div>
						{/if}

						<div class="tab-scroll scrollbar-fade">
							<div class="tab-body">
								{#key editor.tab}
									<div
										class="tab-panel"
										in:fly={{
											x: tabSlide * 14,
											duration: 260,
											opacity: 0,
											easing: easeOut,
										}}
									>
										{#if editor.tab !== "gallery" || editor.route.isNew}
											<EventFields
												part={editor.route.isNew ? "all" : editor.tab === "schedule" || editor.tab === "ops" ? editor.tab : "details"}
												form={editor.form}
												errors={editor.errors}
												current={editor.current}
												parentSeries={editor.parentSeries}
												eventId={editor.eventId}
												occurrenceDate={editor.occurrenceDate}
												busy={editor.busy}
												isNew={Boolean(editor.route.isNew)}
												newKind={editor.newKind}
												creatingNight={editor.creatingNight}
												creatingOnce={editor.creatingOnce}
												editingOnce={editor.editingOnce}
												editingOccurrence={editor.editingOccurrence}
												bind:attachSeriesId={editor.attachSeriesId}
												seriesOptions={editor.seriesOptions}
												approvedArtists={editor.approvedArtists}
												webAddressChanged={editor.webAddressChanged}
												framingUrl={editor.framingUrl}
												previewDates={editor.previewDates}
												onkind={editor.setNewKind}
												onoverride={editor.overrideField}
												onuseseries={editor.useSeriesValue}
												onoverridephoto={editor.overridePhoto}
												onuseseriesphoto={() => void editor.useSeriesPhoto()}
												onpickphoto={editor.acceptPhotoFile}
												onclearphoto={() => (editor.pendingPhoto ? editor.clearPendingPhoto() : void editor.onClearImage())}
											/>
											{#if editor.tab === "schedule" && !editor.route.isNew}
												<ScheduleTab
													form={editor.form}
													current={editor.current}
													eventId={editor.eventId}
													previewDates={editor.previewDates}
													busy={editor.busy}
													onaddnight={editor.addNightToSeries}
												/>
											{/if}
										{:else if editor.tab === "gallery"}
											<GalleryTab gallery={editor.gallery} eventId={editor.eventId} busy={editor.busy} />
										{/if}
										{#if editor.websiteJob?.state === "failed" && !editor.formDirty}
											<div class="job-failed" role="alert">
												<p>
													Saved, but it couldn't be got ready for the website: {editor.websiteJob.error ||
														"something went wrong."}
												</p>
												<Button
													variant="outline"
													size="sm"
													type="button"
													busy={editor.retrying}
													disabled={editor.retrying}
													onclick={() => void editor.onRetryWebsiteJob()}
												>
													{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}
													Try again
												</Button>
											</div>
										{/if}
										{#if editor.warnings.length}
											<ul class="warnings">
												{#each editor.warnings as warning (warning)}
													<li>{warning}</li>
												{/each}
											</ul>
										{/if}
										{#if editor.error}<p class="error">{editor.error}</p>{/if}
									</div>
								{/key}
							</div>
						</div>

						<EditorActionBar
							{saveLabel}
							saving={editor.saving && editor.intent === "save"}
							disabled={editor.busy}
							dirty={editor.formDirty}
							errorCount={editor.errors.count}
							onerrors={() => void editor.showErrors()}
							overflow={[
								// Nights always offer this, disabled when nothing overrides the series;
								// a series never has it.
								...(editor.editingOccurrence
									? [
											{
												label: "Use series values for everything",
												disabled: editor.busy || !(editor.form.defaultsUnlocked || editor.form.ownPhoto),
												reason:
													editor.form.defaultsUnlocked || editor.form.ownPhoto
														? undefined
														: "Already follows the series",
												onselect: () => void editor.useSeriesDefaults(),
											},
										]
									: []),
								{
									label: deleteLabel,
									tone: "destructive" as const,
									disabled: editor.busy || !editor.eventId,
									reason: editor.eventId ? undefined : "Not saved yet",
									onselect: editor.requestDelete,
								},
							]}
						/>
					</div>
				</div>

				<DiscardDialog
					open={discardOpen}
					kind={discardKind}
					oncancel={cancelDiscard}
					onconfirm={confirmDiscard}
				/>

				<ScopeDialog
					open={editor.saveScopeOpen}
					title="Which nights should change?"
					message="Past nights stay as they were."
					onchoose={(scope) => editor.saveOccurrenceWithScope(scope)}
					onclose={() => (editor.saveScopeOpen = false)}
				/>

				<ReplaceNightDialog
					prompt={editor.replacePrompt}
					eventName={editor.form.name.trim() || "this event"}
					replacing={editor.replacing}
					onchoose={(replace) => void editor.chooseConflict(replace)}
					onclose={() => (editor.replacePrompt = null)}
				/>

				<ScopeDialog
					open={editor.deleteScopeOpen}
					title="Which nights should be deleted?"
					message="Past nights stay as they were."
					alsoWebsite={editor.onWebsite}
					disabled={editor.busy}
					destructive
					allBusy={editor.saving && editor.intent === "delete"}
					onchoose={(scope) => void editor.performDelete(scope)}
					onclose={editor.cancelDelete}
				/>

				<DeleteEventDialog
					open={editor.deleteOpen}
					eventName={editor.form.name.trim() || editor.current?.name || "this event"}
					kind={editor.editingOccurrence
						? "night"
						: editor.editingOnce
							? "event"
							: "series"}
					nightDate={editor.occurrenceDate}
					seriesName={editor.parentSeriesName}
					onWebsite={editor.onWebsite}
					busy={editor.busy}
					deleting={editor.saving && editor.intent === "delete"}
					oncancel={editor.cancelDelete}
					onconfirm={() => void editor.performDelete("series")}
				/>

				<UpdateWebsiteDialog
					open={editor.putOpen}
					putting={editor.putting}
					error={editor.putError}
					onclose={() => (editor.putOpen = false)}
					onconfirm={() => void editor.confirmPutOnWebsite()}
				/>
			{/if}
		</form>
	{/if}
	<!-- The list shows skeleton rows while it loads; the overlay is for the editor and saves. -->
	<BusyOverlay active={editor.busy && (editor.editing || !editor.loading)} label={editor.busyLabel} />
</div>

<HelpDrawer {help} />

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
		background: var(--ambient), var(--background);
	}

	.missing {
		display: grid;
		gap: var(--space-3);
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
		row-gap: var(--space-4);
		flex: 1;
		min-height: 0;
		height: 100%;
		padding: var(--space-4) var(--page-gutter) var(--space-4);
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
		background: var(--panel-bg);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition: border-color var(--t-fast) var(--ease-in-out);
	}

	.panel.dirty {
		border-color: color-mix(in srgb, var(--destructive) 32%, var(--border));
	}

	.tabs {
		flex-shrink: 0;
		padding: var(--space-2) var(--card-pad-lg) 0;
		background: transparent;
		border-bottom: 1px solid var(--border);
	}

	/* Section cards sit on the page colour, so each group reads as one block. */
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
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid color-mix(in srgb, var(--destructive) 35%, transparent);
		border-radius: var(--radius-md);
		color: var(--destructive);
		font-size: var(--text-sm);
	}

	.job-failed p {
		flex: 1 1 16rem;
		margin: 0;
	}

	.warnings {
		display: grid;
		gap: var(--space-1);
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
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
		.tab-body {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}

		.tab-body {
			padding-top: var(--space-4);
			padding-bottom: max(var(--page-gutter), 1.125rem);
		}
	}

</style>
