<script lang="ts">
	import { onDestroy } from "svelte";
	import { Icon } from "../../shell";
	import { Button, EditorBackBar, Field, Segmented, TextArea, TextField, Tip } from "../../ui";
	import {
		clearArtistImage,
		createArtist,
		deleteArtist,
		getArtist,
		updateArtist,
		uploadArtistImage,
		type ArtistImage,
		type ArtistSlot,
		type WallArtist,
	} from "../../lib/api";
	import { leaveEditor, navigate } from "../../lib/nav";
	import { toast } from "../../lib/toast.svelte";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../../lib/unsaved.svelte";

	let {
		artist = null,
		onCreated,
	}: {
		artist?: WallArtist | null;
		onCreated?: (artist: WallArtist) => void;
	} = $props();

	const statusItems = [
		{ id: "current", label: "Current" },
		{ id: "next", label: "Next" },
		{ id: "previous", label: "Previous" },
	];

	let saving = $state(false);
	let removing = $state(false);
	let uploading = $state("");
	let error = $state("");
	let persisted = $state<WallArtist | null>(null);
	let name = $state("");
	let website = $state("");
	let profile = $state("");
	let bio = $state("");
	let slot = $state<ArtistSlot>("previous");
	let portrait = $state<ArtistImage | null>(null);
	let art = $state<ArtistImage[]>([]);
	let gwenda = $state<ArtistImage[]>([]);
	let seenId = "";
	let seenImages = "";
	let refreshed = "";
	let dropping = $state("");

	$effect(() => {
		const id = artist?.id;
		if (!id || refreshed === id) return;
		refreshed = id;
		let cancelled = false;
		void getArtist(id)
			.then((data) => {
				if (cancelled || data.artist.id !== id) return;
				portrait = data.artist.portrait;
				art = data.artist.art || [];
				gwenda = data.artist.gwenda || [];
				seenImages = imageSig(data.artist);
				if (persisted?.id === id) {
					persisted = {
						...persisted,
						portrait: data.artist.portrait,
						art: data.artist.art || [],
						gwenda: data.artist.gwenda || [],
					};
				}
			})
			.catch(() => {
				/* The form already has the artist the page loaded. */
			});
		return () => {
			cancelled = true;
		};
	});

	$effect.pre(() => {
		const row = artist ?? null;
		const id = row?.id || "new";
		const images = imageSig(row);
		if (id !== seenId) {
			seenId = id;
			seenImages = images;
			apply(row);
			return;
		}
		if (images === seenImages || !row) return;
		seenImages = images;
		portrait = row.portrait;
		art = row.art || [];
		gwenda = row.gwenda || [];
		if (persisted) {
			persisted = {
				...persisted,
				portrait: row.portrait,
				art: row.art || [],
				gwenda: row.gwenda || [],
			};
		}
	});

	const dirty = $derived(
		name !== (persisted?.name || "") ||
			website !== (persisted?.website || "") ||
			profile !== (persisted?.profile || "") ||
			bio !== (persisted?.bio || "") ||
			slot !== (persisted?.slot || "previous"),
	);

	const placeLabel = $derived(
		statusItems.find((item) => item.id === slot)?.label || "Artist",
	);

	$effect(() => {
		setUnsavedGuard(dirty, () => {
			const next = takeBlockedNav();
			if (!next) return;
			if (!window.confirm("Leave without saving?")) return;
			beginLeave();
			navigate(next.path, { replace: next.replace, force: true });
		});
	});

	onDestroy(() => {
		clearUnsavedGuard();
	});

	function imageSig(row: WallArtist | null): string {
		if (!row) return "";
		return [
			row.portrait?.name || "",
			(row.art || []).map((image) => image.name).join(","),
			(row.gwenda || []).map((image) => image.name).join(","),
		].join("|");
	}

	function apply(row: WallArtist | null) {
		persisted = row;
		name = row?.name || "";
		website = row?.website || "";
		profile = row?.profile || "";
		bio = row?.bio || "";
		slot = row?.slot || "previous";
		portrait = row?.portrait || null;
		art = row?.art || [];
		gwenda = row?.gwenda || [];
	}

	function fail(err: unknown, fallback: string): string {
		const message = err instanceof Error ? err.message : fallback;
		if (message.startsWith("auth:")) {
			window.location.href = message.slice("auth:".length) || "/gate/";
			return "";
		}
		return message;
	}

	function hostLabel(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./i, "");
		} catch {
			return url;
		}
	}

	function imageLabel(image: ArtistImage): string {
		return (image.label || "").replace(/\.[a-z0-9]+$/i, "");
	}

	function close() {
		leaveEditor("/artists");
	}

	async function onSave(event: Event) {
		event.preventDefault();
		saving = true;
		error = "";
		const body = {
			name: name.trim(),
			website: website.trim(),
			profile: profile.trim(),
			bio: bio.trim(),
			slot,
		};
		try {
			if (persisted) {
				const data = await updateArtist(persisted.id, body);
				apply(data.artist);
				seenId = data.artist.id;
				seenImages = imageSig(data.artist);
				toast.ok("Artist saved.");
			} else {
				const data = await createArtist(body);
				apply(data.artist);
				seenId = data.artist.id;
				seenImages = imageSig(data.artist);
				toast.ok("Artist added.");
				beginLeave();
				onCreated?.(data.artist);
			}
		} catch (err) {
			const message = fail(err, "Could not save the artist.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			saving = false;
		}
	}

	async function onRemove() {
		if (!persisted) return;
		const label = persisted.name || "this artist";
		if (!window.confirm(`Remove ${label}?`)) return;
		removing = true;
		error = "";
		try {
			await deleteArtist(persisted.id);
			beginLeave();
			toast.ok("Artist removed.");
			navigate("/artists", { replace: true, force: true });
		} catch (err) {
			const message = fail(err, "Could not remove the artist.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			removing = false;
		}
	}

	async function onFiles(kind: "portrait" | "art" | "gwenda", files: File[]) {
		if (!files.length || !persisted) return;
		uploading = kind;
		error = "";
		try {
			let latest = persisted;
			for (const file of files) {
				const data = await uploadArtistImage(persisted.id, file, kind);
				latest = data.artist;
			}
			apply(latest);
			seenImages = imageSig(latest);
			toast.ok(files.length === 1 ? "Photo added." : `${files.length} photos added.`);
		} catch (err) {
			const message = fail(err, "Could not add the photo.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			uploading = "";
		}
	}

	function onInput(kind: "portrait" | "art" | "gwenda", event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files || [])];
		input.value = "";
		void onFiles(kind, files);
	}

	function onDragEnter(kind: string, event: DragEvent) {
		event.preventDefault();
		if (!persisted || uploading) return;
		if (event.dataTransfer?.types.includes("Files")) dropping = kind;
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
	}

	function onDragLeave(kind: string, event: DragEvent) {
		event.preventDefault();
		const next = event.relatedTarget as Node | null;
		if (next && (event.currentTarget as Node).contains(next)) return;
		if (dropping === kind) dropping = "";
	}

	function onDrop(kind: "portrait" | "art" | "gwenda", event: DragEvent) {
		event.preventDefault();
		dropping = "";
		if (!persisted || uploading) return;
		const files = [...(event.dataTransfer?.files || [])].filter((file) =>
			file.type.startsWith("image/"),
		);
		void onFiles(kind, kind === "portrait" ? files.slice(0, 1) : files);
	}

	async function onClearImage(kind: "portrait" | "art" | "gwenda", imageName = "") {
		if (!persisted) return;
		uploading = kind;
		error = "";
		try {
			const data = await clearArtistImage(persisted.id, kind, imageName);
			apply(data.artist);
			seenImages = imageSig(data.artist);
			toast.ok("Photo removed.");
		} catch (err) {
			const message = fail(err, "Could not remove the photo.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			uploading = "";
		}
	}
</script>

<form class="editor" onsubmit={onSave}>
	<EditorBackBar label="Artists" {dirty} onback={close} />
	<div class="split">
		<div class="panel" class:dirty>
			<header class="panel-head">
				<div class="type-line">
					<p class="eyebrow">{placeLabel}</p>
				</div>
				<div class="head-tools">
					<Button
						class="close-btn"
						variant="ghost"
						size="sm"
						type="button"
						aria-label={dirty ? "Close with unsaved changes" : "Close"}
						title={dirty ? "Close (unsaved)" : "Close"}
						onclick={close}
					>
						{#snippet icon()}
							<Icon name="close" size={16} />
						{/snippet}
					</Button>
				</div>
				<div class="title-name">
					<input
						class="title-input"
						id="artist-name"
						required
						autocomplete="off"
						aria-label="Artist name"
						placeholder="Artist name"
						bind:value={name}
					/>
				</div>
			</header>

			<div class="tab-scroll scrollbar-fade">
				<div class="tab-body">
					<section class="details-board">
						<div class="details-main">
							<div class="control-grid">
								<Field
									label="Place"
									tooltip="Current is on the wall. Next is lined up. Previous has already hung here. Only one current and one next: saving that badge moves the artist who had it to previous."
								>
									<Segmented
										bind:value={slot}
										items={statusItems}
										ariaLabel="Place on the wall"
										size="sm"
									/>
								</Field>
								<div class="website">
									<Field label="Website" for="artist-website" tooltip="A link to their own site.">
										<TextField
											id="artist-website"
											size="sm"
											bind:value={website}
											placeholder="https://"
											autocomplete="url"
										/>
									</Field>
									{#if website.trim()}
										<p class="site">
											<a href={website.trim()} target="_blank" rel="noreferrer">
												{hostLabel(website.trim())}
											</a>
										</p>
									{/if}
								</div>
								<Field
									class="span-all"
									label="Profile"
									for="artist-profile"
									tooltip="A short introduction. This sits above the longer bio on the website."
								>
									<TextArea
										id="artist-profile"
										rows={3}
										bind:value={profile}
										placeholder="Who they are, in a few lines."
									/>
								</Field>
								<Field
									class="span-all"
									label="Bio"
									for="artist-bio"
									tooltip="The longer note on their page."
								>
									<TextArea
										id="artist-bio"
										rows={6}
										bind:value={bio}
										placeholder="The fuller story."
									/>
								</Field>
							</div>
						</div>

						<aside class="details-side">
							{#if !persisted}
								<p class="hint">Save before adding a photo.</p>
							{/if}
							<section
								class="portrait"
								class:dropping={dropping === "portrait"}
								role="group"
								aria-label="Profile photo"
								ondragenter={(event) => onDragEnter("portrait", event)}
								ondragover={onDragOver}
								ondragleave={(event) => onDragLeave("portrait", event)}
								ondrop={(event) => onDrop("portrait", event)}
							>
								<header class="portrait-head">
									<h2 class="section-title bare">
										Profile photo
										<Tip
											label="Profile photo"
											tooltip="The portrait at the top of their page."
										/>
									</h2>
									{#if persisted && portrait}
										<div class="portrait-actions">
											<label class="pick">
												<input
													class="sr-only"
													type="file"
													accept="image/jpeg,image/png,image/webp,image/gif"
													disabled={Boolean(uploading)}
													onchange={(event) => onInput("portrait", event)}
												/>
												<span class="pick-btn">Replace</span>
											</label>
											<button
												class="pick-btn remove"
												type="button"
												disabled={Boolean(uploading)}
												onclick={() => onClearImage("portrait", portrait?.name || "")}
											>
												Remove
											</button>
										</div>
									{/if}
								</header>
								{#if portrait}
									<figure class="portrait-frame">
										<img src={portrait.url || portrait.thumb} alt="" />
									</figure>
								{:else}
									<label class="empty">
										<input
											class="sr-only"
											type="file"
											accept="image/jpeg,image/png,image/webp,image/gif"
											disabled={!persisted || Boolean(uploading)}
											onchange={(event) => onInput("portrait", event)}
										/>
										<span class="empty-label">
											{uploading === "portrait" ? "Uploading…" : "Add photo"}
										</span>
									</label>
								{/if}
							</section>
						</aside>

						<section class="gallery-block">
							<h2 class="section-title">
								<span class="section-label">
									Work
									<Tip label="Work" tooltip="Their art, shown on the website." />
								</span>
							</h2>
							<div
								class="drop"
								class:dragging={dropping === "art"}
								class:busy={uploading === "art"}
								role="group"
								aria-label="Work"
								ondragenter={(event) => onDragEnter("art", event)}
								ondragover={onDragOver}
								ondragleave={(event) => onDragLeave("art", event)}
								ondrop={(event) => onDrop("art", event)}
							>
								<ul class="gallery">
									{#each art as image (image.name)}
										<li class="tile">
											<img src={image.url || image.thumb} alt={imageLabel(image)} />
											{#if imageLabel(image)}
												<span class="caption">{imageLabel(image)}</span>
											{/if}
											<button
												class="tile-remove"
												type="button"
												disabled={Boolean(uploading)}
												aria-label="Remove {imageLabel(image) || 'artwork'}"
												onclick={() => onClearImage("art", image.name)}
											>
												<Icon name="close" size={12} />
											</button>
										</li>
									{/each}
									<li>
										<label class="tile add">
											<span class="photo-btn primary">
												<Icon name="upload" size={16} />
												{uploading === "art" ? "Uploading…" : "Add images"}
											</span>
											<input
												type="file"
												accept="image/jpeg,image/png,image/webp,image/gif"
												multiple
												disabled={!persisted || Boolean(uploading)}
												onchange={(event) => onInput("art", event)}
											/>
										</label>
									</li>
								</ul>
								{#if dropping === "art"}
									<div class="drop-veil" aria-hidden="true"><span>Drop to upload</span></div>
								{/if}
							</div>
						</section>

						<section class="gallery-block">
							<h2 class="section-title">
								<span class="section-label">
									At Gwenda
									<Tip
										label="At Gwenda"
										tooltip="Photos taken at Gwenda. These are separate from their own art."
									/>
								</span>
							</h2>
							<div
								class="drop"
								class:dragging={dropping === "gwenda"}
								class:busy={uploading === "gwenda"}
								role="group"
								aria-label="Photos from Gwenda"
								ondragenter={(event) => onDragEnter("gwenda", event)}
								ondragover={onDragOver}
								ondragleave={(event) => onDragLeave("gwenda", event)}
								ondrop={(event) => onDrop("gwenda", event)}
							>
								<ul class="gallery">
									{#each gwenda as image (image.name)}
										<li class="tile">
											<img src={image.url || image.thumb} alt={imageLabel(image) || "At Gwenda"} />
											{#if imageLabel(image)}
												<span class="caption">{imageLabel(image)}</span>
											{/if}
											<button
												class="tile-remove"
												type="button"
												disabled={Boolean(uploading)}
												aria-label="Remove {imageLabel(image) || 'Gwenda photo'}"
												onclick={() => onClearImage("gwenda", image.name)}
											>
												<Icon name="close" size={12} />
											</button>
										</li>
									{/each}
									<li>
										<label class="tile add">
											<span class="photo-btn primary">
												<Icon name="upload" size={16} />
												{uploading === "gwenda" ? "Uploading…" : "Add images"}
											</span>
											<input
												type="file"
												accept="image/jpeg,image/png,image/webp,image/gif"
												multiple
												disabled={!persisted || Boolean(uploading)}
												onchange={(event) => onInput("gwenda", event)}
											/>
										</label>
									</li>
								</ul>
								{#if dropping === "gwenda"}
									<div class="drop-veil" aria-hidden="true"><span>Drop to upload</span></div>
								{/if}
							</div>
						</section>
					</section>
					{#if !persisted}
						<p class="hint">Save the name first, then add photos.</p>
					{/if}
					{#if error}
						<p class="error">{error}</p>
					{/if}
				</div>
			</div>

			<footer class="panel-foot">
				{#if persisted}
					<Button
						class="delete-btn"
						variant="destructive"
						size="sm"
						type="button"
						disabled={removing || saving || Boolean(uploading)}
						onclick={onRemove}
					>
						Remove
					</Button>
				{/if}
				<Button
					variant="primary"
					size="sm"
					type="submit"
					busy={saving}
					disabled={!dirty || saving || Boolean(uploading)}
				>
					{#snippet icon()}
						<Icon name="save" />
					{/snippet}
					{saving ? "Saving…" : "Save"}
				</Button>
			</footer>
		</div>
	</div>
</form>

<style>
	.editor {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		background: var(--background);
	}

	.split {
		display: grid;
		flex: 1;
		min-height: 0;
		height: 100%;
		padding: var(--gap) var(--page-gutter) var(--gap);
	}

	.panel {
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
		display: flex;
		align-items: center;
		min-width: 0;
		height: var(--control-h-sm);
	}

	.eyebrow {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.head-tools {
		display: flex;
		justify-self: end;
		height: var(--control-h-sm);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
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

	.tab-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}

	.tab-body {
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
		container-type: inline-size;
		container-name: artist-detail;
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
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.8rem 0.7rem;
		align-items: start;
	}

	.control-grid > :global(.span-all),
	.gallery-block {
		grid-column: 1 / -1;
	}

	.website {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.site {
		margin: -0.35rem 0 0;
		font-size: var(--text-sm);
	}

	.site a {
		color: var(--primary);
		font-weight: 600;
		text-decoration: none;
	}

	.site a:hover {
		text-decoration: underline;
	}

	.portrait {
		display: grid;
		gap: 0.75rem;
	}

	.portrait-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
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

	.section-title.bare {
		margin: 0;
		flex: 1;
	}

	.section-title:not(.bare)::after {
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

	.portrait-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.pick {
		display: inline-flex;
		cursor: pointer;
	}

	.pick-btn {
		display: inline-flex;
		align-items: center;
		height: var(--control-h-sm);
		padding: 0 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.35rem;
		background: var(--surface);
		color: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.pick-btn.remove:hover:not(:disabled) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.pick-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.portrait-frame,
	.empty {
		width: 100%;
		aspect-ratio: 4 / 5;
		border-radius: 0.4rem;
		background: #0d0d0d;
	}

	.portrait-frame {
		margin: 0;
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.portrait-frame img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.empty {
		display: grid;
		place-items: center;
		border: 1px dashed var(--border);
		background: var(--surface);
		cursor: pointer;
	}

	.empty:hover {
		border-color: var(--border-strong, var(--border));
	}

	.empty-label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.gallery-block {
		display: grid;
		gap: 0.85rem;
	}

	.drop {
		position: relative;
		min-height: 8rem;
		border-radius: var(--radius-lg);
		border: 1px dashed transparent;
	}

	.drop.dragging {
		border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	.drop.busy {
		opacity: 0.85;
	}

	.drop-veil {
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
	}

	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 0.75rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.tile,
	.tile.add {
		position: relative;
		display: grid;
		grid-template-rows: 1fr auto;
		aspect-ratio: 4 / 5;
		border-radius: var(--radius-xl);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--sunken);
	}

	.tile.add {
		display: grid;
		place-content: center;
		cursor: pointer;
		background:
			radial-gradient(ellipse at 50% 30%, var(--primary-wash-strong), transparent 55%),
			var(--sunken);
	}

	.tile img {
		width: 100%;
		height: 100%;
		min-height: 0;
		object-fit: contain;
		background: #0d0d0d;
	}

	.caption {
		padding: 0.35rem 0.45rem 0.45rem;
		font-size: var(--text-xs);
		line-height: 1.3;
		color: var(--muted-foreground);
		background: var(--card);
	}

	.tile-remove {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, #0d0d0d 72%, transparent);
		color: #e8e4dc;
		cursor: pointer;
	}

	.tile-remove:hover:not(:disabled) {
		background: var(--destructive);
	}

	.tile.add input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}

	.photo-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		height: var(--control-h-sm);
		padding: 0 0.95rem;
		border: 1px solid var(--primary);
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: var(--text);
		font-weight: 500;
		pointer-events: none;
	}

	.hint,
	.error {
		margin: 0.75rem 0 0;
		font-size: var(--text-sm);
	}

	.hint {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive, #c97a7a);
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

	@container artist-detail (min-width: 52rem) {
		.details-board {
			grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.8fr);
		}

		.details-side {
			order: 0;
		}

		.control-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
</style>
