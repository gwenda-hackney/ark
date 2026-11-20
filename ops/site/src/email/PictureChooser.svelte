<script lang="ts">
	/**
	 * Choosing a picture for an email (#348): one of ours, from the Photos
	 * page and each event's pictures (picture-library.ts), or a new one
	 * uploaded from this computer. Big pictures to tap, nothing to type.
	 */
	import { untrack } from "svelte";
	import { Button, Dialog, EmptyState, Skeleton } from "../ui";
	import { Icon } from "../app/shell";
	import { getVenueGallery } from "../app/api";
	import { libraryOf, type LibraryGroup } from "./picture-library";

	let {
		open,
		onclose,
		onpick,
		onupload,
	}: {
		open: boolean;
		onclose: () => void;
		/** One of ours was chosen. */
		onpick: (assetId: string, alt: string) => void;
		/** A file from this computer was chosen, to upload. */
		onupload: (file: File) => void;
	} = $props();

	let groups = $state<LibraryGroup[] | null>(null);
	let problem = $state("");
	let fileInput = $state<HTMLInputElement | null>(null);

	async function load() {
		problem = "";
		try {
			groups = libraryOf(await getVenueGallery());
		} catch (err) {
			problem = err instanceof Error ? err.message : "Couldn't load the photos.";
		}
	}
	// Loaded the first time it opens.
	$effect(() => {
		if (open && untrack(() => !groups && !problem)) void load();
	});

	function picked(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		(event.currentTarget as HTMLInputElement).value = "";
		if (file) onupload(file);
	}
</script>

<Dialog {open} size="xl" title="Choose a picture" {onclose}>
	<div class="chooser">
		<div class="upload">
			<Button onclick={() => fileInput?.click()}>
				{#snippet icon()}<Icon name="upload" size={16} />{/snippet}Upload one from this computer
			</Button>
			<input bind:this={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onchange={picked} />
			<span class="or">or tap one of ours:</span>
		</div>
		{#if problem}
			<EmptyState tone="error" title="Couldn't load the photos" text={problem}>
				{#snippet action()}<Button variant="outline" size="sm" onclick={() => void load()}>Try again</Button>{/snippet}
			</EmptyState>
		{:else if !groups}
			<Skeleton rows={2} lines={1} label="Loading the photos…" />
		{:else if !groups.length}
			<p class="none">No photos yet. Add some on the Photos page, or upload one here.</p>
		{:else}
			{#each groups as group (group.title)}
				<section aria-label={group.title}>
					<h3>{group.title}</h3>
					<div class="grid">
						{#each group.pictures as picture (picture.assetId)}
							<button type="button" class="pick" aria-label={picture.alt || group.title} onclick={() => onpick(picture.assetId, picture.alt)}>
								<img src={picture.thumb} alt="" loading="lazy" />
							</button>
						{/each}
					</div>
				</section>
			{/each}
		{/if}
	</div>
</Dialog>

<style>
	.chooser {
		display: grid;
		gap: var(--space-4);
		max-height: min(70vh, 48rem);
		overflow: auto;
	}
	.upload {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.or,
	.none {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		margin: 0;
	}
	h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: var(--space-2);
	}
	.pick {
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		background: var(--muted);
		aspect-ratio: 1;
		overflow: hidden;
		cursor: pointer;
	}
	.pick:hover,
	.pick:focus-visible {
		border-color: var(--primary);
	}
	.pick img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
</style>
