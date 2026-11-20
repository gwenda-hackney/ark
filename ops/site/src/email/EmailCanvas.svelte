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

<div class="stage">
	<div class="mail {width}">
		<div class="from" aria-hidden="true">G</div>
		<div class="mail-lines">
			<p class="sender">Gwenda <span class="to">to you</span></p>
			<input class="subject" bind:value={subject} maxlength={150} disabled={!editable} placeholder="Type the subject" aria-label="Subject" autocomplete="off" />
			<input class="preview" bind:value={previewText} maxlength={200} disabled={!editable} placeholder="Type the line inboxes show after the subject" aria-label="Preview line" autocomplete="off" />
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
		overflow: hidden;
	}
	/* A mail app's head over the message: who it's from, the subject, the line after it. */
	.mail {
		display: flex;
		gap: 0.75rem;
		width: 100%;
		max-width: 680px;
		padding: 0.75rem 1rem 0.65rem;
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
		gap: 0.1rem;
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
		width: 100%;
		min-width: 0;
		padding: 0.1rem 0.25rem;
		margin-left: -0.25rem;
		border: 0;
		border-radius: 4px;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
	}
	.subject {
		font-size: var(--text-lg);
		font-weight: 700;
	}
	.preview {
		font-size: var(--text-sm);
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
	.frame {
		flex: 1;
		width: 100%;
		max-width: 680px;
		min-height: 0;
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
</style>
