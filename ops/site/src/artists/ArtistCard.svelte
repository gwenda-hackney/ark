<script lang="ts">
	import { onDestroy } from "svelte";
	import { Icon } from "../app/shell";
	import {
		Button,
		Confirm,
		ConfirmDialog,
		EditorActionBar,
		FormHeading,
		FormLead,
		FormSection,
		EditorBackBar,
		Field,
		FormErrors,
		NativeSelect,
		Segmented,
		TextArea,
		TextField,
	} from "../ui";
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
	} from "../app/api";
	import { leaveEditor, navigate } from "../app/nav";
	import { toast } from "../ui/toast.svelte";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../ui/unsaved.svelte";

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

	const monthOptions = [
		{ value: "", label: "Month" },
		{ value: "1", label: "January" },
		{ value: "2", label: "February" },
		{ value: "3", label: "March" },
		{ value: "4", label: "April" },
		{ value: "5", label: "May" },
		{ value: "6", label: "June" },
		{ value: "7", label: "July" },
		{ value: "8", label: "August" },
		{ value: "9", label: "September" },
		{ value: "10", label: "October" },
		{ value: "11", label: "November" },
		{ value: "12", label: "December" },
	];

	const confirm = new Confirm();
	const errors = new FormErrors();
	let saving = $state(false);
	let removing = $state(false);
	let uploading = $state("");
	let error = $state("");
	let persisted = $state<WallArtist | null>(null);
	let name = $state("");
	let artistName = $state("");
	let website = $state("");
	let profile = $state("");
	let bio = $state("");
	let startMonth = $state("");
	let endMonth = $state("");
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
			artistName !== (persisted?.artistName || "") ||
			website !== (persisted?.website || "") ||
			profile !== (persisted?.profile || "") ||
			bio !== (persisted?.bio || "") ||
			startMonth !== (persisted?.startMonth || "") ||
			endMonth !== (persisted?.endMonth || "") ||
			slot !== (persisted?.slot || "previous"),
	);

	const placeLabel = $derived(
		statusItems.find((item) => item.id === slot)?.label || "Artist",
	);

	$effect(() => {
		setUnsavedGuard(dirty, () => {
			const next = takeBlockedNav();
			if (!next) return;
			void confirm
				.ask({
					title: "Discard unsaved changes?",
					message: "You have edits that haven't been saved. They will be lost.",
					action: "Discard",
					cancel: "Keep editing",
				})
				.then((ok) => {
					if (!ok) return;
					beginLeave();
					navigate(next.path, { replace: next.replace, force: true });
				});
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
		errors.clearAll();
		persisted = row;
		name = row?.name || "";
		artistName = row?.artistName || "";
		website = row?.website || "";
		profile = row?.profile || "";
		bio = row?.bio || "";
		startMonth = row?.startMonth || "";
		endMonth = row?.endMonth || "";
		slot = row?.slot || "previous";
		portrait = row?.portrait || null;
		art = row?.art || [];
		gwenda = row?.gwenda || [];
	}

	function fail(err: unknown, fallback: string): string {
		const message = err instanceof Error ? err.message : fallback;
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
		errors.replace({ "artist-name": name.trim() ? "" : "Add their full name." });
		if (errors.count) {
			void errors.reveal();
			return;
		}
		saving = true;
		error = "";
		const body = {
			name: name.trim(),
			artistName: artistName.trim(),
			website: website.trim(),
			profile: profile.trim(),
			bio: bio.trim(),
			slot,
			startMonth,
			endMonth,
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
		const ok = await confirm.ask({
			title: `Delete ${label}?`,
			message: "Their page, photos and place on the wall go from the website. This can't be undone.",
			action: "Delete",
		});
		if (!ok) return;
		removing = true;
		error = "";
		try {
			await deleteArtist(persisted.id);
			beginLeave();
			toast.ok("Artist deleted.");
			navigate("/artists", { replace: true, force: true });
		} catch (err) {
			const message = fail(err, "Could not delete the artist.");
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

<form class="editor" novalidate onsubmit={onSave}>
	<EditorBackBar label="Artists" onback={close} />
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
					<h1 class="title-text" class:placeholder={!name.trim()}>{name.trim() || "New artist"}</h1>
				</div>
			</header>

			<div class="tab-scroll scrollbar-fade">
				<div class="tab-body">
					<div class="board">
						<FormLead asideWidth="16rem">
							{#snippet aside()}
								<FormHeading title="Profile photo" />
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
												{uploading === "portrait" ? "Uploading…" : persisted ? "Drop a photo here" : "No photo yet"}
											</span>
										</label>
									{/if}
									<!-- Always shown; unavailable ones are disabled with a reason. -->
									<div class="portrait-actions">
										<label
											class="pick-btn"
											class:disabled={!persisted || Boolean(uploading)}
											title={!persisted ? "Save the artist first" : uploading ? "Wait for the upload" : undefined}
										>
											<input
												class="sr-only"
												type="file"
												accept="image/jpeg,image/png,image/webp,image/gif"
												disabled={!persisted || Boolean(uploading)}
												onchange={(event) => onInput("portrait", event)}
											/>
											<Icon name="upload" size={14} />
											{portrait ? "Replace" : "Add photo"}
										</label>
										<Button
											variant="outline"
											size="sm"
											class="portrait-remove"
											disabled={!portrait || Boolean(uploading)}
											reason={!portrait ? "No photo to remove" : uploading ? "Wait for the upload" : undefined}
											onclick={() => onClearImage("portrait", portrait?.name || "")}
										>
											{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
											Remove
										</Button>
									</div>
								</section>
								<p class="photo-note">
									{persisted ? "The portrait at the top of their page." : "Save the artist first, then add photos."}
								</p>
							{/snippet}

							<FormHeading class="lead-first" title="Artist" />
								<Field
									class="lead-first"
									label="Full name"
									for="artist-name"
									error={errors.get("artist-name")}
								>
									<TextField
										id="artist-name"
										size="sm"
										autocomplete="off"
										placeholder="Ada Lovelace"
										oninput={() => errors.clear("artist-name")}
										bind:value={name}
									/>
								</Field>
								<Field
									class="span-6"
									label="Artist name"
									for="artist-short-name"
									optional
									hint="The first name in From on their page. Blank uses the first word of the full name."
								>
									<TextField
										id="artist-short-name"
										size="sm"
										bind:value={artistName}
										placeholder={name.trim().split(/\s+/)[0] || "First name"}
										autocomplete="off"
									/>
								</Field>
								<div class="website span-6">
									<Field label="Website" for="artist-website" optional hint="A link to their own site.">
										<TextField
											id="artist-website"
											size="sm"
											type="url"
											inputmode="url"
											spellcheck="false"
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

							<FormHeading
								ruled
								title="On the wall"
								description="Their place in the line-up, and the months under their name on the home page."
							/>
								<Field
									class="span-5"
									label="Place"
									tooltip="Current is on the wall. Next is lined up. Previous has already hung here. Only one current and one next: saving that badge moves the artist who had it to previous."
								>
									<Segmented bind:value={slot} items={statusItems} ariaLabel="Place on the wall" size="sm" />
								</Field>
								<Field class="span-7" label="Months" optional hint="Shown as Sept to Oct.">
									<div class="months">
										<NativeSelect
											id="artist-start-month"
											aria-label="From"
											bind:value={startMonth}
											options={monthOptions}
											size="sm"
										/>
										<span class="months-to" aria-hidden="true">to</span>
										<NativeSelect
											id="artist-end-month"
											aria-label="To"
											bind:value={endMonth}
											options={monthOptions}
											size="sm"
										/>
									</div>
								</Field>
						</FormLead>

						<FormSection title="Their page" class="sec-page">
								<Field class="span-5" label="Profile" for="artist-profile" optional hint="A short introduction, above the longer bio.">
									<TextArea id="artist-profile" rows={6} bind:value={profile} placeholder="Who they are, in a few lines." />
								</Field>
								<Field class="span-7" label="Bio" for="artist-bio" optional hint="The longer note on their page.">
									<TextArea id="artist-bio" rows={6} bind:value={bio} placeholder="The fuller story." />
								</Field>
						</FormSection>

						<FormSection title="Work" class="sec-work" description="Their art, shown on the website.">
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
						</FormSection>

						<FormSection title="At Gwenda" class="sec-gwenda" description="Photos taken here, kept apart from their own art.">
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
						</FormSection>
					</div>
					{#if error}
						<p class="error">{error}</p>
					{/if}
				</div>
			</div>

			<EditorActionBar
				saveLabel={persisted ? "Save artist" : "Add artist"}
				{saving}
				disabled={!dirty || Boolean(uploading) || removing}
				{dirty}
				errorCount={errors.count}
				onerrors={() => void errors.reveal()}
				overflow={persisted
					? [
							{
								label: "Delete artist",
								tone: "destructive",
								disabled: removing || saving || Boolean(uploading),
								onselect: () => void onRemove(),
							},
						]
					: []}
			/>
		</div>
	</div>
	<ConfirmDialog {confirm} />
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
		padding: var(--space-4) var(--page-gutter) var(--space-4);
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
		column-gap: var(--space-3);
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
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.head-tools {
		display: flex;
		justify-self: end;
		height: var(--control-h-sm);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.title-text {
		margin: 0;
		min-width: 0;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.title-text.placeholder {
		color: var(--muted-foreground);
	}

	/* Section cards sit on the page colour, so each group reads as one block. */
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

	.board {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-content: start;
		min-width: 0;
	}

	.photo-note {
		margin: 0;
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
		color: var(--fg-subtle);
	}

	.website {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.months {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2);
	}

	.months-to {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
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
		gap: var(--space-2);
	}

	.portrait-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	/* The file picker is a label; it matches the outline sm Button beside it. */
	.pick-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--button-h-sm);
		padding: 0 var(--space-3) 0 var(--space-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}

	.pick-btn:hover:not(.disabled) {
		background: var(--accent);
	}

	.pick-btn:focus-within {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.pick-btn.disabled {
		border-color: transparent;
		background: var(--surface-3);
		color: var(--fg-subtle);
		cursor: not-allowed;
	}

	:global(.portrait-remove:hover:not(:disabled, [aria-disabled="true"])) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.portrait-frame,
	.empty {
		width: 100%;
		aspect-ratio: 4 / 5;
		border-radius: var(--radius-md);
		background: transparent;
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
		border: 1px dashed var(--border-strong);
		background: transparent;
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
		gap: var(--space-3);
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
		background: var(--bg);
	}

	.caption {
		padding: var(--space-1) var(--space-2) var(--space-2);
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
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		color: var(--fg);
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
		gap: var(--space-2);
		height: var(--control-h-sm);
		padding: 0 var(--space-4);
		border: 1px solid var(--primary);
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: var(--text-base);
		font-weight: 500;
		pointer-events: none;
	}

	.error {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--danger);
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX: edge to edge, like the other editors. */
	@media (max-width: 900px) {
		.split {
			padding: 0;
		}

		.panel {
			border-radius: 0;
			border-left: none;
			border-right: none;
		}

		.tab-body {
			padding: var(--space-4) max(var(--page-gutter), 1.125rem);
		}
	}
</style>
