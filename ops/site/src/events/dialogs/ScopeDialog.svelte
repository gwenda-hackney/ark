<script lang="ts">
	/**
	 * "Which events?" for a night of a series: this one, this and following,
	 * or all future ones. Used when saving a night and when deleting one.
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
		/** The last choice is destructive (deleting). */
		destructive?: boolean;
		allBusy?: boolean;
		onchoose: (scope: Scope) => void;
		onclose: () => void;
	} = $props();
</script>

<Dialog {open} {title} {onclose}>
	<p class="delete-copy">{message}</p>
	{#if alsoWebsite}
		<p class="also-website">It comes off the website when you press Update website.</p>
	{/if}
	<div class="scope-options">
		<Button type="button" variant="outline" {disabled} onclick={() => onchoose("this")}>
			This event
		</Button>
		<Button type="button" variant="outline" {disabled} onclick={() => onchoose("following")}>
			This and following
		</Button>
		<Button
			type="button"
			variant={destructive ? "destructive" : undefined}
			{disabled}
			busy={allBusy}
			onclick={() => onchoose("all")}
		>
			All future events
		</Button>
	</div>
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
		gap: var(--space-3);
		margin-top: var(--space-4);
	}
</style>
