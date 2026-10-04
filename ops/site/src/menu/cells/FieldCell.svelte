<script lang="ts">
	/**
	 * AG Grid cell for an editable field: its value, or a quiet placeholder
	 * when empty, with a red edge and the message when it's invalid. Carries
	 * the field id so a failed Save can scroll to it.
	 */
	let {
		text = "",
		placeholder = "",
		id,
		error = "",
		mono = false,
	}: { text?: string; placeholder?: string; id?: string; error?: string; mono?: boolean } = $props();
</script>

<span {id} class="field" class:mono class:invalid={Boolean(error)} title={error || undefined}>
	{#if text}{text}{:else}<span class="placeholder">{placeholder}</span>{/if}
</span>

<style>
	.field {
		display: block;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		outline: none;
	}

	.placeholder {
		color: var(--fg-subtle);
	}

	.invalid {
		color: var(--danger);
		box-shadow: inset 0 -2px 0 var(--danger);
	}
</style>
