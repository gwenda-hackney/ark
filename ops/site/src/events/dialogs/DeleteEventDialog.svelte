<script lang="ts">
	/**
	 * Delete a series, a special event, or one night of an open series. The
	 * title names what goes, so a night never reads as the whole event.
	 */
	import { ConfirmDialog } from "../../ui";
	import { deleteEventCopy } from "../event-labels";

	let {
		open,
		eventName,
		kind,
		nightDate = "",
		seriesName = "",
		onWebsite,
		busy,
		deleting,
		oncancel,
		onconfirm,
	}: {
		open: boolean;
		eventName: string;
		/** What the Delete removes. */
		kind: "series" | "event" | "night";
		/** The night's date ("YYYY-MM-DD") when kind is "night". */
		nightDate?: string;
		/** The series a night belongs to. */
		seriesName?: string;
		onWebsite: boolean;
		busy: boolean;
		deleting: boolean;
		oncancel: () => void;
		onconfirm: () => void;
	} = $props();

	const copy = $derived(deleteEventCopy({ kind, eventName, nightDate, seriesName, onWebsite }));
</script>

<ConfirmDialog
	{open}
	title={copy.title}
	message={copy.message}
	action="Delete"
	busyLabel="Deleting…"
	busy={deleting}
	disabled={busy}
	{oncancel}
	{onconfirm}
>
	{#if copy.website}
		<p>{copy.website}</p>
	{/if}
</ConfirmDialog>
