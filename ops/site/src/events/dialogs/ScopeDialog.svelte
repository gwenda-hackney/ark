<script lang="ts">
	import { Icon } from "../../app/shell";
	/**
	 * "Which nights?" for a night of a series: this one, this and later, or
	 * all future ones. Used when saving a night and when deleting one. The
	 * three choices weigh the same, so the widest one is never the obvious
	 * press, and Cancel backs out.
	 */
	import { Button, Dialog } from "../../ui";

	type Scope = "this" | "following" | "all";

	let {
		open,
		title,
		message,
		alsoWebsite = false,
		disabled = false,
		destructive = false,
		allBusy = false,
		onchoose,
		onclose,
	}: {
		open: boolean;
		title: string;
		message: string;
		/** Say when it comes off the website (deleting a night that's live). */
		alsoWebsite?: boolean;
		disabled?: boolean;
		/** Deleting: the choices say so. */
		destructive?: boolean;
		allBusy?: boolean;
		onchoose: (scope: Scope) => void;
		onclose: () => void;
	} = $props();

	const verb = $derived(destructive ? "Delete" : "Change");
</script>

<Dialog {open} {title} {onclose}>
	<p class="delete-copy">{message}</p>
	{#if alsoWebsite}
		<p class="also-website">It comes off the website when you press Update website.</p>
	{/if}
	<div class="scope-options" class:destructive>
		<Button type="button" variant="outline" {disabled} onclick={() => onchoose("this")}>
			{#snippet icon()}<Icon name="calendar" size={16} />{/snippet}
			{verb} this night only
		</Button>
		<Button type="button" variant="outline" {disabled} onclick={() => onchoose("following")}>
			{#snippet icon()}<Icon name="calendar" size={16} />{/snippet}
			{verb} this night and later ones
		</Button>
		<Button
			type="button"
			variant="outline"
			{disabled}
			busy={allBusy}
			onclick={() => onchoose("all")}
		>
			{#snippet icon()}<Icon name="calendar" size={16} />{/snippet}
			{verb} all future nights
		</Button>
	</div>
	{#snippet footer()}
		<Button variant="outline" size="sm" type="button" disabled={allBusy} onclick={onclose}>
			{#snippet icon()}<Icon name="close" size={14} />{/snippet}
			Cancel
		</Button>
	{/snippet}
</Dialog>

<style>
	.delete-copy {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.45;
		color: var(--foreground);
	}

	.also-website {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
	}

	.scope-options {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}

	.scope-options :global(.btn) {
		justify-content: flex-start;
	}

	.scope-options.destructive :global(.btn:not(:disabled)) {
		color: var(--danger);
	}
</style>
