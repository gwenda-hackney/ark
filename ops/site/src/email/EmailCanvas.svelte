<script lang="ts">
	/**
	 * The one-off email editor's page (#348): the email as a mail app shows
	 * it, from Gwenda, its subject and preview line over it, both typed
	 * straight in; then the email itself, as tall as the page allows, edited
	 * where it is (preview-editing.ts), at Desktop or Phone width. The frame
	 * runs no scripts; ops reaches into it to edit.
	 */
	import { previewDocument } from "./email-view";

	let {
		email,
		width = "desktop",
		subject = $bindable(""),
		previewText = $bindable(""),
		editable,
		onframe,
	}: {
		email: { html: string } | null;
		width?: string;
		subject?: string;
		previewText?: string;
		editable: boolean;
		/** Each time the frame has loaded the email: its document. */
		onframe: (doc: Document) => void;
	} = $props();

	// The frame is as tall as the email, so the mail head and the email scroll
	// as one page; it keeps its height while the email is drawn again, so the
	// page keeps its place.
	let frameEl = $state<HTMLIFrameElement | null>(null);
	let watching: ResizeObserver | null = null;
	const srcdoc = $derived(email ? previewDocument(email.html) : "");

	function fit(doc: Document) {
		if (frameEl) frameEl.style.height = `${Math.ceil(doc.documentElement.scrollHeight)}px`;
	}

	function loaded() {
		const doc = frameEl?.contentDocument;
		if (!doc) return;
		const still = doc.createElement("style");
		still.textContent = "html, body { overflow: hidden !important; }";
		doc.head.append(still);
		fit(doc);
		watching?.disconnect();
		// Pictures arriving and typing make it taller or shorter.
		watching = new ResizeObserver(() => fit(doc));
		watching.observe(doc.body);
		onframe(doc);
	}

	$effect(() => () => watching?.disconnect());

	/** The subject and preview line are one line each: Enter finishes rather than breaking it. */
	function oneLine(event: KeyboardEvent) {
		if (event.key === "Enter") {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).blur();
		}
	}
</script>

<div class="stage">
	<div class="mail {width}">
		<div class="from" aria-hidden="true">G</div>
		<div class="mail-lines">
			<p class="sender">Gwenda <span class="to">to you</span></p>
			<!-- Lines that wrap and grow with what's typed, never cut off; Enter just finishes. -->
			<textarea class="subject" rows="1" bind:value={subject} maxlength={150} disabled={!editable} placeholder="Type the subject" aria-label="Subject" onkeydown={oneLine}></textarea>
			<textarea class="preview" rows="1" bind:value={previewText} maxlength={200} disabled={!editable} placeholder="Type the line inboxes show after the subject" aria-label="Preview line" onkeydown={oneLine}></textarea>
		</div>
	</div>
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

<style>
	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		min-height: 0;
		border-radius: var(--radius-md);
		background: #1a1510;
		overflow-y: auto;
		overflow-x: hidden;
	}
	/* A mail app's head over the message: who it's from, the subject, the line after it. */
	.mail {
		display: flex;
		gap: 1rem;
		width: 100%;
		max-width: 680px;
		padding: 1.25rem 1.25rem 1.1rem;
		border-bottom: 1px solid #3a332a;
		color: #f2e8d2;
	}
	.mail.phone,
	.frame.phone {
		max-width: 390px;
	}
	.from {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: #dba63c;
		color: #1a1510;
		font-weight: 700;
	}
	.mail-lines {
		display: grid;
		gap: 0.35rem;
		flex: 1;
		min-width: 0;
	}
	.sender {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.to {
		font-weight: 400;
		color: #c2b79f;
	}
	.subject,
	.preview {
		display: block;
		width: 100%;
		min-width: 0;
		padding: 0.2rem 0.35rem;
		margin-left: -0.35rem;
		border: 0;
		border-radius: 4px;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		resize: none;
		overflow: hidden;
		/* As tall as its words: it wraps instead of cutting off. */
		field-sizing: content;
		min-height: 1lh;
	}
	.subject {
		font-size: var(--text-xl);
		font-weight: 700;
		line-height: 1.3;
	}
	.preview {
		font-size: var(--text-base);
		line-height: 1.45;
		color: #c2b79f;
	}
	.subject:not(:disabled):hover,
	.preview:not(:disabled):hover,
	.subject:focus,
	.preview:focus {
		background: rgb(219 166 60 / 0.14);
	}
	.subject::placeholder,
	.preview::placeholder {
		color: #8a8070;
		font-style: italic;
	}
	.mail {
		flex: none;
	}
	.frame {
		flex: none;
		width: 100%;
		max-width: 680px;
	}
	iframe {
		display: block;
		width: 100%;
		height: 40rem;
		border: 0;
	}
	.blank {
		display: grid;
		place-items: center;
		height: 100%;
		color: #c2b79f;
		font-size: var(--text-sm);
	}
</style>
