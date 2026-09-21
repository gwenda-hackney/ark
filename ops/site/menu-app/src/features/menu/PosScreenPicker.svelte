<script lang="ts">
	import { TextField } from "../../ui";
	import {
		parsePosScreenInput,
		posScreenPaths,
		serializePosScreens,
	} from "../../../../functions/_lib/lightspeed-stock.js";

	let {
		value = "",
		suggestions = [],
		onchange,
	}: {
		value?: string;
		suggestions?: string[];
		onchange: (next: string) => void;
	} = $props();

	let draft = $state("");
	const listId = "pos-screen-suggestions";
	const screens = $derived(posScreenPaths({ lightspeedMenuScreen: value }));
	const unused = $derived(
		(suggestions || []).filter(
			(path) =>
				!screens.some((screen) => screen.toLowerCase() === path.toLowerCase()),
		),
	);

	function setScreens(next: string[]) {
		onchange(serializePosScreens(next));
	}

	function add(raw: string) {
		const path = parsePosScreenInput(raw);
		if (!path) return;
		setScreens([...screens, path]);
		draft = "";
	}

	function remove(path: string) {
		setScreens(screens.filter((screen) => screen !== path));
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== "Enter") return;
		event.preventDefault();
		add(draft);
	}
</script>

<div class="picker">
	{#if screens.length}
		<div class="chips" role="list">
			{#each screens as screen (screen)}
				<button
					type="button"
					class="chip on"
					role="listitem"
					aria-label={`Remove ${screen}`}
					onclick={() => remove(screen)}
				>
					{screen}
				</button>
			{/each}
		</div>
	{/if}
	<TextField
		id="f-pos-screens"
		size="sm"
		placeholder="Spirits/Liqueurs & Amari"
		list={listId}
		bind:value={draft}
		onkeydown={onKeydown}
		onchange={() => add(draft)}
	/>
	<datalist id={listId}>
		{#each unused as path (path)}
			<option value={path}></option>
		{/each}
	</datalist>
	<p class="hint">
		Main screen, or Main/Sub-screen. A drink can sit on more than one. Import creates a new screen in Lightspeed if it is missing.
	</p>
	{#if unused.length && unused.length <= 12}
		<div class="chips suggest" role="group" aria-label="Suggested screens">
			{#each unused as path (path)}
				<button type="button" class="chip" onclick={() => add(path)}>
					{path}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.picker {
		display: grid;
		gap: 0.4rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		margin: 0;
		padding: 0.3rem 0.65rem;
		border: 1px solid var(--input);
		border-radius: 999px;
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
