<script lang="ts">
	/**
	 * Text edited where it shows: a heading, a line under it. It reads as the
	 * text itself, with a faint underline on hover or focus; a click (or Enter
	 * when focused) turns it into a box of the same size and type. Enter or
	 * leaving the box saves, Esc puts it back. `required` text that is
	 * cleared goes back to what it was. The parent can open it with
	 * `bind:editing` (an "Add a line" in a menu, say).
	 */
	import { tick } from "svelte";

	let {
		value,
		label,
		placeholder = "",
		required = false,
		disabled = false,
		editing = $bindable(false),
		class: className = "",
		onsave,
		ondone,
	}: {
		value: string;
		/** What it is, for screen readers: "Section name". */
		label: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		editing?: boolean;
		class?: string;
		/** Called with the new text when it changed. */
		onsave: (next: string) => Promise<void> | void;
		/** Called when the box closes, saved or not. */
		ondone?: () => void;
	} = $props();

	let draft = $state("");
	let input = $state<HTMLInputElement | undefined>();
	let saving = $state(false);
	let wasEditing = false;

	$effect(() => {
		if (!editing && wasEditing) ondone?.();
		if (editing && !wasEditing) {
			draft = value;
			void tick().then(() => {
				input?.focus();
				input?.select();
			});
		}
		wasEditing = editing;
	});

	function start() {
		if (disabled || saving) return;
		editing = true;
	}

	async function commit() {
		if (!editing || saving) return;
		const next = draft.trim();
		if (next === value.trim() || (required && !next)) {
			editing = false;
			return;
		}
		saving = true;
		try {
			await onsave(next);
			editing = false;
		} catch {
			// The page says what went wrong; the box stays with what was typed.
			input?.focus();
		} finally {
			saving = false;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === "Enter") {
			event.preventDefault();
			void commit();
		} else if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			editing = false;
		}
	}
</script>

{#if editing}
	<input
		bind:this={input}
		class="inline-edit-input {className}"
		aria-label={label}
		{placeholder}
		bind:value={draft}
		disabled={saving}
		{onkeydown}
		onblur={() => void commit()}
		autocomplete="off"
	/>
{:else}
	<button
		type="button"
		class="inline-edit {className}"
		class:empty={!value}
		aria-label={`${label}: ${value || "empty"}. Click to change.`}
		{disabled}
		onclick={start}
	>{value || placeholder}</button>
{/if}

<style>
	.inline-edit,
	.inline-edit-input {
		display: block;
		width: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: 0.125rem var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-sm, 4px);
		background: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		font-style: inherit;
		line-height: inherit;
		text-align: left;
	}

	.inline-edit {
		cursor: text;
	}

	.inline-edit:hover:not(:disabled) {
		border-color: var(--border);
		background: var(--surface-2);
	}

	.inline-edit:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	.inline-edit.empty {
		color: var(--subtle-foreground);
	}

	.inline-edit-input {
		border-color: var(--input);
		background: var(--sunken);
		color: var(--field-foreground);
		outline: none;
	}

	.inline-edit-input:focus {
		border-color: var(--ring);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 35%, transparent);
	}
</style>
