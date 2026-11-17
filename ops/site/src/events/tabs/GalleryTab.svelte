<script lang="ts">
	import { kitchenColourStyle } from "../../../../../marketing/web/src/lib/kitchen-colour.js";
	import { Icon } from "../../app/shell";
	import { Badge, Button, HelpTip, PhotoActions } from "../../ui";
	import type { EventGallery } from "../event-gallery.svelte";

	let {
		gallery,
		eventId,
		busy,
		logo = null,
		onpicklogo = () => {},
		onclearlogo = () => {},
		name = "",
		colour = "",
		oncolour = () => {},
	}: {
		gallery: EventGallery;
		eventId: string;
		busy: boolean;
		/**
		 * A pop-up kitchen's logo slot (#296), above the gallery: its address,
		 * "" while it has none. null for a series with no logo (CATEGORY_FIELDS).
		 */
		logo?: { url: string } | null;
		onpicklogo?: (file: File | undefined | null) => void;
		onclearlogo?: () => void;
		/** The kitchen's name, for the colour's preview. */
		name?: string;
		/** Its own colour (#319), beside the logo: "#0f4d32", or "" for none (our red). */
		colour?: string;
		/** Save a colour as soon as it's picked or typed; "" takes it off. */
		oncolour?: (hex: string) => void;
	} = $props();

	/** Our red, which the website uses for a kitchen with no colour of its own. */
	const OUR_RED = "#e4513f";
	/** The name and tag as the website shows them on our dark board (lib/kitchen-colour.js). */
	const colourPreview = $derived(kitchenColourStyle(colour));

	function onColourInput(e: Event) {
		oncolour((e.currentTarget as HTMLInputElement).value.trim());
	}

	/** The logo whole, as the website shows it: no crop. */
	const logoThumb = $derived(logo?.url ? `${logo.url}?w=480&auto=format` : "");

	function onLogoInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		onpicklogo(file);
	}

	let dragging = $state(false);
	let dragDepth = 0;

	async function onInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files || [])];
		input.value = "";
		await gallery.upload(eventId, files);
	}

	function onDragEnter(e: DragEvent) {
		e.preventDefault();
		dragDepth += 1;
		if (e.dataTransfer?.types.includes("Files")) dragging = true;
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	}

	function onDragLeave(e: DragEvent) {
		e.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragging = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragDepth = 0;
		dragging = false;
		void gallery.upload(eventId, [...(e.dataTransfer?.files || [])]);
	}
</script>

<section class="block">
	{#if !eventId}
		<p class="hint">Save before adding images.</p>
	{:else}
		{#if logo}
			<div class="drive-head logo-head">
				<h2 class="section-title">
					<span class="section-label">Logo</span>
				</h2>
				<!-- Replace and remove on the heading's row, as the photo on Details has them. -->
				<PhotoActions
					take={{ disabled: busy }}
					replace={{ disabled: busy }}
					remove={{ disabled: busy || !logo.url, reason: logo.url ? "" : "No logo yet" }}
					download={logo.url || null}
					onfile={onLogoInput}
					onremove={onclearlogo}
				/>
			</div>
			<p class="hint">
				Their logo goes at the top of the Food board on home, on their card in What's on and on their page.
				Their Instagram goes on Details.
			</p>
			<div class="gallery">
				{#if logo.url}
					<a class="tile logo" href={logo.url} target="_blank" rel="noreferrer" title="Logo">
						<img src={logoThumb} alt="Logo" />
					</a>
				{:else}
					<label class="tile add">
						<span class="photo-btn primary">
							<Icon name="upload" size={16} />
							Add logo
						</span>
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							disabled={busy}
							onchange={onLogoInput}
						/>
					</label>
				{/if}
			</div>
			<div class="drive-head colour-head">
				<h2 class="section-title">
					<span class="section-label">Colour</span>
				</h2>
				<Button
					variant="ghost"
					size="sm"
					type="button"
					disabled={busy || !colour}
					reason={colour ? "" : "No colour yet"}
					onclick={() => oncolour("")}
				>
					Use our red
				</Button>
			</div>
			<p class="hint">
				Their name and their day tag on the website take it. Text is lightened just enough to read on our
				dark boards.
			</p>
			<div class="colour-row">
				<input
					class="colour-pick"
					type="color"
					value={colour || OUR_RED}
					disabled={busy}
					aria-label="Pick their colour"
					onchange={onColourInput}
				/>
				<input
					class="colour-hex"
					type="text"
					value={colour}
					placeholder="#0f4d32"
					spellcheck="false"
					disabled={busy}
					aria-label="Their colour as a hex value"
					onchange={onColourInput}
				/>
				<div class="colour-preview" style={colourPreview} aria-label="How it looks on the website">
					<span class="colour-tag">Tonight</span>
					<span class="colour-name">{name || "Their name"}</span>
				</div>
			</div>
		{/if}
		<div class="drive-head">
			<h2 class="section-title">
				<span class="section-label">
					Gallery
					<HelpTip label="Gallery" topic="Gallery" />
				</span>
			</h2>
			{#if gallery.folderUrl}
				<a
					class="drive-link"
					href={gallery.folderUrl}
					target="_blank"
					rel="noreferrer"
					title="Copies of the event's photos for collaborators, in its website images folder"
					>Open in Drive</a
				>
			{/if}
		</div>
		<p class="hint">
			These photos show on the event's page and in the main photo gallery on the website.
			Photos only, not flyers: the flyer goes on Details.
		</p>
		{#if gallery.error}
			<p class="error">{gallery.error}</p>
		{/if}
		<div
			class="drive-drop"
			role="group"
			aria-label="Drop images here to add them to the gallery"
			class:dragging={dragging}
			class:busy={gallery.uploading}
			ondragenter={onDragEnter}
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={onDrop}
		>
			<ul class="gallery">
				{#each gallery.tiles as image (image.key)}
					<li class="tile">
						<button
							class="remove"
							type="button"
							disabled={busy}
							aria-label={`Remove ${image.name}`}
							title="Remove photo"
							onclick={() => void gallery.remove(eventId, image.key)}
						>
							<Icon name="close" size={14} />
						</button>
						<a
							href={image.full}
							target="_blank"
							rel="noreferrer"
							title={image.name}
						>
							<img
								src={image.thumb}
								alt={image.name}
								loading="lazy"
							/>
						</a>
						{#if image.small}
							<span class="size">
								<Badge tone="warning" title={image.small}
									>Too small<span class="sr-only">: {image.small}</span></Badge
								>
							</span>
						{/if}
					</li>
				{/each}
				<li>
					<label class="tile add">
						<span class="photo-btn primary">
							<Icon name="upload" size={16} />
							{gallery.uploading ? "Uploading…" : "Add images"}
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
			</ul>
			{#if dragging}
				<div class="drive-drop-veil" aria-hidden="true">
					<span>Drop to upload</span>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.hint {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.tile {
		position: relative;
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

	.remove:hover {
		background: var(--destructive);
		color: var(--destructive-foreground);
	}

	/* Too small for the Photos page: bottom left, clear of the cross. The card
	   behind keeps the badge's wash readable over the photo. */
	.size {
		position: absolute;
		left: 0.4rem;
		bottom: 0.4rem;
		z-index: 2;
		display: flex;
		max-width: calc(100% - 0.8rem);
		border-radius: var(--radius-sm);
		background: var(--card);
		cursor: help;
	}

	.tile img {
		flex: 1;
		min-height: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
		display: block;
		background: var(--bg);
		pointer-events: none;
	}

	.tile.add {
		background:
			radial-gradient(ellipse at 50% 30%, var(--primary-wash-strong), transparent 55%),
			var(--sunken);
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

	.block {
		display: grid;
		gap: var(--space-3);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: var(--space-2) 0 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
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
		gap: var(--space-1);
	}

	.hint, .error {
		margin: 0;
	}

	.error {
		color: var(--destructive);
	}

	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: var(--space-3);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.drive-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
		margin-top: var(--space-5);
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
	}

	.tile, .tile.add {
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

	/* The logo slot comes first: no gap above it. */
	.drive-head.logo-head {
		margin-top: 0;
	}

	/* The colour, under the logo: a picker, its hex, and how the website shows it. */
	.colour-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.colour-pick {
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: 1px solid var(--border, #ccc);
		border-radius: var(--radius-sm, 6px);
		background: none;
		cursor: pointer;
	}

	.colour-hex {
		width: 8rem;
		font-family: var(--font-mono, monospace);
	}

	/* The website's dark board, its name in the readable tint, its tag filled: no colour is our red */
	.colour-preview {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm, 6px);
		background: #1a1510;
	}

	.colour-name {
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--kitchen-ink, #e4513f);
	}

	.colour-tag {
		padding: 0.125rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: var(--kitchen-fill, #b3161d);
		color: var(--kitchen-on-fill, #f2e8d2);
	}

	/* A logo is shown whole on white, as the website shows it. */
	.tile.logo {
		display: block;
		background: #fff;
	}

	.tile.logo img {
		object-fit: contain;
		padding: var(--space-3);
		box-sizing: border-box;
	}

	.tile img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
