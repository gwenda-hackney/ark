<script lang="ts">
	/**
	 * House pour-cost targets, one figure per drink type, saved together with
	 * one Save. `dirty` tells the page (or dialog) there are figures not saved
	 * yet, so it can guard leaving. `showActions` off hands Save to a dialog's
	 * footer, which calls `save()`.
	 */
	import { Button, ConfirmDialog, Field, NumberField } from "../ui";
	import { Icon } from "../app/shell";
	import { Confirm } from "../ui/confirm.svelte";
	import { DRINK_TYPES, POUR_TARGET_META, type DrinkType, type PourTargetMap } from "../menu/types";
	import { pourSettings, resetPourTargets, setPourTargets } from "./settings.svelte";
	import { POUR_TARGET_RULES, pourTargetDraft } from "./pour-target-commit";
	import { toast } from "../ui/toast.svelte";

	let {
		active = true,
		idPrefix = "pour",
		showReset = true,
		showActions = true,
		dirty = $bindable(false),
	}: {
		active?: boolean;
		idPrefix?: string;
		showReset?: boolean;
		showActions?: boolean;
		dirty?: boolean;
	} = $props();

	/** Every drink type's target as text, so a new type can't be left out. */
	function draftFrom(targets: PourTargetMap): Record<DrinkType, string> {
		return Object.fromEntries(
			DRINK_TYPES.map((row) => [row.value, String(targets[row.value])]),
		) as Record<DrinkType, string>;
	}

	let draft = $state<Record<DrinkType, string>>(draftFrom(pourSettings.targets));
	/** Shown only after a Save that found problems. */
	let showErrors = $state(false);
	const confirm = new Confirm();

	const checked = $derived(pourTargetDraft(draft, pourSettings.targets));

	$effect(() => {
		dirty = checked.dirty;
	});

	function syncDraft() {
		draft = draftFrom(pourSettings.targets);
		showErrors = false;
	}

	$effect(() => {
		if (!active) return;
		syncDraft();
	});

	/** Save every changed figure at once. True when there's nothing left unsaved. */
	export async function save(): Promise<boolean> {
		if (Object.keys(checked.errors).length) {
			showErrors = true;
			const first = DRINK_TYPES.find((row) => checked.errors[row.value]);
			if (first) document.getElementById(`${idPrefix}-${first.value}`)?.focus();
			return false;
		}
		if (!Object.keys(checked.changes).length) return true;
		try {
			await setPourTargets(checked.changes as Partial<PourTargetMap>);
			syncDraft();
			toast.ok("Pour targets saved.");
			return true;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not save pour targets.");
			return false;
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
			toast.error(err instanceof Error ? err.message : "Could not reset pour targets.");
			syncDraft();
		}
	}
</script>

<p class="lead">
	Cocktails default to 20%, the usual mixed-drink target. Saved in Baserow for the whole
	team.
</p>
{#if pourSettings.error && !pourSettings.saving}
	<p class="warn" role="status">{pourSettings.error}</p>
{/if}
<div class="rows">
	{#each DRINK_TYPES as row (row.value)}
		<Field
			label={POUR_TARGET_META[row.value].label}
			for={`${idPrefix}-${row.value}`}
			width="xs"
			hint={POUR_TARGET_META[row.value].blurb}
			error={showErrors ? checked.errors[row.value] || "" : ""}
		>
			<NumberField
				id={`${idPrefix}-${row.value}`}
				size="sm"
				unit="%"
				min={POUR_TARGET_RULES.min}
				max={POUR_TARGET_RULES.max}
				step={1}
				decimals={1}
				noun={POUR_TARGET_RULES.noun}
				disabled={pourSettings.saving}
				bind:value={draft[row.value]}
			/>
		</Field>
	{/each}
</div>
{#if showActions}
	<div class="actions">
		{#if checked.dirty}<span class="unsaved">Unsaved changes</span>{/if}
		{#if showReset}
			<Button
				variant="outline"
				size="sm"
				type="button"
				disabled={pourSettings.saving}
				onclick={() => void reset()}
			>
				{#snippet icon()}<Icon name="undo" size={14} />{/snippet}
				Reset to standard
			</Button>
		{/if}
		<Button
			variant="primary"
			size="sm"
			type="button"
			busy={pourSettings.saving}
			disabled={pourSettings.saving || !checked.dirty}
			reason={!pourSettings.saving && !checked.dirty ? "No changes to save" : undefined}
			onclick={() => void save()}
		>
			{#snippet icon()}<Icon name="save" size={14} />{/snippet}
			Save pour targets
		</Button>
	</div>
{/if}
<ConfirmDialog {confirm} />

<style>
	.lead {
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
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
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-4) var(--space-5);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.unsaved {
		margin-right: auto;
		font-size: var(--text-sm);
		color: var(--warning);
	}
</style>
