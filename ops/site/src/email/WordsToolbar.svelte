<script lang="ts">
	/**
	 * Over the email's preview while its words are typed into
	 * (preview-editing.ts): what to do next in plain words, and big Bold and
	 * Link buttons for copy. The buttons never take the focus from the email,
	 * so the selected words stay selected; a link's address is typed here,
	 * and the words are kept until it's added.
	 */
	import { Button, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import { linkAddress } from "./copy-dom";
	import { addLink, keepSelection, removeLink, toggleBold, type WordsFocus } from "./preview-editing";

	let {
		doc,
		focus,
		editable,
		linking = $bindable(false),
	}: {
		doc: Document | null;
		focus: WordsFocus | null;
		editable: boolean;
		/** A link's address is being typed: the email keeps still meanwhile. */
		linking?: boolean;
	} = $props();

	let kept: Range | null = null;
	let address = $state("");
	let problem = $state("");
	let field = $state<HTMLInputElement | undefined>();

	const copy = $derived(focus?.kind === "copy");
	const hint = $derived(
		!editable
			? "Sent or scheduled: it can't be changed."
			: linking
				? "Type where the link goes, then press Add link."
				: !focus
					? "Click any words in the email to change them."
					: focus.kind === "heading"
						? "Type the heading. Press Enter when it's done."
						: "Type away. Enter starts a new paragraph. Select words to make them bold or a link.",
	);

	/** Keep the email's focus and selection when a button is pressed. */
	const keep = (event: MouseEvent) => event.preventDefault();

	function startLink() {
		if (!doc) return;
		kept = keepSelection(doc);
		address = "";
		problem = "";
		linking = true;
		queueMicrotask(() => field?.focus());
	}

	function finishLink() {
		const link = linkAddress(address);
		if (!link) {
			problem = "That isn't a web address or an email address.";
			return;
		}
		if (doc) addLink(doc, kept, link);
		kept = null;
		linking = false;
	}

	function cancelLink() {
		kept = null;
		linking = false;
	}
</script>

<div class="words-bar" role="toolbar" aria-label="Words">
	{#if linking}
		<div class="link-box">
			<TextField
				bind:element={field}
				bind:value={address}
				placeholder="gwenda.co.uk/whats-on"
				aria-label="Where the link goes"
				onkeydown={(event: KeyboardEvent) => {
					if (event.key === "Enter") {
						event.preventDefault();
						finishLink();
					} else if (event.key === "Escape") cancelLink();
				}}
			/>
			<Button onclick={finishLink}>{#snippet icon()}<Icon name="link" size={16} />{/snippet}Add link</Button>
			<Button variant="ghost" onclick={cancelLink}>Cancel</Button>
		</div>
		{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
	{:else}
		<div class="buttons">
			<Button
				variant={focus?.bold ? "primary" : "outline"}
				aria-pressed={Boolean(focus?.bold)}
				disabled={!editable || !copy}
				reason={!copy ? "Click into some text first" : undefined}
				onmousedown={keep}
				onclick={() => doc && toggleBold(doc)}
			>
				<span class="bold-mark" aria-hidden="true">B</span>Bold
			</Button>
			{#if focus?.inLink}
				<Button variant="outline" disabled={!editable} onmousedown={keep} onclick={() => doc && removeLink(doc)}>
					{#snippet icon()}<Icon name="close" size={16} />{/snippet}Remove link
				</Button>
			{:else}
				<Button
					variant="outline"
					disabled={!editable || !copy || !focus?.selected}
					reason={!copy ? "Click into some text first" : !focus?.selected ? "Select the words to link first" : undefined}
					onmousedown={keep}
					onclick={startLink}
				>
					{#snippet icon()}<Icon name="link" size={16} />{/snippet}Link
				</Button>
			{/if}
		</div>
	{/if}
	<p class="hint" aria-live="polite">{hint}</p>
</div>

<style>
	.words-bar {
		display: grid;
		gap: var(--space-2);
	}
	.buttons,
	.link-box {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.link-box :global(.field-input),
	.link-box :global(input) {
		min-width: 16rem;
	}
	.bold-mark {
		font-weight: 800;
		font-size: 1.05em;
		margin-right: 0.15rem;
	}
	.hint,
	.problem {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
	.problem {
		color: var(--destructive);
	}
</style>
