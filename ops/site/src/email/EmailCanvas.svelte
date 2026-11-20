<script lang="ts">
	/**
	 * The one-off email editor's left half (#348): the email itself, the
	 * full height of the page, edited where it is (preview-editing.ts), at
	 * Desktop or Phone width. The frame runs no scripts; ops reaches into it
	 * to edit.
	 */
	import { previewDocument } from "./email-view";

	let {
		email,
		width = "desktop",
		onframe,
	}: {
		email: { html: string } | null;
		width?: string;
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
		justify-content: center;
		height: 100%;
		min-height: 0;
		border-radius: var(--radius-md);
		background: #1a1510;
		overflow: hidden;
	}
	.frame {
		flex: none;
		width: 100%;
		max-width: 680px;
		height: 100%;
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
</style>
