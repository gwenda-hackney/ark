<script lang="ts">
	/**
	 * The editor's footer: what's unsaved or wrong on the left, Save on the
	 * right with what it saves in the label ("Save series", "Save night"),
	 * and anything destructive in the "⋯" menu beside it, never next to Save.
	 * Sticks to the bottom of the editor and clears the phone's home bar.
	 * It is the one "unsaved" mark in an editor; the shell's saving pill reads
	 * the same unsaved guard, so the two never disagree.
	 */
	import type { Snippet } from "svelte";
	import Button from "./Button.svelte";
	import { Icon } from "../app/shell";
	import OverflowMenu from "./OverflowMenu.svelte";
	import { errorCountLabel } from "./form-errors.svelte";
	import type { OverflowItem } from "./types";

	let {
		saveLabel = "Save",
		savingLabel = "Saving…",
		saving = false,
		disabled = false,
		dirty = false,
		errorCount = 0,
		overflow = [],
		onerrors,
		onsave,
		start,
	}: {
		/** Say what gets saved: "Save series", "Save night", "Save drink". */
		saveLabel?: string;
		savingLabel?: string;
		saving?: boolean;
		disabled?: boolean;
		dirty?: boolean;
		/** Problems found on the last Save; the count is a button to the first. */
		errorCount?: number;
		/** Delete, Reload and the like. */
		overflow?: OverflowItem[];
		onerrors?: () => void;
		/** Without it Save is a submit button for the surrounding form. */
		onsave?: () => void;
		/** Extra controls on the left, after the status. */
		start?: Snippet;
	} = $props();

	const errorText = $derived(errorCountLabel(errorCount));
</script>

<footer class="action-bar">
	<div class="status" aria-live="polite">
		{#if errorText}
			{#if onerrors}
				<button type="button" class="errors" onclick={onerrors}>
					<span class="dot danger" aria-hidden="true"></span>{errorText}
				</button>
			{:else}
				<span class="errors"><span class="dot danger" aria-hidden="true"></span>{errorText}</span>
			{/if}
		{:else if dirty}
			<span class="unsaved"><span class="dot" aria-hidden="true"></span>Unsaved changes</span>
		{/if}
		{#if start}{@render start()}{/if}
	</div>
	<div class="actions">
		{#if overflow.length}
			<OverflowMenu items={overflow} disabled={saving} />
		{/if}
		<Button
			variant="primary"
			size="sm"
			type={onsave ? "button" : "submit"}
			disabled={disabled || saving}
			busy={saving}
			onclick={onsave}
		>
			{#snippet icon()}<Icon name="save" size={14} />{/snippet}
			{saving ? savingLabel : saveLabel}
		</Button>
	</div>
</footer>

<style>
	.action-bar {
		position: sticky;
		bottom: 0;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-shrink: 0;
		margin-top: auto;
		padding: var(--space-3) var(--card-pad-lg);
		border-top: 1px solid var(--border);
		background: var(--card);
	}

	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
		font-size: var(--text-sm);
	}

	.unsaved,
	.errors {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
	}

	.unsaved {
		color: var(--warning);
	}

	.errors {
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--danger);
		font: inherit;
		font-weight: 500;
	}

	button.errors {
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: var(--danger-border);
		text-underline-offset: 3px;
	}

	button.errors:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--warning);
	}

	.dot.danger {
		background: var(--danger);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. */
	@media (max-width: 900px) {
		.action-bar {
			padding: var(--space-2) max(var(--page-gutter), 1.125rem)
				max(var(--space-2), env(safe-area-inset-bottom, 0px));
		}

		.actions :global(.btn) {
			min-height: 2.75rem;
		}
	}
</style>
