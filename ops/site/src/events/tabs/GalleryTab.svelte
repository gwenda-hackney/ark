<script lang="ts">
	import { Icon } from "../../app/shell";
	import { HelpTip } from "../../ui";
	import { eventDriveFileUrl } from "../../app/api";
	import type { EventGallery } from "../event-gallery.svelte";

	let {
		gallery,
		eventId,
		busy,
	}: {
		gallery: EventGallery;
		eventId: string;
		busy: boolean;
	} = $props();

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
					rel="noreferrer">Open gallery</a
				>
			{/if}
		</div>
		{#if gallery.error}
			<p class="error">{gallery.error}</p>
		{/if}
		{#if gallery.outsideGallery > 0}
			<p class="hint">
				{gallery.outsideGallery === 1
					? "1 image is in the event folder, outside the gallery, so it is not shown here."
					: `${gallery.outsideGallery} images are in the event folder, outside the gallery, so they are not shown here.`}
			</p>
		{/if}
		<div
			class="drive-drop"
			role="group"
			aria-label="Drop images here to add them to the gallery"
			class:dragging={dragging}
			class:busy={gallery.loading || gallery.uploading}
			ondragenter={onDragEnter}
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={onDrop}
		>
			{#if gallery.loading && !gallery.files.length}
				<p class="hint">Loading…</p>
			{:else}
				<ul class="gallery">
					{#each gallery.files as image (image.id)}
						<li class="tile">
							<button
								class="remove"
								type="button"
								disabled={busy}
								aria-label={`Remove ${image.name}`}
								title="Remove photo"
								onclick={() => void gallery.remove(eventId, image.id)}
							>
								<Icon name="close" size={14} />
							</button>
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
			{/if}
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

	.tile img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
