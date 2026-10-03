<script lang="ts">
	/** Delete a whole event (and its recurrence). */
	import { Button, Dialog } from "../../ui";

	let {
		open,
		eventName,
		recurring,
		onWebsite,
		busy,
		deleting,
		oncancel,
		onconfirm,
	}: {
		open: boolean;
		eventName: string;
		recurring: boolean;
		onWebsite: boolean;
		busy: boolean;
		deleting: boolean;
		oncancel: () => void;
		onconfirm: () => void;
	} = $props();
</script>

<Dialog {open} title="Delete event?" onclose={oncancel}>
	<p class="delete-copy">
		Delete <strong>{eventName}</strong>
		{recurring ? " and its recurrence" : ""}?{onWebsite ? "" : " This cannot be undone."}
	</p>
	{#if onWebsite}
		<p class="also-website">
			It stays on the website until you press Update website on the Website page. Until then you can
			restore it there.
		</p>
	{/if}
	{#snippet footer()}
		<Button variant="outline" size="sm" type="button" disabled={busy} onclick={oncancel}>
			Cancel
		</Button>
		<Button
			variant="destructive"
			size="sm"
			type="button"
			disabled={busy}
			busy={deleting}
			onclick={onconfirm}
		>
			{deleting ? "Deleting…" : "Delete"}
		</Button>
	{/snippet}
</Dialog>

<style>
	.delete-copy {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--foreground);
	}

	.delete-copy strong {
		font-weight: 600;
	}

	.also-website {
		margin: 0.85rem 0 0;
		font-size: var(--text-sm);
	}
</style>
