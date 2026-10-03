<script lang="ts">
	import { Button, BusyOverlay } from "../ui";
	import { formatPublishDiff, groupItemsForPublish, publishFieldLabel } from "./publish";
	import { type MenuItem } from "./types";
	import { Icon } from "../app/shell";

	let {
		items = [],
		busy = false,
		busyLabel = "Updating website…",
		onpublish,
		onclose,
	}: {
		items?: MenuItem[];
		busy?: boolean;
		busyLabel?: string;
		onpublish: () => void | Promise<void>;
		onclose: () => void;
	} = $props();

	const actionLabel = "Update website";

	// Compared with what gwenda.co.uk shows (#42).
	const groups = $derived(groupItemsForPublish(items, "production"));
	const pending = $derived(groups.unpublished.length + groups.missing.length);
</script>

<aside class="panel" aria-label="Update website" aria-busy={busy || undefined}>
	<BusyOverlay active={busy} label={busyLabel} />
	<header class="head">
		<div>
			<p class="eyebrow">Website</p>
			<h2>Update menu</h2>
		</div>
		<Button
			variant="ghost"
			size="sm"
			type="button"
			aria-label="Close"
			disabled={busy}
			onclick={onclose}
		>
			{#snippet icon()}
				<Icon name="close" size={16} />
			{/snippet}
		</Button>
	</header>

	<div class="body scrollbar-fade">
		<p class="lede">Put your saved menu changes on gwenda.co.uk.</p>

		<p class="note">The menu page shows them about 2 minutes later.</p>

		<div class="status">
			<p class="status-lead">
				{#if pending === 0}
					The website already shows every drink.
				{:else}
					{pending} drink{pending === 1 ? "" : "s"} to update on the website.
				{/if}
			</p>

			{#if groups.unpublished.length}
				<section class="group">
					<h3>Unpublished ({groups.unpublished.length})</h3>
					<ul>
						{#each groups.unpublished as row (row.name)}
							<li>
								<span class="name">{row.name}</span>
								{#if row.diff?.length}
									<ul class="diff">
										{#each row.diff as change (change.field)}
											<li>
												{publishFieldLabel(change.field)}:
												{formatPublishDiff(change)}
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if groups.missing.length}
				<section class="group">
					<h3>Not on the website ({groups.missing.length})</h3>
					<p class="group-note">
						No stored website id yet. Publish will match by name or create
						them on the site.
					</p>
					<ul>
						{#each groups.missing as row (row.name)}
							<li>{row.name}</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if groups.unknown.length}
				<section class="group">
					<h3>No recorded snapshot ({groups.unknown.length})</h3>
					<p class="group-note">
						Already linked to the website. The next update stores a baseline
						so later edits can show a field-by-field diff.
					</p>
				</section>
			{/if}

			{#if groups.published.length && pending === 0}
				<p class="group-note">
					{groups.published.length} drink{groups.published.length === 1
						? ""
						: "s"} already match.
				</p>
			{/if}
		</div>
	</div>

	<footer class="foot">
		<Button
			variant="outline"
			size="sm"
			type="button"
			disabled={busy}
			onclick={onclose}
		>
			Cancel
		</Button>
		<Button
			variant="primary"
			size="sm"
			type="button"
			disabled={busy}
			{busy}
			onclick={onpublish}
		>
			{#snippet icon()}
				<Icon name="upload" size={15} />
			{/snippet}
			{busy ? "Updating…" : actionLabel}
		</Button>
	</footer>
</aside>

<style>
	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--card);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--card-pad);
		border-bottom: 1px solid var(--border);
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: grid;
		gap: var(--space-4);
		align-content: start;
		padding: var(--card-pad);
	}

	.lede {
		margin: 0;
		font-size: var(--text-md);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.note {
		margin: 0;
		padding: var(--space-3) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
		font-size: var(--text-base);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	.status {
		display: grid;
		gap: var(--space-3);
	}

	.status-lead {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 500;
	}

	.group {
		display: grid;
		gap: var(--space-1);
	}

	.group h3 {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.group-note {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.group ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.2rem;
	}

	.group li {
		font-size: var(--text-base);
		line-height: 1.4;
	}

	.name {
		font-weight: 500;
	}

	.diff {
		margin: 0.15rem 0 var(--space-1);
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.1rem;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--card-pad);
		border-top: 1px solid var(--border);
	}
</style>
