<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import { BusyOverlay, Button, Card, Dialog, PageHeader } from "../../ui";
	import {
		getWebStatus,
		promoteWebsite,
		type WebEnvStatus,
		type WebStatus,
	} from "../../lib/api";
	import { loginNext } from "../../lib/nav";
	import { toast } from "../../lib/toast.svelte";
	import { easeOut, flyMs } from "../../lib/motion";

	let status = $state<WebStatus | null>(null);
	let loaded = $state(false);
	let loadError = $state("");
	let promoting = $state(false);
	let confirmTarget = $state<"staging" | "production" | null>(null);

	const environments = $derived(
		status
			? [status.environments.staging, status.environments.production]
			: [],
	);

	function shortCommit(commit: string | null): string {
		if (!commit) return "n/a";
		return commit.slice(0, 7);
	}

	function healthLabel(env: WebEnvStatus): string {
		if (!env.hosted) return "Local only";
		if (env.health.down) return "Down";
		if (env.health.ok === true) return "Up";
		if (env.health.ok === false) return "Unhealthy";
		return "Unknown";
	}

	function healthTone(env: WebEnvStatus): "up" | "down" | "muted" {
		if (!env.hosted) return "muted";
		if (env.health.down || env.health.ok === false) return "down";
		if (env.health.ok === true) return "up";
		return "muted";
	}

	function formatTime(value: number | null): string {
		if (!value) return "n/a";
		try {
			return new Date(value).toLocaleString("en-GB", {
				dateStyle: "medium",
				timeStyle: "short",
			});
		} catch {
			return "n/a";
		}
	}

	function formatUpdated(value: string | null): string {
		if (!value) return "n/a";
		try {
			return new Date(value).toLocaleString("en-GB", {
				dateStyle: "medium",
				timeStyle: "short",
			});
		} catch {
			return value;
		}
	}

	async function load() {
		try {
			status = await getWebStatus();
			loadError = "";
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to load website status.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/web"))}`;
				return;
			}
			loadError = message;
		} finally {
			loaded = true;
		}
	}

	onMount(() => {
		void load();
	});

	async function promote() {
		if (promoting || !confirmTarget) return;
		const target = confirmTarget;
		promoting = true;
		try {
			const result = await promoteWebsite(target);
			confirmTarget = null;
			if (result.alreadyRunning) {
				toast.ok("A promote is already running.");
			} else if (target === "staging") {
				toast.ok("Promote started. Staging is rebuilding from published content.");
			} else {
				toast.ok("Promote started. Staging is copying onto production.");
			}
			await load();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not promote.",
			);
		} finally {
			promoting = false;
		}
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Web"
		subtitle="Staging versus production. Local and draft work stays on your branch."
	>
		{#snippet actions()}
			<Button
				variant="outline"
				size="sm"
				disabled={!loaded || promoting}
				onclick={() => void load()}
			>
				Refresh
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={!loaded || !status || promoting}
				onclick={() => {
					confirmTarget = "staging";
				}}
			>
				Promote to staging
			</Button>
			<Button
				variant="primary"
				size="sm"
				disabled={!loaded || !status || promoting}
				onclick={() => {
					confirmTarget = "production";
				}}
			>
				Promote to production
			</Button>
		{/snippet}
	</PageHeader>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if status}
		<div class="ready" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<Card
				title="Environment sync"
				subtitle={status.driftLabel}
				class={status.environments.production.health.down
					? "heat-bad"
					: status.drift.inSync
						? "heat-ok"
						: ""}
			>
				<dl class="summary">
					<div>
						<dt>Staging vs production</dt>
						<dd>
							{#if status.drift.contentAhead}
								Staging content is ahead
							{:else if status.drift.codeAhead}
								Staging code is ahead
							{:else if status.drift.unknown}
								Unknown
							{:else}
								Match
							{/if}
						</dd>
					</div>
					<div>
						<dt>Production health</dt>
						<dd
							class={healthTone(status.environments.production)}
						>
							{healthLabel(status.environments.production)}
						</dd>
					</div>
					<div>
						<dt>Staging health</dt>
						<dd class={healthTone(status.environments.staging)}>
							{healthLabel(status.environments.staging)}
						</dd>
					</div>
				</dl>
				{#if status.lastError}
					<p class="errors">{status.lastError}</p>
				{/if}
			</Card>

			<div class="envs">
				{#each environments as env (env.id)}
					<Card title={env.label} subtitle="{env.git} · {env.dataset}">
						<dl class="facts">
							<div>
								<dt>Site</dt>
								<dd>
									{#if env.siteUrl}
										<a href={env.siteUrl} target="_blank" rel="noreferrer">
											{env.siteUrl.replace(/^https:\/\//, "")}
											<Icon name="external-link" size={14} />
										</a>
									{:else}
										npm run dev
									{/if}
								</dd>
							</div>
							<div>
								<dt>Code</dt>
								<dd class="mono">{shortCommit(env.code.commit)}</dd>
							</div>
							<div>
								<dt>Content</dt>
								<dd>
									{env.content.count}
									{env.content.count === 1 ? "doc" : "docs"}
									{#if env.content.hash}
										<span class="mono"> · {env.content.hash}</span>
									{/if}
								</dd>
							</div>
							<div>
								<dt>Updated</dt>
								<dd>{formatUpdated(env.content.updatedAt)}</dd>
							</div>
							<div>
								<dt>Health</dt>
								<dd class={healthTone(env)}>{healthLabel(env)}</dd>
							</div>
							<div>
								<dt>Last check</dt>
								<dd>{formatTime(env.health.lastCheckedAt)}</dd>
							</div>
						</dl>
						{#if env.code.error || env.content.error || env.health.lastError}
							<p class="errors">
								{env.health.lastError || env.code.error || env.content.error}
							</p>
						{/if}
					</Card>
				{/each}
			</div>
		</div>
	{/if}
	<BusyOverlay active={!loaded && !loadError} label="Loading…" />
</div>

<Dialog
	open={Boolean(confirmTarget)}
	title={confirmTarget === "staging"
		? "Promote to staging"
		: "Promote staging to production"}
	onclose={() => {
		if (!promoting) confirmTarget = null;
	}}
>
	{#if confirmTarget === "staging"}
		<p>
			This rebuilds gwenda-staging from published staging documents. Drafts stay
			in Studio until you publish them.
		</p>
		<p class="hint">
			Check the staging site before promoting to production.
		</p>
	{:else}
		<p>
			This copies the staging dataset onto production and rebuilds gwenda.co.uk
			from the staging git SHA.
		</p>
		<p class="hint">
			Do not edit Prod Studio content. Change copy in Dev Studio, publish,
			rebuild staging, review, then promote to production.
		</p>
	{/if}
	{#snippet footer()}
		<Button
			variant="outline"
			size="sm"
			disabled={promoting}
			onclick={() => {
				confirmTarget = null;
			}}
		>
			Cancel
		</Button>
		<Button
			variant="primary"
			size="sm"
			busy={promoting}
			disabled={promoting}
			onclick={() => void promote()}
		>
			{promoting
				? "Promoting…"
				: confirmTarget === "staging"
					? "Promote to staging"
					: "Promote to production"}
		</Button>
	{/snippet}
</Dialog>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.ready {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.summary,
	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gap-sm) var(--gap);
		margin: 0;
	}

	dt {
		margin: 0 0 0.15rem;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	dd {
		margin: 0;
		font-size: var(--text);
		line-height: 1.4;
	}

	dd a {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: inherit;
		text-decoration: none;
	}

	dd a:hover {
		color: var(--primary);
	}

	.mono {
		font-variant-numeric: tabular-nums;
		font-family: var(--font);
	}

	.up {
		color: var(--up);
	}

	.down {
		color: var(--down);
	}

	.muted {
		color: var(--muted-foreground);
	}

	.errors,
	.hint {
		margin: 0.85rem 0 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.errors {
		color: var(--down);
	}

	.envs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gap);
	}

	:global(.card.heat-ok) {
		border-color: color-mix(in srgb, var(--up) 32%, var(--border));
	}

	:global(.card.heat-bad) {
		border-color: color-mix(in srgb, var(--down) 40%, var(--border));
	}

	@media (max-width: 1100px) {
		.envs {
			grid-template-columns: 1fr;
		}
	}
</style>
