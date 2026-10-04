<script lang="ts">
	/**
	 * The icon buttons for a photo: take one (phones and tablets), replace,
	 * download the original (where there is one) and remove. Always shown;
	 * one that can't be used is disabled with the reason as its tooltip.
	 */
	import { Icon } from "../app/shell";

	type Action = { disabled?: boolean; reason?: string };

	let {
		take = {},
		replace = {},
		remove = {},
		download,
		onfile,
		onremove,
	}: {
		take?: Action;
		replace?: Action;
		remove?: Action;
		/** The original's URL; null shows the button disabled, undefined leaves it out. */
		download?: string | null;
		onfile: (event: Event) => void;
		onremove: () => void;
	} = $props();
</script>

<div class="photo-actions">
	<label class="pick camera" title={take.disabled ? take.reason : "Take photo"}>
		<input
			class="sr-only"
			type="file"
			accept="image/*"
			capture="environment"
			aria-label="Take photo"
			disabled={take.disabled}
			onchange={onfile}
		/>
		<span class="icon-btn" aria-hidden="true"><Icon name="camera" size={15} /></span>
	</label>
	<label class="pick" title={replace.disabled ? replace.reason : "Replace photo"}>
		<input
			class="sr-only"
			type="file"
			accept="image/jpeg,image/png,image/webp,image/gif"
			aria-label="Replace photo"
			disabled={replace.disabled}
			onchange={onfile}
		/>
		<span class="icon-btn" aria-hidden="true"><Icon name="upload" size={15} /></span>
	</label>
	{#if download}
		<a class="icon-btn" href={download} download target="_blank" rel="noopener" aria-label="Download original" title="Download original">
			<Icon name="download" size={15} />
		</a>
	{:else if download === null}
		<button class="icon-btn" type="button" disabled aria-label="Download original" title="Nothing saved to download yet">
			<Icon name="download" size={15} />
		</button>
	{/if}
	<button
		class="icon-btn remove"
		type="button"
		aria-label="Remove photo"
		title={remove.disabled ? remove.reason : "Remove photo"}
		disabled={remove.disabled}
		onclick={onremove}
	>
		<Icon name="trash" size={15} />
	</button>
</div>

<style>
	.photo-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-1);
	}

	/* Phones and tablets only: opens the camera straight away. */
	.pick.camera {
		display: none;
	}

	@media (pointer: coarse) {
		.pick.camera {
			display: block;
		}
	}

	.pick {
		display: block;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: var(--control-h-sm);
		height: var(--control-h-sm);
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--muted-foreground);
		text-decoration: none;
		cursor: pointer;
	}

	.icon-btn:hover:not(:disabled),
	.pick:hover:not(:has(input:disabled)) .icon-btn {
		color: var(--fg);
		background: var(--surface-3);
	}

	.icon-btn:focus-visible,
	.pick:has(input:focus-visible) .icon-btn {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.icon-btn.remove:hover:not(:disabled),
	.icon-btn.remove:focus-visible {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.icon-btn:disabled,
	.pick:has(input:disabled) .icon-btn {
		color: var(--fg-subtle);
		background: transparent;
		cursor: not-allowed;
	}

	@media (max-width: 900px) {
		.icon-btn {
			width: 2.75rem;
			height: 2.75rem;
		}
	}
</style>
