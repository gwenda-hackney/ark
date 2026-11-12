<script lang="ts">
	/**
	 * Settings → Gallery (#291): the venue's own photos on the website, in
	 * home's photo strip and at the top of the Photos page, in this order.
	 * The photos are tiles like an event's Images tab (events/tabs/GalleryTab):
	 * drop or add photos, drag one to move it, the cross takes one out.
	 * Opening one shows the same editor everywhere (a dialog on desktop, a
	 * sheet on phones): what it shows, the menu board on home it's pinned on,
	 * and buttons to move it. Every change goes on the website by itself, as
	 * saving the opening hours does (venue/server/venue-gallery.js).
	 *
	 * Under them, From events: the photos from events the Photos page shows
	 * under the venue's own, each event's under its name with the way to its
	 * Images tab, where they're managed. Here they're only to see.
	 */
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		Badge,
		BusyOverlay,
		Button,
		Card,
		Dialog,
		EmptyState,
		Field,
		NativeSelect,
		PageHeader,
		Skeleton,
		TextArea,
	} from "../ui";
	import {
		describeVenuePhoto,
		getVenueGallery,
		orderVenueGallery,
		removeVenuePhoto,
		uploadVenuePhoto,
	} from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { DESCRIPTION_MAX_LENGTH, galleryPhotoProblems } from "./gallery-model.js";
	import {
		MENU_OPTIONS,
		changedMessage,
		droppedOrder,
		eventSections,
		eventsOnPhotosPage,
		fromEventsFootnote,
		galleryFootnote,
		movedOrder,
		photoTiles,
		sameOrder,
		uploadedMessage,
		type Move,
	} from "./gallery-page";
	import { websiteBadge } from "./venue-page";
	import type { EventPhotoGroup, GalleryChangeResponse, PhotoMenu, VenuePhoto, WebsiteState } from "./types";

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	let loading = $state(true);
	let loaded = $state(false);
	let loadError = $state("");
	let photos = $state<VenuePhoto[]>([]);
	let website = $state<WebsiteState>("none");
	/** The events' photos the Photos page shows, newest event first: read-only. */
	let fromEvents = $state<EventPhotoGroup[]>([]);
	/** Uploading, moving or taking one out: the controls wait, they don't go. */
	let uploading = $state(false);
	let working = $state(false);
	const busy = $derived(uploading || working);

	/** The photo open in the editor, and its words as typed. */
	let editing = $state<string | null>(null);
	let draftDescription = $state("");
	let draftMenu = $state<string>("");
	let dialogError = $state("");
	let descriptionError = $state("");
	let saving = $state(false);

	/** A file dragged over the photos (to upload), or a photo being dragged (to move). */
	let dropping = $state(false);
	let dropDepth = 0;
	let dragKey = $state<string | null>(null);
	let dragOver = $state<string | null>(null);

	const badge = $derived(websiteBadge(website, "photos"));
	const tiles = $derived(photoTiles(photos));
	const sections = $derived(eventSections(fromEvents));
	const keys = $derived(photos.map((photo) => photo.key));
	const open = $derived(photos.find((photo) => photo.key === editing) ?? null);
	const openPlace = $derived(editing ? keys.indexOf(editing) : -1);
	const draftDirty = $derived(
		Boolean(open) && (draftDescription.trim() !== open?.description || draftMenu !== open?.menu),
	);

	async function load() {
		loading = true;
		loadError = "";
		try {
			const data = await getVenueGallery();
			photos = data.photos;
			website = data.website;
			fromEvents = data.fromEvents ?? [];
			loaded = true;
		} catch (err) {
			loadError = err instanceof Error ? err.message : "Could not load the gallery.";
		} finally {
			loading = false;
		}
	}

	onMount(() => void load());

	/** Take in what a change sent back, and say how it went. */
	function took(result: GalleryChangeResponse, done: string) {
		photos = result.photos;
		website = result.website;
		toast.ok(changedMessage(done, result));
		for (const warning of result.warnings || []) toast.error(warning);
	}

	function openPhoto(key: string) {
		const photo = photos.find((row) => row.key === key);
		if (!photo) return;
		draftDescription = photo.description;
		draftMenu = photo.menu;
		dialogError = "";
		descriptionError = "";
		editing = key;
	}

	function closeDialog() {
		if (saving) return;
		editing = null;
	}

	/** Uploads the images among `fileList`, one by one, each to the top; other files are left out. */
	async function upload(fileList: File[]) {
		const files = fileList.filter((file) => file.type.startsWith("image/"));
		if (!files.length || busy) return;
		uploading = true;
		let added: string[] = [];
		let last: GalleryChangeResponse | null = null;
		try {
			for (const file of files) {
				const result = await uploadVenuePhoto(file);
				photos = result.photos;
				website = result.website;
				added = [...added, ...result.added];
				last = result;
			}
			toast.ok(uploadedMessage(added.length, files.length));
			for (const warning of last?.warnings || []) toast.error(warning);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not add the photo.");
		} finally {
			uploading = false;
		}
		// One photo: straight on to saying what it shows.
		if (files.length === 1 && added.length === 1) openPhoto(added[0]);
	}

	async function onInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files || [])];
		input.value = "";
		await upload(files);
	}

	/** Put the photos in `order`: shown at once, put back if it doesn't save. */
	async function reorder(order: string[], done = "Moved") {
		if (busy || sameOrder(order, keys)) return;
		const before = photos;
		const byKey = new Map(photos.map((photo) => [photo.key, photo]));
		photos = order.map((key) => byKey.get(key)).filter((photo): photo is VenuePhoto => Boolean(photo));
		working = true;
		try {
			took(await orderVenueGallery(order), done);
		} catch (err) {
			photos = before;
			toast.error(err instanceof Error ? err.message : "Could not move the photo.");
		} finally {
			working = false;
		}
	}

	function move(key: string, how: Move) {
		void reorder(movedOrder(keys, key, how), how === "top" ? "Moved to the top" : "Moved");
	}

	async function remove(key: string) {
		if (busy) return;
		const before = photos;
		photos = photos.filter((photo) => photo.key !== key);
		if (editing === key) editing = null;
		working = true;
		try {
			took(await removeVenuePhoto(key), "Photo removed");
		} catch (err) {
			photos = before;
			toast.error(err instanceof Error ? err.message : "Could not remove the photo.");
		} finally {
			working = false;
		}
	}

	async function saveWords(event: Event) {
		event.preventDefault();
		if (!open) return;
		const problems = galleryPhotoProblems({ description: draftDescription, menu: draftMenu });
		descriptionError = problems.description || "";
		if (problems.description || problems.menu) return;
		saving = true;
		dialogError = "";
		try {
			took(await describeVenuePhoto(open.key, { description: draftDescription, menu: draftMenu as PhotoMenu }), "Saved");
			editing = null;
		} catch (err) {
			dialogError = err instanceof Error ? err.message : "Could not save the photo.";
		} finally {
			saving = false;
		}
	}

	// Files dropped on the photos are uploaded; a photo dropped on another moves there.
	const carriesFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));

	function onDragEnter(e: DragEvent) {
		if (!carriesFiles(e)) return;
		e.preventDefault();
		dropDepth += 1;
		dropping = true;
	}

	function onDragOver(e: DragEvent) {
		if (!carriesFiles(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	}

	function onDragLeave(e: DragEvent) {
		if (!carriesFiles(e)) return;
		e.preventDefault();
		dropDepth = Math.max(0, dropDepth - 1);
		if (dropDepth === 0) dropping = false;
	}

	function onDrop(e: DragEvent) {
		if (!carriesFiles(e)) return;
		e.preventDefault();
		dropDepth = 0;
		dropping = false;
		void upload([...(e.dataTransfer?.files || [])]);
	}

	function onTileDragStart(e: DragEvent, key: string) {
		if (busy) {
			e.preventDefault();
			return;
		}
		dragKey = key;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", key);
		}
	}

	function onTileDragOver(e: DragEvent, key: string) {
		if (!dragKey) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		dragOver = key;
	}

	function onTileDrop(e: DragEvent, key: string) {
		if (!dragKey) return;
		e.preventDefault();
		e.stopPropagation();
		const dragged = dragKey;
		dragKey = null;
		dragOver = null;
		void reorder(droppedOrder(keys, dragged, key));
	}

	function onTileDragEnd() {
		dragKey = null;
		dragOver = null;
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader title="Gallery" subtitle="The venue's own photos on the website. Changes go on the website by themselves." />

	{#if loadError}
		<EmptyState tone="error" title="Could not load the gallery" text={loadError}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => void load()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading && !loaded}
		<Skeleton rows={4} lines={1} label="Loading the gallery…" />
	{:else}
		<div class="cards" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<Card title="Photos">
				{#snippet actions()}
					<Badge tone={badge.tone} label={badge.label} title={badge.hint} />
				{/snippet}
				<p class="hint">
					These show in the photo strip on home and at the top of the Photos page, in this order. Photos from
					events and pop-ups go on the event's Images tab instead, and show below.
				</p>
				<div
					class="drive-drop"
					role="group"
					aria-label="Drop photos here to add them to the gallery"
					class:dragging={dropping}
					class:busy={uploading}
					ondragenter={onDragEnter}
					ondragover={onDragOver}
					ondragleave={onDragLeave}
					ondrop={onDrop}
				>
					<ul class="gallery">
						<li>
							<label class="tile add" class:disabled={busy}>
								<span class="photo-btn primary">
									<Icon name="upload" size={16} />
									{uploading ? "Uploading…" : "Add photos"}
								</span>
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									multiple
									disabled={busy}
									onchange={onInput}
								/>
							</label>
						</li>
						{#each tiles as tile (tile.key)}
							<li
								class="tile"
								class:dragged={dragKey === tile.key}
								class:over={dragOver === tile.key && dragKey !== tile.key}
								draggable={!busy && !phone.matches}
								ondragstart={(e) => onTileDragStart(e, tile.key)}
								ondragover={(e) => onTileDragOver(e, tile.key)}
								ondragleave={() => (dragOver = dragOver === tile.key ? null : dragOver)}
								ondrop={(e) => onTileDrop(e, tile.key)}
								ondragend={onTileDragEnd}
							>
								<button
									class="remove"
									type="button"
									disabled={busy}
									aria-label={`Remove photo ${tile.place}`}
									title="Remove photo"
									onclick={() => void remove(tile.key)}
								>
									<Icon name="close" size={14} />
								</button>
								<span class="place" aria-hidden="true">{tile.place}</span>
								<button
									class="open"
									type="button"
									aria-label={`Photo ${tile.place}: ${tile.label}.${tile.small ? ` ${tile.small}.` : ""} Open to change it`}
									onclick={() => openPhoto(tile.key)}
								>
									<img src={tile.thumb} alt="" loading="lazy" draggable="false" />
									{#if tile.small}
										<span class="size" aria-hidden="true"><Badge tone="warning" label="Small" title={tile.small} /></span>
									{/if}
									<span class="caption" class:muted={!tile.described}>
										{tile.label}
										{#if tile.board}<span class="board">{tile.board}</span>{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
					{#if dropping}
						<div class="drive-drop-veil" aria-hidden="true">
							<span>Drop to upload</span>
						</div>
					{/if}
				</div>
				{#snippet footer()}
					<p class="meta">{galleryFootnote(photos.length, phone.matches)}</p>
				{/snippet}
			</Card>

			<Card title="From events">
				<p class="hint">These are managed on each event's Images tab.</p>
				{#each sections as section (section.id)}
					<section class="event" aria-label={`Photos from ${section.name}`}>
						<div class="event-head">
							<h3 class="event-name">{section.name}</h3>
							<a class="event-link" href={section.href}>
								Images tab
								<Icon name="chevron-right" size={14} />
							</a>
						</div>
						{#if section.tiles.length}
							<ul class="gallery">
								{#each section.tiles as tile (tile.key)}
									<li class="tile">
										<a class="open" href={tile.full} target="_blank" rel="noreferrer" title="Open the photo in a new tab">
											<img src={tile.thumb} alt={tile.label} loading="lazy" />
										</a>
									</li>
								{/each}
							</ul>
						{/if}
						{#if section.more}<p class="meta more">{section.more}</p>{/if}
						{#if section.note}<p class="meta note">{section.note}</p>{/if}
					</section>
				{/each}
				{#snippet footer()}
					<p class="meta">{fromEventsFootnote(eventsOnPhotosPage(sections))}</p>
				{/snippet}
			</Card>
		</div>
	{/if}

	<BusyOverlay active={loading && loaded} label="Loading…" />
</div>

<Dialog
	open={open != null}
	sheet={phone.matches}
	title={openPlace >= 0 ? `Photo ${openPlace + 1} of ${photos.length}` : "Photo"}
	onclose={closeDialog}
>
	{#if open}
		<form id="photo-form" class="photo-form" novalidate onsubmit={saveWords}>
			<a class="preview" href={open.url} target="_blank" rel="noreferrer" title="Open the photo in a new tab">
				<img src={`${open.url}?w=900&auto=format`} alt={open.description || ""} />
			</a>
			<Field
				label="What it shows"
				for="photo-description"
				error={descriptionError}
				hint={`One line, read out to people who can't see the photo. Up to ${DESCRIPTION_MAX_LENGTH} characters.`}
			>
				<TextArea
					id="photo-description"
					bind:value={draftDescription}
					rows={2}
					placeholder="A blue spritz on the terrace rail, boats on the canal behind"
					oninput={() => (descriptionError = "")}
				/>
			</Field>
			<Field label="Pin it on home's menu" for="photo-menu" hint="The newest two on each board are pinned up beside its menu." width="md">
				<NativeSelect id="photo-menu" bind:value={draftMenu} options={MENU_OPTIONS} />
			</Field>
			<div class="moves" role="group" aria-label="Move the photo">
				<span class="moves-label">Move it</span>
				<Button
					variant="outline"
					size="sm"
					disabled={busy || openPlace <= 0}
					reason={openPlace <= 0 ? "It's first already" : undefined}
					onclick={() => move(open.key, "top")}
				>
					{#snippet icon()}<Icon name="chevron-up" size={14} />{/snippet}
					To the top
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={busy || openPlace <= 0}
					reason={openPlace <= 0 ? "It's first already" : undefined}
					onclick={() => move(open.key, "up")}
				>
					{#snippet icon()}<Icon name="chevron-left" size={14} />{/snippet}
					Earlier
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={busy || openPlace >= photos.length - 1}
					reason={openPlace >= photos.length - 1 ? "It's last already" : undefined}
					onclick={() => move(open.key, "down")}
				>
					{#snippet icon()}<Icon name="chevron-right" size={14} />{/snippet}
					Later
				</Button>
			</div>
			{#if dialogError}<p class="error" role="alert">{dialogError}</p>{/if}
		</form>
	{/if}
	{#snippet footer()}
		<Button
			variant="ghost"
			size="sm"
			type="button"
			class="remove-photo"
			disabled={busy || saving || !open}
			onclick={() => open && void remove(open.key)}
		>
			{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
			Remove photo
		</Button>
		<Button variant="ghost" size="sm" type="button" disabled={saving} onclick={closeDialog}>
			{#snippet icon()}<Icon name="close" size={14} />{/snippet}
			Cancel
		</Button>
		<Button
			variant="primary"
			size="sm"
			type="submit"
			form="photo-form"
			busy={saving}
			disabled={!draftDirty || saving}
		>
			{#snippet icon()}<Icon name="save" size={14} />{/snippet}
			Save
		</Button>
	{/snippet}
</Dialog>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.cards {
		display: grid;
		gap: var(--space-4);
		max-width: 64rem;
	}

	.hint,
	.meta {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.hint {
		margin-bottom: var(--space-3);
	}

	.error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--danger);
	}

	/* The tiles are the event Images tab's (events/tabs/GalleryTab.svelte). */
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: var(--space-3);
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
		z-index: 3;
		display: grid;
		place-content: center;
		pointer-events: none;
		border-radius: inherit;
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		color: var(--primary);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.tile {
		position: relative;
		aspect-ratio: 4 / 5;
		border-radius: var(--radius-xl);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--sunken);
		transition:
			opacity var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.tile[draggable="true"] {
		cursor: grab;
	}

	.tile.dragged {
		opacity: 0.45;
	}

	.tile.over {
		border-color: var(--primary);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent);
	}

	.tile.add {
		display: grid;
		place-content: center;
		height: 100%;
		cursor: pointer;
		background:
			radial-gradient(ellipse at 50% 30%, var(--primary-wash-strong), transparent 55%),
			var(--sunken);
	}

	.tile.add.disabled {
		cursor: progress;
	}

	.tile.add input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: inherit;
	}

	.photo-btn {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--control-h-sm);
		padding: 0 var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--card) 88%, transparent);
		color: var(--foreground);
		font-family: inherit;
		font-size: var(--text-base);
		font-weight: 500;
		line-height: 1;
		pointer-events: none;
		backdrop-filter: blur(8px);
	}

	.photo-btn.primary {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--primary-foreground);
	}

	.remove {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		z-index: 2;
		display: grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--card) 85%, transparent);
		color: var(--foreground);
		cursor: pointer;
		backdrop-filter: blur(6px);
	}

	.remove:hover:not(:disabled) {
		background: var(--destructive);
		color: var(--destructive-foreground);
	}

	.remove:disabled {
		cursor: progress;
		opacity: 0.6;
	}

	.place {
		position: absolute;
		top: 0.4rem;
		left: 0.4rem;
		z-index: 2;
		display: grid;
		place-items: center;
		min-width: 1.9rem;
		height: 1.9rem;
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--card) 85%, transparent);
		color: var(--foreground);
		font-size: var(--text-xs);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		pointer-events: none;
		backdrop-filter: blur(6px);
	}

	.open {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.tile[draggable="true"] .open {
		cursor: grab;
	}

	.open img {
		grid-area: 1 / 1;
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
		object-fit: cover;
		background: var(--bg);
		pointer-events: none;
	}

	/* Small: over the photo's bottom left, clear of the place and the cross.
	   The card behind keeps the badge's wash readable over the photo. */
	.size {
		grid-area: 1 / 1;
		align-self: end;
		justify-self: start;
		display: flex;
		max-width: calc(100% - 0.8rem);
		margin: 0.4rem;
		border-radius: var(--radius-sm);
		background: var(--card);
	}

	.caption {
		grid-area: 2 / 1;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		line-height: 1.35;
		color: var(--foreground);
		background: var(--card);
		border-top: 1px solid var(--border);
	}

	.caption.muted {
		color: var(--muted-foreground);
		font-style: italic;
	}

	.board {
		margin-left: var(--space-1);
		color: var(--primary);
		font-style: normal;
		font-weight: 600;
	}

	.board::before {
		content: "· ";
	}

	.event + .event {
		margin-top: var(--space-5);
	}

	.event-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.event-name {
		margin: 0;
		min-width: 0;
		overflow: hidden;
		font-size: var(--text-base);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.event-link {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--primary);
		text-decoration: none;
	}

	.event-link:hover {
		text-decoration: underline;
	}

	.meta.more,
	.meta.note {
		margin-top: var(--space-2);
	}

	.photo-form {
		display: grid;
		gap: var(--space-4);
	}

	.preview {
		display: block;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--sunken);
	}

	.preview img {
		display: block;
		width: 100%;
		max-height: 18rem;
		object-fit: contain;
	}

	.moves {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.moves-label {
		margin-right: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	:global(.remove-photo) {
		margin-right: auto;
	}
</style>
