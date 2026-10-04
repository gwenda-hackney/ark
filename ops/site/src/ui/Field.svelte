<script lang="ts">
	/**
	 * One form field: label (with a red asterisk when it must be filled
	 * in), label-row actions, the control, then one line under it: the
	 * hint, or the error in its place. Fields that may be left blank carry
	 * no tag. The control picks up aria-describedby and aria-invalid from
	 * here. `tooltip` is for long help only; short help goes in `hint`.
	 * `width` caps the control (and its label row) to what goes in it: xs
	 * 6rem (%, ABV), sm 9rem (money, times, dates), md 16rem, lg 28rem,
	 * full (default). The hint and error keep the field's full width so a
	 * narrow control doesn't wrap its help onto four lines.
	 */
	import type { Snippet } from "svelte";
	import Tip from "./Tip.svelte";
	import { setFieldContext, joinIds, type FieldWidth } from "./field-context";

	let {
		label,
		hint,
		tooltip,
		error = "",
		required = false,
		optional = false,
		width = "full",
		for: htmlFor,
		actions,
		children,
		class: className = "",
	}: {
		label: string;
		hint?: string;
		tooltip?: string;
		/** Shown in place of the hint, in the danger colour. */
		error?: string;
		/** Mark the field "Required": Save checks it can't be blank. */
		required?: boolean;
		/** May be left blank. Shows nothing; kept so call sites read clearly. */
		optional?: boolean;
		width?: FieldWidth;
		for?: string;
		actions?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();

	const uid = `fld-${Math.random().toString(36).slice(2, 9)}`;
	const base = $derived(htmlFor || uid);
	const hintId = $derived(`${base}-hint`);
	const errorId = $derived(`${base}-error`);

	let localError = $state("");
	const shownError = $derived(error || localError);
	const describedBy = $derived(joinIds(shownError ? errorId : hint ? hintId : ""));

	setFieldContext({
		get describedBy() {
			return describedBy;
		},
		get invalid() {
			return Boolean(shownError);
		},
		setLocalError(message: string) {
			localError = message;
		},
	});
</script>

<div class="field w-{width} {className}" class:has-error={Boolean(shownError)}>
	<div class="label-row">
		<div class="label-left">
			<!-- Required: the usual asterisk after the label; screen readers hear "required". -->
			<label for={htmlFor}
				>{label}{#if required && !optional}<span class="req" aria-hidden="true">*</span
					><span class="sr-only">{" (required)"}</span>{/if}</label
			>
			{#if tooltip}
				<Tip {label} {tooltip} />
			{/if}
		</div>
		{#if actions}
			<div class="label-actions">{@render actions()}</div>
		{/if}
	</div>
	<div class="control">{@render children()}</div>
	{#if shownError}
		<p class="error" id={errorId}>
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 7.5v5.5M12 16.5v.01" />
			</svg>
			<span>{shownError}</span>
		</p>
	{:else if hint}
		<p class="hint" id={hintId}>{hint}</p>
	{/if}
</div>

<style>
	.field {
		display: grid;
		/*
		  Pack to the top. A field stretched by a taller neighbour would otherwise
		  spread the slack across its rows and float its control off the line the
		  other controls in the row sit on.
		*/
		align-content: start;
		gap: var(--space-2);
		min-width: 0;
		width: 100%;
	}

	.control {
		min-width: 0;
	}

	/* Widths follow what goes in: a percentage never needs 500px. */
	.w-xs > .control {
		max-width: 6rem;
	}

	.w-sm > .control {
		max-width: 9rem;
	}

	.w-md > .control,
	.w-md > .label-row {
		max-width: 16rem;
	}

	.w-lg > .control,
	.w-lg > .label-row {
		max-width: 28rem;
	}

	/* Actions on a narrow field stay by its control, not across the row. */
	.w-xs > .label-row,
	.w-sm > .label-row {
		justify-content: flex-start;
	}

	.hint,
	.error {
		max-width: 40rem;
	}

	.label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-width: 0;
		/* Match tip / compact action height so neighbouring fields share a baseline. */
		min-height: var(--control-h-xs);
	}

	.label-left {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.w-xs label,
	.w-sm label {
		white-space: nowrap;
	}

	.req {
		margin-left: 0.125rem;
		color: var(--danger);
		font-weight: 600;
	}

	.label-actions {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}

	/* Field actions: quiet icon tools on the label row, not mini FABs. */
	.label-actions :global(.btn) {
		min-height: 1.375rem;
		height: 1.375rem;
	}

	.label-actions :global(.btn.icon-only),
	.label-actions :global(.btn:not(:has(.label))) {
		width: 1.375rem;
		padding: 0;
	}

	.label-actions :global(.btn:has(.label)) {
		width: auto;
		padding: 0 var(--space-2);
	}

	.label-actions :global(.btn .glyph) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.label-actions :global(.btn svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.hint,
	.error {
		margin: 0;
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.hint {
		color: var(--subtle-foreground);
	}

	.error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		color: var(--danger);
	}

	.error svg {
		flex-shrink: 0;
		margin-top: 0.1rem;
	}

	/* Every control in an errored field takes the danger edge. */
	.has-error :global(.input),
	.has-error :global(.trigger),
	.has-error :global(.wrap),
	.has-error :global(.affix-box) {
		border-color: var(--danger);
	}
</style>
