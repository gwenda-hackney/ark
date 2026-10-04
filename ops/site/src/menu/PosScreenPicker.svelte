<script lang="ts">
	import { NativeSelect } from "../ui";
	import type { SelectOption } from "../ui/types";
	import {
		parsePosScreenInput,
		posScreenPaths,
		serializePosScreens,
	} from "../inventory/lightspeed-stock.js";

	let {
		value = "",
		suggestions = [],
		onchange,
	}: {
		value?: string;
		suggestions?: string[];
		onchange: (next: string) => void;
	} = $props();

	const screens = $derived(posScreenPaths({ lightspeedMenuScreen: value }));
	const unused = $derived(
		(suggestions || []).filter(
			(path) =>
				!screens.some((screen) => screen.toLowerCase() === path.toLowerCase()),
		),
	);
	const addOptions = $derived.by((): SelectOption[] => [
		{ value: "", label: "Add screen…" },
		...unused.map((path) => ({ value: path, label: path })),
	]);

	function setScreens(next: string[]) {
		onchange(serializePosScreens(next));
	}

	function add(raw: string) {
		const path = parsePosScreenInput(raw);
		if (!path) return;
		setScreens([...screens, path]);
	}

	function remove(path: string) {
		setScreens(screens.filter((screen) => screen !== path));
	}

	function onAdd(event: { currentTarget: { value: string } }) {
		const next = event.currentTarget.value;
		add(next);
	}
</script>

<div class="picker">
	{#if screens.length}
		<div class="chips">
			{#each screens as screen (screen)}
				<button
					type="button"
					class="chip on"
					aria-label={`Remove ${screen}`}
					onclick={() => remove(screen)}
				>
					{screen}
				</button>
			{/each}
		</div>
	{/if}
	{#if unused.length}
		<NativeSelect
			id="f-pos-screens"
			size="sm"
			options={addOptions}
			value=""
			onchange={onAdd}
		/>
	{:else if !screens.length}
		<p class="hint">No known screens yet. Import a Lightspeed menu first.</p>
	{/if}
	<p class="hint">
		Till screen path (Main or Main/Sub). A drink can sit on more than one.
	</p>
</div>

<style>
	.picker {
		display: grid;
		gap: var(--space-2);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		margin: 0;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--input);
		border-radius: var(--radius-pill);
		background: var(--sunken);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.2;
		cursor: pointer;
	}

	.chip:hover {
		border-color: var(--border-strong);
		color: var(--foreground);
	}

	.chip.on {
		border-color: var(--ring);
		background: var(--primary-wash);
		color: var(--foreground);
	}

	.hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}
</style>
