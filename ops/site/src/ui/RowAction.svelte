<script lang="ts">
	/**
	 * An icon button for one row of a table, grid or list (remove a line,
	 * open it, move it). Drop it in a cell as is: it is a circle that fits the
	 * row, and it stays out of the way until the row is hovered or has focus,
	 * then fades in. Touch screens have no hover, so there it always shows.
	 * The row is any `tr`, AG Grid row, `[role=row]`, or an element with
	 * class `reveal-row`. It never moves anything: it only fades.
	 */
	import { Icon } from "../app/shell";

	let {
		label,
		icon = "trash",
		tone = "danger",
		disabled = false,
		reason = "",
		reveal = true,
		onclick,
	}: {
		/** What it does, for screen readers and the tooltip ("Remove Lemon juice"). */
		label: string;
		icon?: string;
		/** Danger turns red on hover; neutral stays ink. */
		tone?: "danger" | "neutral";
		disabled?: boolean;
		/** Why it's disabled, as the tooltip. */
		reason?: string;
		/** false keeps it visible at rest (a row's only way in, say). */
		reveal?: boolean;
		onclick: (event: MouseEvent) => void;
	} = $props();
</script>

<button
	type="button"
	class="row-action {tone}"
	class:reveal
	aria-label={label}
	title={disabled && reason ? reason : label}
	aria-disabled={disabled || undefined}
	onclick={(event) => {
		event.stopPropagation();
		if (disabled) return;
		onclick(event);
	}}
>
	<Icon name={icon} size={16} />
</button>

<style>
	.row-action {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		max-height: 100%;
		aspect-ratio: 1;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		vertical-align: middle;
		transition:
			opacity 150ms var(--ease, ease),
			background-color 120ms var(--ease, ease),
			color 120ms var(--ease, ease);
	}

	.row-action.reveal {
		opacity: 0;
	}

	:global(:is(tr, [role="row"], .ag-row, .reveal-row):is(:hover, :focus-within)) .row-action.reveal,
	.row-action:focus-visible {
		opacity: 1;
	}

	.row-action:hover {
		background: var(--surface-3);
		color: var(--fg);
	}

	.row-action.danger:hover {
		background: var(--danger-wash);
		color: var(--danger);
	}

	.row-action:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	.row-action[aria-disabled="true"] {
		color: var(--fg-subtle);
		background: transparent;
		cursor: not-allowed;
	}

	@media (hover: none) {
		.row-action.reveal {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.row-action {
			transition: none;
		}
	}
</style>
