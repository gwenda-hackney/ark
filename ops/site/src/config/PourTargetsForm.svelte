<script lang="ts">
	import { Button, Field, TextField } from "../ui";
	import {
		DRINK_TYPES,
		POUR_TARGET_META,
		type DrinkType,
		type PourTargetMap,
	} from "../app/types";
	import {
		pourSettings,
		resetPourTargets,
		setPourTargets,
	} from "./settings.svelte";
	import { toast } from "../ui/toast.svelte";

	let {
		active = true,
		idPrefix = "pour",
		showReset = true,
	}: {
		active?: boolean;
		idPrefix?: string;
		showReset?: boolean;
	} = $props();

	/** Every drink type's target as text, so a new type can't be left out. */
	function draftFrom(targets: PourTargetMap): Record<DrinkType, string> {
		return Object.fromEntries(
			DRINK_TYPES.map((row) => [row.value, String(targets[row.value])]),
		) as Record<DrinkType, string>;
	}

	let draft = $state<Record<DrinkType, string>>(draftFrom(pourSettings.targets));

	function syncDraft() {
		draft = draftFrom(pourSettings.targets);
	}

	$effect(() => {
		if (!active) return;
		syncDraft();
	});

	async function commit(type: DrinkType, raw: string) {
		draft = { ...draft, [type]: raw };
		try {
			await setPourTargets({ [type]: raw } as Partial<PourTargetMap>);
			draft = {
				...draft,
				[type]: String(pourSettings.targets[type]),
			};
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not save pour targets.",
			);
			syncDraft();
		}
	}

	async function reset() {
		try {
			await resetPourTargets();
			syncDraft();
			toast.ok("Pour targets reset.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not reset pour targets.",
			);
			syncDraft();
		}
	}
</script>

<p class="lead">
	Target pour cost is ingredient cost as a share of the selling price. Cocktails default to 20%, the usual mixed-drink target. Saved in Baserow for the whole team.
</p>
{#if pourSettings.error && !pourSettings.saving}
	<p class="warn" role="status">{pourSettings.error}</p>
{/if}
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
				disabled={pourSettings.saving}
				value={draft[row.value]}
				oninput={(e) => {
					const raw = (e.currentTarget as HTMLInputElement).value;
					draft = { ...draft, [row.value]: raw };
				}}
				onchange={(e) =>
					void commit(
						row.value,
						(e.currentTarget as HTMLInputElement).value,
					)}
				onblur={(e) =>
					void commit(
						row.value,
						(e.currentTarget as HTMLInputElement).value,
					)}
			/>
		</Field>
	{/each}
</div>
{#if showReset}
	<div class="actions">
		<Button
			variant="outline"
			size="sm"
			type="button"
			disabled={pourSettings.saving}
			onclick={() => void reset()}
		>
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

	.warn {
		margin: 0 0 1rem;
		font-size: var(--text-sm);
		color: var(--destructive, #c97a7a);
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
