<script lang="ts">
	import { Button, Field, TextField } from "../../ui";
	import {
		DRINK_TYPES,
		POUR_TARGET_META,
		type DrinkType,
		type PourTargetMap,
	} from "../../lib/types";
	import {
		pourSettings,
		resetPourTargets,
		setPourTargets,
	} from "../../lib/settings.svelte";

	let {
		active = true,
		idPrefix = "pour",
		showReset = true,
	}: {
		active?: boolean;
		idPrefix?: string;
		showReset?: boolean;
	} = $props();

	let draft = $state<Record<DrinkType, string>>({
		cocktail: String(pourSettings.targets.cocktail),
		pour: String(pourSettings.targets.pour),
		beer: String(pourSettings.targets.beer),
		packaged: String(pourSettings.targets.packaged),
	});

	function syncDraft() {
		const targets = pourSettings.targets;
		draft = {
			cocktail: String(targets.cocktail),
			pour: String(targets.pour),
			beer: String(targets.beer),
			packaged: String(targets.packaged),
		};
	}

	$effect(() => {
		if (!active) return;
		syncDraft();
	});

	function commit(type: DrinkType, raw: string) {
		draft = { ...draft, [type]: raw };
		setPourTargets({ [type]: raw } as Partial<PourTargetMap>);
		draft = {
			...draft,
			[type]: String(pourSettings.targets[type]),
		};
	}

	function reset() {
		resetPourTargets();
		syncDraft();
	}
</script>

<p class="lead">
	Target pour cost is ingredient cost as a share of the selling price. Cocktails default to 20%, the usual mixed-drink target. Saved in this browser.
</p>
<div class="rows">
	{#each DRINK_TYPES as row (row.value)}
		<Field
			label="{POUR_TARGET_META[row.value].label} %"
			for={`${idPrefix}-${row.value}`}
			hint={POUR_TARGET_META[row.value].blurb}
		>
			<TextField
				id={`${idPrefix}-${row.value}`}
				size="sm"
				mono
				inputmode="decimal"
				value={draft[row.value]}
				oninput={(e) => {
					const raw = (e.currentTarget as HTMLInputElement).value;
					draft = { ...draft, [row.value]: raw };
				}}
				onchange={(e) =>
					commit(
						row.value,
						(e.currentTarget as HTMLInputElement).value,
					)}
				onblur={(e) =>
					commit(
						row.value,
						(e.currentTarget as HTMLInputElement).value,
					)}
			/>
		</Field>
	{/each}
</div>
{#if showReset}
	<div class="actions">
		<Button variant="outline" size="sm" type="button" onclick={reset}>
			Reset to standard
		</Button>
	</div>
{/if}

<style>
	.lead {
		margin: 0 0 1rem;
		font-size: var(--text);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.rows {
		display: grid;
		gap: 0.85rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}
</style>
