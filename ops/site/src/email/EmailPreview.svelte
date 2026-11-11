<script lang="ts">
	/**
	 * This week's email as it would go out: subject, preview line, and the
	 * email itself in a locked-down frame at phone or desktop width.
	 */
	import { Segmented } from "../ui";
	import type { WeeklyEmailPreview } from "./email-api";
	import { contentsLine, previewDocument, shortDay } from "./email-view";

	let { email, problem = "", loading = false }: { email: WeeklyEmailPreview | null; problem?: string; loading?: boolean } =
		$props();

	const WIDTHS = [
		{ id: "phone", label: "Phone" },
		{ id: "desktop", label: "Desktop" },
	];
	let width = $state("phone");
</script>

<section class="card" aria-labelledby="email-preview-title">
	<header class="head">
		<div>
			<h2 id="email-preview-title">This week's email</h2>
			<p class="muted">
				{#if email}
					As it would go out now, for {shortDay(email.today)} to {shortDay(email.week.end)}. {contentsLine(email)}.
				{:else if problem}
					Couldn't be built just now.
				{:else}
					Building it from the website…
				{/if}
			</p>
		</div>
		<Segmented bind:value={width} items={WIDTHS} tone="soft" size="sm" ariaLabel="Preview width" />
	</header>

	{#if problem}
		<p class="note danger" role="alert">{problem}</p>
	{/if}
	{#if email?.empty}
		<p class="note warn">{email.emptyReason}</p>
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

	<div class="stage" class:busy={loading}>
		<div class="frame {width}">
			{#if email}
				<iframe
					title="This week's email"
					sandbox="allow-popups allow-popups-to-escape-sandbox"
					referrerpolicy="no-referrer"
					srcdoc={previewDocument(email.html)}
				></iframe>
			{:else}
				<div class="blank">{problem ? "No preview" : "Loading…"}</div>
			{/if}
		</div>
	</div>
	<p class="muted small">
		Built from what's published on the website right now, so it matches What's on. Links go to {email?.origin ||
			"the website"}.
	</p>
</section>

<style>
	.card {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	h2 {
		margin: 0;
		font-size: var(--text-base);
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
