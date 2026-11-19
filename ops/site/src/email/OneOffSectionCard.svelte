<script lang="ts">
	/**
	 * One section of a one-off email (#348) in the editor: its kind, the
	 * buttons to move it or take it out (always there; disabled at an end),
	 * and its fields. Image: the picture (upload or replace) and its words
	 * for screen readers. Heading: a line. Copy: paragraphs, with **bold**
	 * and [links](https://…). Button: its label, where it goes and its look (an underlined
	 * link or a gold frame). Book a table: nothing to fill in, it's the
	 * website's own button, the same every time.
	 */
	import { Field, PhotoActions, Segmented, TextArea, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import { sanityImageUrl } from "../../../../shared/sanity-image.js";
	import type { EmailFrame, OneOffSection } from "./email-api";
	import { BUTTON_LOOK_ITEMS, IMAGE_SIZE_ITEMS, SECTION_CHOICES } from "./one-off-view";

	let {
		section = $bindable(),
		id,
		index,
		count,
		frame,
		disabled = false,
		uploading = false,
		onmove,
		onremove,
		onfile,
	}: {
		section: OneOffSection;
		/** A stable id for its fields. */
		id: string;
		index: number;
		count: number;
		frame: EmailFrame | null;
		disabled?: boolean;
		uploading?: boolean;
		onmove: (by: -1 | 1) => void;
		onremove: () => void;
		onfile: (file: File) => void;
	} = $props();

	const kindLabel = $derived(SECTION_CHOICES.find((choice) => choice.kind === section.kind)?.label || "Section");
	const thumb = $derived(
		section.kind === "image" && section.assetId && frame
			? sanityImageUrl(frame.images.projectId, section.assetId, { w: 480, fm: "jpg" }, frame.images.dataset)
			: "",
	);

	function picked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) onfile(file);
	}
</script>

<section class="section-card" aria-label={`${kindLabel}, section ${index + 1} of ${count}`}>
	<header>
		<span class="kind">{kindLabel}</span>
		<div class="tools">
			<button
				type="button"
				class="icon-btn"
				aria-label="Move up"
				title={index === 0 ? "Already first" : "Move up"}
				disabled={disabled || index === 0}
				onclick={() => onmove(-1)}
			>
				<Icon name="chevron-up" size={15} />
			</button>
			<button
				type="button"
				class="icon-btn"
				aria-label="Move down"
				title={index === count - 1 ? "Already last" : "Move down"}
				disabled={disabled || index === count - 1}
				onclick={() => onmove(1)}
			>
				<Icon name="chevron-down" size={15} />
			</button>
			<button type="button" class="icon-btn remove" aria-label="Remove section" title="Remove section" {disabled} onclick={onremove}>
				<Icon name="trash" size={15} />
			</button>
		</div>
	</header>

	<div class="fields">
		{#if section.kind === "image"}
			<div class="image-row">
				<div class="thumb" class:busy={uploading}>
					{#if thumb}
						<img src={thumb} alt={section.alt} />
					{:else}
						<span>{uploading ? "Uploading…" : "No image yet"}</span>
					{/if}
				</div>
				<div class="image-side">
					<PhotoActions
						take={{ disabled: disabled || uploading, reason: uploading ? "Uploading…" : undefined }}
						replace={{ disabled: disabled || uploading, reason: uploading ? "Uploading…" : undefined }}
						remove={{ disabled: disabled || uploading || !section.assetId, reason: "No image yet" }}
						onfile={picked}
						onremove={() => {
							if (section.kind === "image") section.assetId = "";
						}}
					/>
					<Field label="Alt text" for={`${id}-alt`} hint="What it shows, for screen readers.">
						<TextField id={`${id}-alt`} size="sm" bind:value={section.alt} maxlength={300} {disabled} placeholder="The bar on New Year's Eve" />
					</Field>
					<Field label="Size" for={`${id}-size`} hint="Logo: small and whole, centred.">
						<Segmented bind:value={section.size} items={IMAGE_SIZE_ITEMS} tone="soft" size="sm" ariaLabel="Image size" />
					</Field>
				</div>
			</div>
		{:else if section.kind === "heading"}
			<Field label="Text" for={`${id}-text`}>
				<TextField id={`${id}-text`} size="sm" bind:value={section.text} maxlength={150} {disabled} placeholder="New Year's Eve" />
			</Field>
		{:else if section.kind === "copy"}
			<Field label="Text" for={`${id}-text`} hint="Blank line for a new paragraph. **bold**, [words](https://link).">
				<TextArea id={`${id}-text`} rows={5} bind:value={section.text} {disabled} placeholder="Doors at 9, music till late." />
			</Field>
		{:else if section.kind === "button"}
			<div class="pair">
				<Field label="Label" for={`${id}-label`}>
					<TextField id={`${id}-label`} size="sm" bind:value={section.label} maxlength={40} {disabled} placeholder="Get tickets" />
				</Field>
				<Field label="Link" for={`${id}-link`} hint="https:// or mailto:">
					<TextField id={`${id}-link`} size="sm" type="url" bind:value={section.link} maxlength={1000} {disabled} placeholder="https://gwenda.co.uk/whats-on" />
				</Field>
				<Field label="Look" for={`${id}-look`}>
					<Segmented bind:value={section.look} items={BUTTON_LOOK_ITEMS} tone="soft" size="sm" ariaLabel="Button look" />
				</Field>
			</div>
		{:else if section.kind === "booking"}
			<p class="fixed"><Icon name="calendar" size={15} /> The website's Book a table button, the same in every email, to OpenTable.</p>
		{/if}
	</div>
</section>

<style>
	.section-card {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1, var(--panel-bg));
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.kind {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.tools {
		display: flex;
		gap: var(--space-1);
	}
	.icon-btn {
		display: inline-grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: none;
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.icon-btn:hover:not(:disabled) {
		color: var(--foreground);
		background: color-mix(in srgb, var(--foreground) 7%, transparent);
	}
	.icon-btn.remove:hover:not(:disabled) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}
	.icon-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.icon-btn:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}
	.fixed {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
	.fields {
		display: grid;
		gap: var(--space-3);
	}
	.image-row {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr);
		gap: var(--space-3);
		align-items: start;
	}
	.thumb {
		display: grid;
		place-items: center;
		aspect-ratio: 4 / 3;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		background: color-mix(in srgb, var(--foreground) 4%, transparent);
	}
	.thumb.busy {
		opacity: 0.6;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.image-side {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.image-side :global(.photo-actions) {
		justify-content: flex-start;
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
		gap: var(--space-3);
	}
	@media (max-width: 600px) {
		.image-row,
		.pair {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
