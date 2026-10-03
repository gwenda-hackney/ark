<script lang="ts">
	/** On/off switch with its label beside it. A real checkbox underneath. */
	let {
		checked = $bindable(false),
		label,
		ariaLabel,
		disabled = false,
		onchange,
	}: {
		checked?: boolean;
		/** Visible text beside the switch. */
		label?: string;
		/** Use when there is no visible label. */
		ariaLabel?: string;
		disabled?: boolean;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<label class="switch" class:disabled>
	<input
		type="checkbox"
		role="switch"
		bind:checked
		{disabled}
		aria-label={ariaLabel}
		onchange={() => onchange?.(checked)}
	/>
	<span class="track" aria-hidden="true"></span>
	{#if label}<span class="label">{label}</span>{/if}
</label>

<style>
	.switch {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2rem;
		cursor: pointer;
		user-select: none;
	}

	.switch.disabled {
		cursor: not-allowed;
	}

	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: inherit;
	}

	.track {
		position: relative;
		flex-shrink: 0;
		width: 2.25rem;
		height: 1.25rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.track::after {
		content: "";
		position: absolute;
		top: 50%;
		left: 0.1875rem;
		width: 0.8125rem;
		height: 0.8125rem;
		border-radius: 50%;
		background: var(--fg-muted);
		transform: translateY(-50%);
		transition:
			transform var(--t-fast) var(--ease),
			background-color var(--t-fast) var(--ease-in-out);
	}

	input:checked + .track {
		border-color: var(--primary);
		background: var(--primary-wash-strong);
	}

	input:checked + .track::after {
		background: var(--primary);
		transform: translate(1rem, -50%);
	}

	input:focus-visible + .track {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	input:disabled + .track {
		border-color: var(--border);
		background: var(--surface-3);
	}

	input:disabled + .track::after {
		background: var(--fg-subtle);
	}

	.label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.disabled .label {
		color: var(--fg-subtle);
	}

	@media (max-width: 900px) {
		.switch {
			min-height: 2.75rem;
		}
	}
</style>
