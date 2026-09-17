<script lang="ts">
	import { Button, BusyOverlay, Field, NativeSelect } from "../../ui";
	import type { SelectOption } from "../../ui/types";
	import {
		formatPublishDiff,
		groupItemsForPublish,
		publishFieldLabel,
		type MenuItem,
		type PublishTarget,
	} from "../../lib/types";
	import { Icon } from "../../shell";

	let {
		publishTarget = $bindable("staging" as PublishTarget),
		items = [],
		busy = false,
		busyLabel = "Updating website…",
		onpublish,
		onclose,
	}: {
		publishTarget?: PublishTarget;
		items?: MenuItem[];
		busy?: boolean;
		busyLabel?: string;
		onpublish: () => void | Promise<void>;
		onclose: () => void;
	} = $props();

	const publishOptions: SelectOption[] = [
		{ value: "staging", label: "Preview site" },
		{ value: "production", label: "Live website" },
	];

	const actionLabel = $derived(
		publishTarget === "production"
			? "Update live website"
			: "Update preview site",
	);

	const groups = $derived(groupItemsForPublish(items, publishTarget));
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
		<p class="lede">
			Push your saved menu changes to the website so guests can see them.
		</p>

		<Field label="Where" for="publish-target">
			<NativeSelect
				id="publish-target"
				size="sm"
				options={publishOptions}
				value={publishTarget}
				disabled={busy}
				onchange={(e) => {
					publishTarget = (e.currentTarget as HTMLSelectElement)
						.value as PublishTarget;
					localStorage.setItem("gwenda-ops-menu-publish", publishTarget);
				}}
			/>
		</Field>

		{#if publishTarget === "staging"}
			<p class="note">
				Updates the preview site only. Use this to check the menu before it
				goes live.
			</p>
		{:else}
			<p class="note warn">
				Updates the live website. Check names and prices look right before you
				continue.
			</p>
		{/if}

		<div class="status">
			<p class="status-lead">
				{#if pending === 0}
					All tracked drinks match this site.
				{:else}
					{pending} drink{pending === 1 ? "" : "s"} to update on this site.
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
						No stored website id. Publish will try to match by name.
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
		gap: var(--gap);
		padding: var(--card-pad);
		border-bottom: 1px solid var(--border);
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: grid;
		gap: 1rem;
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
		padding: 0.75rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
		font-size: var(--text);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	.note.warn {
		border-color: var(--border-strong);
		background: var(--primary-wash);
		color: color-mix(in srgb, var(--primary) 70%, var(--foreground));
	}

	.status {
		display: grid;
		gap: 0.85rem;
	}

	.status-lead {
		margin: 0;
		font-size: var(--text);
		font-weight: 500;
	}

	.group {
		display: grid;
		gap: 0.35rem;
	}

	.group h3 {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.group-note {
		margin: 0;
		font-size: var(--text);
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
		font-size: var(--text);
		line-height: 1.4;
	}

	.name {
		font-weight: 500;
	}

	.diff {
		margin: 0.15rem 0 0.35rem;
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
		gap: 0.5rem;
		padding: var(--card-pad);
		border-top: 1px solid var(--border);
	}
</style>
