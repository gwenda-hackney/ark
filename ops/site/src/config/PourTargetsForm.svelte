<script lang="ts">
	/**
	 * House pour-cost targets. Each figure saves when you leave its field,
	 * once, and says "Saved" beside its label; there is no Save button.
	 */
	import { Button, ConfirmDialog, Field, NumberField } from "../ui";
	import { Confirm } from "../ui/confirm.svelte";
	import { DRINK_TYPES, POUR_TARGET_META, type DrinkType, type PourTargetMap } from "../menu/types";
	import {
		pourSettings,
		resetPourTargets,
		setPourTargets,
	} from "./settings.svelte";
	import { POUR_TARGET_RULES, pourTargetToSave } from "./pour-target-commit";
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
	/** The row that just saved, for its "Saved" mark. */
	let savedType = $state<DrinkType | "">("");
	let savingType = $state<DrinkType | "">("");
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	const confirm = new Confirm();

	function syncDraft() {
		draft = draftFrom(pourSettings.targets);
	}

	$effect(() => {
		if (!active) return;
		syncDraft();
	});

	async function commit(type: DrinkType, raw: string) {
		const next = pourTargetToSave(raw, pourSettings.targets[type]);
		if (next === null) return;
		savingType = type;
		savedType = "";
		try {
			await setPourTargets({ [type]: next } as Partial<PourTargetMap>);
			draft = { ...draft, [type]: String(pourSettings.targets[type]) };
			savedType = type;
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (savedType = ""), 2500);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not save pour targets.");
			syncDraft();
		} finally {
			savingType = "";
		}
	}

	async function reset() {
		const ok = await confirm.ask({
			title: "Reset pour targets?",
			message: "Every drink type goes back to the standard target, for the whole team.",
			action: "Reset",
		});
		if (!ok) return;
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
	Target pour cost is ingredient cost as a share of the selling price. Cocktails default to 20%, the usual mixed-drink target. Saved in Baserow for the whole team as you leave each field.
</p>
{#if pourSettings.error && !pourSettings.saving}
	<p class="warn" role="status">{pourSettings.error}</p>
{/if}
<div class="rows">
	{#each DRINK_TYPES as row (row.value)}
		<Field
			label={POUR_TARGET_META[row.value].label}
			for={`${idPrefix}-${row.value}`}
			hint={POUR_TARGET_META[row.value].blurb}
		>
			{#snippet actions()}
				<span class="saved" aria-live="polite">
					{#if savingType === row.value}
						Saving…
					{:else if savedType === row.value}
						Saved ✓
					{/if}
				</span>
			{/snippet}
			<div class="control">
				<NumberField
					id={`${idPrefix}-${row.value}`}
					size="sm"
					unit="%"
					min={POUR_TARGET_RULES.min}
					max={POUR_TARGET_RULES.max}
					step={1}
					decimals={1}
					noun={POUR_TARGET_RULES.noun}
					disabled={pourSettings.saving && savingType !== row.value}
					bind:value={draft[row.value]}
					onblur={(e) => void commit(row.value, (e.currentTarget as HTMLInputElement).value)}
				/>
			</div>
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
<ConfirmDialog {confirm} />

<style>
	.lead {
		margin: 0 0 var(--space-4);
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.warn {
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--danger);
	}

	.rows {
		display: grid;
		gap: var(--space-4);
	}

	/* A percentage is a few characters wide; the hint can use the full row. */
	.control {
		max-width: 7rem;
	}

	.saved {
		font-size: var(--text-xs);
		color: var(--success);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-4);
	}
</style>
