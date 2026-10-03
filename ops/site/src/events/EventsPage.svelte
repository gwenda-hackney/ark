<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		BusyOverlay,
		Button,
		EditorBackBar,
		Segmented,
	} from "../ui";
	import type { SegmentedItem } from "../ui/types";
	import { onWebsiteJobEvent } from "./website-jobs.svelte";
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
	import { easeOut, fadeMs, flyMs } from "../ui/motion";
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

	const tabs = $derived.by((): SegmentedItem[] => {
		const base = editor.route.isNew
			? "/events/new"
			: editor.route.slug
				? `/events/${encodeURIComponent(editor.route.slug)}`
				: "/events/new";
		const hrefFor = (id: string) => eventTabPath(base, id);
		if (editor.creatingNight) {
			return [
				{ id: "details", label: "Details", href: editor.newEventRoute ? "/events/new/once" : hrefFor("details") },
			];
		}
		if (editor.creatingOnce) {
			return [{ id: "details", label: "Details", href: "/events/new/once" }];
		}
		if (editor.editingOnce) {
			return [
				{ id: "details", label: "Details", href: hrefFor("details") },
				{ id: "gallery", label: "Images", href: hrefFor("gallery") },
			];
		}
		if (editor.editingOccurrence) {
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

	/** A new form starts in its name, or its date when the series is already picked. */
	async function focusFirstField() {
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

	$effect(() => {
		if (!editor.editingOnce || editor.tab !== "schedule" || !editor.eventId) return;
		navigate(eventItemPath(editor.eventId, "details"), { replace: true });
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
			? eventNewPath(editor.route.tab || "details", { once: editor.newEventRoute })
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
		const order = ["details", "schedule", "gallery"];
		const from = order.indexOf(tabPrev);
		const to = order.indexOf(id);
		if (from >= 0 && to >= 0 && from !== to) tabSlide = to > from ? 1 : -1;
		tabPrev = id;
	});

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
		// Editing a night: its own photos (they show on the series too).
		const date = editor.editingOccurrence ? editor.occurrenceDate || "" : "";
		void editor.gallery.load(id, false, date).then((folder) => {
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
				Back to {listTitle.toLowerCase()}
			</Button>
		</div>
	{:else if editor.editing}
		<form
			class="editor"
			aria-busy={editor.busy || undefined}
			in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
			out:fade={{ duration: fadeMs, easing: easeOut }}
			onsubmit={editor.onSave}
		>
			<EditorBackBar label={listTitle} dirty={editor.formDirty} onback={requestClose} />
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
						onusedefaults={() => void editor.useSeriesDefaults()}
						onaddnight={editor.addNightToSeries}
						onsynccalendar={() => void editor.onSyncCalendar()}
						onputonwebsite={editor.openPutOnWebsite}
						onreload={requestReload}
						onclose={requestClose}
					/>

					<div class="tabs">
						<Segmented
							value={editor.tab}
							items={tabs}
							tone="soft"
							size="sm"
							ariaLabel="Event sections"
						/>
					</div>

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
									{#if editor.tab === "details"}
										<DetailsTab
											form={editor.form}
											current={editor.current}
											eventId={editor.eventId}
											busy={editor.busy}
											isNew={Boolean(editor.route.isNew)}
											newEventRoute={editor.newEventRoute}
											creatingNight={editor.creatingNight}
											creatingOnce={editor.creatingOnce}
											editingOnce={editor.editingOnce}
											editingOccurrence={editor.editingOccurrence}
											bind:attachSeriesId={editor.attachSeriesId}
											seriesOptions={editor.seriesOptions}
											approvedArtists={editor.approvedArtists}
											webAddressChanged={editor.webAddressChanged}
											framingUrl={editor.framingUrl}
											onpickphoto={editor.acceptPhotoFile}
											onclearphoto={() => (editor.pendingPhoto ? editor.clearPendingPhoto() : void editor.onClearImage("main"))}
										/>
									{:else if editor.tab === "schedule"}
										<ScheduleTab form={editor.form} current={editor.current} eventId={editor.eventId} editingOccurrence={editor.editingOccurrence} previewDates={editor.previewDates} />
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

					<footer class="panel-foot">
						{#if editor.eventId}
							<Button
								class="delete-btn"
								variant="destructive"
								size="sm"
								type="button"
								disabled={editor.busy}
								onclick={editor.requestDelete}
							>
								Delete
							</Button>
						{/if}
						<Button
							variant="primary"
							size="sm"
							type="submit"
							disabled={editor.busy}
							busy={editor.saving && editor.intent === "save"}
						>
							{#snippet icon()}
								<Icon name="save" />
							{/snippet}
							{editor.saving && editor.intent === "save"
								? "Saving…"
								: editor.editingNight
									? "Save this night"
									: editor.creatingOnce || editor.editingOnce
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
				open={editor.saveScopeOpen}
				title="Which events should change?"
				message="Choose how widely to apply these edits. Past events will not be changed."
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
				title="Which events should be deleted?"
				message="Choose how widely to delete. Past events will not be changed."
				alsoWebsite={editor.onWebsite}
				disabled={editor.busy}
				destructive
				allBusy={editor.saving && editor.intent === "delete"}
				onchoose={(scope) => void editor.performDelete(scope)}
				onclose={editor.cancelDelete}
			/>

			<DeleteEventDialog
				open={editor.deleteOpen}
				eventName={editor.form.name.trim() || "this event"}
				recurring={editor.form.repeatUnit !== "none"}
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
		</form>
	{/if}
	<BusyOverlay active={editor.busy} label={editor.busyLabel} />
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
