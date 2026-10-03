<script lang="ts">
	/** The new night's date already has another event: replace it, or keep both. */
	import { Button, Dialog } from "../../ui";
	import { formatDate } from "../event-labels";

	let {
		prompt,
		eventName,
		replacing,
		onchoose,
		onclose,
	}: {
		/** The night already on that date, or null when closed. */
		prompt: { date: string; name: string } | null;
		eventName: string;
		replacing: boolean;
		onchoose: (replace: boolean) => void;
		onclose: () => void;
	} = $props();
</script>

<Dialog
	open={prompt !== null}
	title={prompt ? `${formatDate(prompt.date)} already has ${prompt.name}` : ""}
	{onclose}
>
	<p class="delete-copy">
		Cancel that night and show {eventName} instead, or keep both?
	</p>
	{#snippet footer()}
		<Button
			variant="outline"
			size="sm"
			type="button"
			disabled={replacing}
			onclick={() => onchoose(false)}
		>
			Keep both
		</Button>
		<Button
			size="sm"
			type="button"
			disabled={replacing}
			busy={replacing}
			onclick={() => onchoose(true)}
		>
			Show {eventName} instead
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
</style>
