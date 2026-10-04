<script lang="ts">
	/**
	 * The one confirm: "Delete X?" as the title, one line on what happens,
	 * Cancel and the action (red when destructive). Drive it with a Confirm
	 * (`confirm`), or with props for a dialog the page already controls.
	 * Cancel takes the focus first, so Enter never deletes by accident.
	 */
	import type { Snippet } from "svelte";
	import Button from "./Button.svelte";
	import { Icon } from "../app/shell";
	import Dialog from "./Dialog.svelte";
	import type { Confirm } from "./confirm.svelte";

	let {
		confirm = undefined,
		open = false,
		title = "",
		message = "",
		action = "Delete",
		tone = "destructive",
		cancelLabel = "Cancel",
		busy = false,
		busyLabel = "",
		error = "",
		disabled = false,
		oncancel = () => {},
		onconfirm = () => {},
		children,
	}: {
		confirm?: Confirm;
		open?: boolean;
		title?: string;
		message?: string;
		action?: string;
		tone?: "destructive" | "primary";
		cancelLabel?: string;
		busy?: boolean;
		/** On the action while busy: "Deleting…". */
		busyLabel?: string;
		error?: string;
		disabled?: boolean;
		oncancel?: () => void;
		onconfirm?: () => void;
		/** More detail under the message. */
		children?: Snippet;
	} = $props();

	const isOpen = $derived(confirm ? confirm.open : open);
	const shownTitle = $derived(confirm?.request?.title ?? title);
	const shownMessage = $derived(confirm?.request?.message ?? message);
	const shownAction = $derived(confirm?.request?.action ?? action);
	const shownTone = $derived(confirm?.request?.tone ?? tone);
	const shownCancel = $derived(confirm?.request?.cancel ?? cancelLabel);
	const isBusy = $derived(confirm ? confirm.busy : busy);
	const shownError = $derived(confirm ? confirm.error : error);

	let cancelWrap = $state<HTMLSpanElement | undefined>();

	$effect(() => {
		if (!isOpen) return;
		// After the dialog has mounted in its portal.
		const timer = setTimeout(() => cancelWrap?.querySelector("button")?.focus(), 30);
		return () => clearTimeout(timer);
	});

	function cancel() {
		if (isBusy) return;
		if (confirm) confirm.cancel();
		else oncancel();
	}

	function accept() {
		if (isBusy || disabled) return;
		if (confirm) void confirm.accept();
		else onconfirm();
	}
</script>

<Dialog open={isOpen} title={shownTitle} onclose={cancel}>
	{#if shownMessage}
		<p class="message">{shownMessage}</p>
	{/if}
	{#if children}
		<div class="more">{@render children()}</div>
	{/if}
	{#if shownError}
		<p class="error" role="alert">{shownError}</p>
	{/if}
	{#snippet footer()}
		<span class="cancel" bind:this={cancelWrap}>
			<Button variant="outline" size="sm" type="button" disabled={isBusy} onclick={cancel}>
				{#snippet icon()}<Icon name="close" size={14} />{/snippet}
				{shownCancel}
			</Button>
		</span>
		<Button
			variant={shownTone === "primary" ? "primary" : "destructive"}
			size="sm"
			type="button"
			disabled={isBusy || disabled}
			busy={isBusy}
			onclick={accept}
		>
			{#snippet icon()}<Icon name={shownTone === "primary" ? "check" : "trash"} size={14} />{/snippet}
			{isBusy && busyLabel ? busyLabel : shownAction}
		</Button>
	{/snippet}
</Dialog>

<style>
	.message {
		margin: 0;
		font-size: var(--text-base);
		line-height: var(--leading-base);
		color: var(--foreground);
	}

	.more {
		margin-top: var(--space-3);
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--muted-foreground);
	}

	.more :global(p) {
		margin: 0;
	}

	.more :global(p + p) {
		margin-top: var(--space-2);
	}

	.error {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--danger);
	}

	.cancel {
		display: contents;
	}
</style>
