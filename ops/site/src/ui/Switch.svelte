<script lang="ts">
	/**
	 * On/off for a yes-or-no setting in a form. A real checkbox with
	 * role="switch", so it submits, labels and announces like one. Put the
	 * words in `label` (beside it) or wrap it in a Field.
	 */
	import { getFieldContext } from "./field-context";

	let {
		checked = $bindable(false),
		id = undefined,
		label = "",
		disabled = false,
		name = undefined,
		"aria-label": ariaLabelAttr = undefined,
		ariaLabel = undefined,
		onchange,
	}: {
		checked?: boolean;
		id?: string;
		/** Text beside the switch; click it to toggle. */
		label?: string;
		disabled?: boolean;
		name?: string;
		"aria-label"?: string;
		/** Same as aria-label. */
		ariaLabel?: string;
		onchange?: (checked: boolean) => void;
	} = $props();

	const field = getFieldContext();
</script>

<label class="switch" class:disabled>
	<input
		{id}
		{name}
		{disabled}
		type="checkbox"
		role="switch"
		aria-label={ariaLabelAttr ?? ariaLabel}
		aria-checked={checked}
		aria-describedby={field?.describedBy}
		bind:checked
		onchange={() => onchange?.(checked)}
	/>
	<span class="track" aria-hidden="true"><span class="thumb"></span></span>
	{#if label}<span class="text">{label}</span>{/if}
</label>

<style>
	.switch {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-h-sm);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.switch.disabled {
		cursor: not-allowed;
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		opacity: 0;
		pointer-events: none;
	}

	.track {
		position: relative;
		flex-shrink: 0;
		width: 2.25rem;
		height: 1.25rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: var(--surface-3);
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.thumb {
		position: absolute;
		top: 50%;
		left: 0.125rem;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		background: var(--fg-muted);
		transform: translateY(-50%);
		transition:
			transform var(--t) var(--ease),
			background-color var(--t-fast) var(--ease-in-out);
	}

	input:checked + .track {
		border-color: var(--primary-border);
		background: var(--primary);
	}

	input:checked + .track .thumb {
		background: var(--primary-foreground);
		transform: translate(1rem, -50%);
	}

	input:focus-visible + .track {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	input:disabled + .track {
		opacity: 1;
		background: var(--surface-3);
		border-color: var(--border);
	}

	input:disabled + .track .thumb {
		background: var(--fg-subtle);
	}

	.text {
		font-size: var(--text-base);
		color: var(--fg);
	}

	.disabled .text {
		color: var(--fg-subtle);
	}

	@media (max-width: 900px) {
		.switch {
			min-height: 2.75rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.thumb,
		.track {
			transition: none;
		}
	}
</style>
