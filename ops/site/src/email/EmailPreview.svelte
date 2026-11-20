<script lang="ts">
	/**
	 * An email as it would arrive: subject, preview line, and the email itself
	 * in a locked-down frame at phone or desktop width. The monthly what's on's
	 * editor and the one-off email editor (#348) both show it here.
	 */
	import type { Snippet } from "svelte";
	import { Card, Segmented } from "../ui";
	import { previewDocument } from "./email-view";

	let {
		email,
		title,
		subtitle = "",
		problem = "",
		warning = "",
		note = "",
		blank = "Loading…",
		loading = false,
		frameHeight = "",
		onframe,
		toolbar,
	}: {
		email: { subject: string; preheader: string; html: string } | null;
		title: string;
		subtitle?: string;
		/** Why there's no email to show. */
		problem?: string;
		/** Something to know about the email shown. */
		warning?: string;
		/** The small print under the frame. */
		note?: string;
		/** What the empty frame says. */
		blank?: string;
		loading?: boolean;
		/** The frame's height, when it should fit beside an editor rather than its usual 44rem. */
		frameHeight?: string;
		/** Each time the frame has loaded an email: its document (the editor types into it). */
		onframe?: (doc: Document) => void;
		/** Above the frame: the editor's buttons. */
		toolbar?: Snippet;
	} = $props();

	const WIDTHS = [
		{ id: "phone", label: "Phone" },
		{ id: "desktop", label: "Desktop" },
	];
	let width = $state("phone");

	// The frame keeps its place while the email changes under it (typing in
	// the editor redraws it): where it was is read before the new one loads
	// and put back once it has. Same-origin only so ops can read the scroll;
	// no scripts run in it either way.
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
		if (doc && onframe) onframe(doc);
	}
</script>

<Card {title} {subtitle}>
	{#snippet actions()}
		<Segmented bind:value={width} items={WIDTHS} tone="soft" size="sm" ariaLabel="Preview width" />
	{/snippet}
	<div class="stack">
	{#if problem}
		<p class="note danger" role="alert">{problem}</p>
	{/if}
	{#if warning}
		<p class="note warn">{warning}</p>
	{/if}

	<dl class="lines">
		<div>
			<dt>Subject</dt>
			<dd>{email?.subject || "—"}</dd>
		</div>
		<div>
			<dt>Preview line</dt>
			<dd>{email?.preheader || "—"}</dd>
		</div>
	</dl>

	{#if toolbar}{@render toolbar()}{/if}
	<div class="stage" class:busy={loading}>
		<div class="frame {width}" style:height={frameHeight || undefined}>
			{#if email}
				<iframe
					bind:this={frameEl}
					{title}
					sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					referrerpolicy="no-referrer"
					{srcdoc}
					onload={loaded}
				></iframe>
			{:else}
				<div class="blank">{problem ? "No preview" : blank}</div>
			{/if}
		</div>
	</div>
	{#if note}<p class="muted small">{note}</p>{/if}
	</div>
</Card>

<style>
	.stack {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}
	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
	.small {
		font-size: var(--text-xs);
	}
	.note {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		border: 1px solid var(--border);
	}
	.note.warn {
		border-color: color-mix(in srgb, var(--warning, #b7791f) 50%, var(--border));
		background: color-mix(in srgb, var(--warning, #b7791f) 10%, transparent);
	}
	.note.danger {
		border-color: color-mix(in srgb, var(--destructive) 50%, var(--border));
		color: var(--destructive);
	}
	.lines {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}
	.lines div {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr);
		gap: var(--space-2);
		font-size: var(--text-sm);
	}
	dt {
		color: var(--muted-foreground);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.stage {
		display: flex;
		justify-content: center;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--foreground) 6%, transparent);
		overflow-x: auto;
	}
	.stage.busy {
		opacity: 0.6;
	}
	.frame {
		flex: none;
		width: 375px;
		max-width: 100%;
		height: 44rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: #1a1510;
	}
	.frame.desktop {
		width: 680px;
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
