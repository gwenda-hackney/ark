<script lang="ts">
	/**
	 * The one-off email editor's page (#348): the email itself, as big as the
	 * page allows, edited where it is (preview-editing.ts). Above it, as an
	 * inbox shows it, the subject and preview line, typed straight in; a
	 * Desktop or Phone width (Desktop first, for room); and More, for the
	 * side nav. The frame runs no scripts; ops reaches into it to edit.
	 */
	import { Segmented } from "../ui";
	import { Icon } from "../app/shell";
	import { previewDocument } from "./email-view";

	let {
		email,
		subject = $bindable(""),
		previewText = $bindable(""),
		editable,
		onframe,
		onmore,
	}: {
		email: { html: string } | null;
		subject?: string;
		previewText?: string;
		editable: boolean;
		/** Each time the frame has loaded the email: its document. */
		onframe: (doc: Document) => void;
		/** More was pressed: the side nav for the whole email. */
		onmore: () => void;
	} = $props();

	const WIDTHS = [
		{ id: "desktop", label: "Desktop" },
		{ id: "phone", label: "Phone" },
	];
	let width = $state("desktop");

	// The frame keeps its place while the email is drawn again under it.
	let frameEl = $state<HTMLIFrameElement | null>(null);
	let scrollTop = 0;
	const srcdoc = $derived(email ? previewDocument(email.html) : "");
	$effect.pre(() => {
		void srcdoc;
		try {
			scrollTop = frameEl?.contentWindow?.scrollY ?? scrollTop;
		} catch {
			// Not readable: it starts at the top.
		}
	});
	function loaded() {
		try {
			if (scrollTop) frameEl?.contentWindow?.scrollTo(0, scrollTop);
		} catch {
			// Not readable: it stays at the top.
		}
		const doc = frameEl?.contentDocument;
		if (doc) onframe(doc);
	}
</script>

<div class="canvas-page">
	<div class="inbox">
		<label class="line">
			<span class="line-label">Subject</span>
			<input class="line-input subject" bind:value={subject} maxlength={150} disabled={!editable} placeholder="Type the subject" autocomplete="off" />
		</label>
		<label class="line">
			<span class="line-label">Preview</span>
			<input class="line-input" bind:value={previewText} maxlength={200} disabled={!editable} placeholder="The line inboxes show after the subject" autocomplete="off" />
		</label>
		<div class="inbox-tools">
			<Segmented bind:value={width} items={WIDTHS} tone="soft" size="sm" ariaLabel="Email width" />
			<button type="button" class="more" onclick={onmore} aria-label="More: the email's name and all its parts">
				<Icon name="more" size={16} /><span>More</span>
			</button>
		</div>
	</div>

	<div class="stage">
		<div class="frame {width}">
			{#if email}
				<iframe
					bind:this={frameEl}
					title="The email"
					sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					referrerpolicy="no-referrer"
					{srcdoc}
					onload={loaded}
				></iframe>
			{:else}
				<div class="blank">Loading the email…</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.canvas-page {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--space-2);
		height: 100%;
		min-height: 0;
	}
	.inbox {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2) var(--space-4);
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-sm, 6px);
	}
	.line:hover,
	.line:focus-within {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
	}
	.line-label {
		flex: none;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.line-input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--text-sm);
		padding: 0;
	}
	.line-input.subject {
		font-weight: 600;
	}
	.inbox-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.more {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--card);
		color: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.more:hover {
		border-color: var(--primary);
	}
	.stage {
		display: flex;
		justify-content: center;
		min-height: 0;
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--foreground) 6%, transparent);
		overflow: hidden;
	}
	.frame {
		flex: none;
		width: 100%;
		max-width: 760px;
		height: 100%;
		background: #1a1510;
	}
	.frame.phone {
		max-width: 390px;
	}
	iframe {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
	}
	.blank {
		display: grid;
		place-items: center;
		height: 100%;
		color: #c2b79f;
		font-size: var(--text-sm);
	}
	@media (max-width: 900px) {
		.inbox {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
