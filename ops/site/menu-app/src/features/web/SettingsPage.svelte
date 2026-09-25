<script lang="ts">
	/**
	 * Developer tools → Settings: every setting for every environment, and where
	 * each value comes from (shared/config.js). Admins only. Read-only: settings
	 * are edited in the Gwenda Config database, or a developer's .env.
	 */
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import { Button, PageHeader, SearchField } from "../../ui";
	import { getSettingsOverview, type SettingValue, type SettingsOverview } from "../../lib/api";
	import { loginNext, navigate } from "../../lib/nav";
	import { easeOut, flyMs } from "../../lib/motion";

	const ENV_LABELS: Record<string, string> = {
		dev: "Dev",
		staging: "Prod preview",
		production: "Prod",
	};

	let data = $state<SettingsOverview | null>(null);
	let loading = $state(false);
	let loadError = $state("");
	let query = $state("");

	const rows = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const all = data?.settings || [];
		if (!q) return all;
		return all.filter((row) =>
			[row.key, row.about, ...Object.values(row.values).map((v) => v.value || "")]
				.join(" ")
				.toLowerCase()
				.includes(q),
		);
	});

	async function load() {
		loading = true;
		try {
			data = await getSettingsOverview();
			loadError = "";
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not load settings.";
			if (message.startsWith("auth:")) return loginNext();
			loadError = message;
		} finally {
			loading = false;
		}
	}

	function sourceTone(cell: SettingValue): string {
		if (cell.from === "not set") return "missing";
		if (cell.from.startsWith(".env")) return "local";
		return "";
	}

	onMount(() => void load());
</script>

<div class="page scrollbar-fade">
	<PageHeader title="Settings" subtitle="Every setting, in every environment, and where its value comes from.">
		{#snippet actions()}
			<Button variant="ghost" size="sm" onclick={() => navigate("/web/dev")}>Developer tools</Button>
			<Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
				{#snippet icon()}
					<Icon name="refresh" size={16} />
				{/snippet}
				Refresh
			</Button>
		{/snippet}
	</PageHeader>

	{#if loadError}
		<p class="error">{loadError}</p>
	{:else if data}
		<div class="ready" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<p class="intro">
				Values come from, in order: a developer's own <strong>.env</strong> (on their machine
				only), then the <strong>Gwenda Config</strong> database
				(this environment's row, else <code>all</code>). A developer's machine reads the Dev rows.
				You're viewing from <strong>{ENV_LABELS[data.current] || data.current}</strong>{data.onMachine
					? " on a developer's machine"
					: ""}.
			</p>

			<SearchField bind:value={query} placeholder="Find a setting" />

			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">Setting</th>
							{#each data.environments as envName (envName)}
								<th scope="col" class:current={envName === data.current && !data.onMachine}>
									{ENV_LABELS[envName] || envName}
								</th>
							{/each}
							<th scope="col" class:current={data.onMachine}>Developer's machine</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.key)}
							<tr>
								<th scope="row">
									<code class="key">{row.key}</code>
									{#if row.about}<span class="about">{row.about}</span>{/if}
									<span class="meta">{row.service === "all" ? "ops + web" : row.service}</span>
								</th>
								{#each data.environments as envName (envName)}
									{@const cell = row.values[envName]}
									<td class:current={envName === data.current && !data.onMachine}>
										<span class="value">{cell.value || "—"}</span>
										<span class="from {sourceTone(cell)}">{cell.from}</span>
									</td>
								{/each}
								<td class:current={data.onMachine}>
									{#if row.local}
										<span class="value">
											{row.local.value ?? (data.onMachine ? "—" : "(each developer's own)")}
										</span>
										<span class="from local">
											.env <code>{row.local.env}</code>{row.local.required ? ", required" : ""}
										</span>
									{:else}
										<span class="value">{row.machine.value || "—"}</span>
										<span class="from {sourceTone(row.machine)}">{row.machine.from}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if data.unknown.length}
				<section class="card">
					<h2>Not in the settings list</h2>
					<p class="muted">
						Rows in the Gwenda Config database that no code reads through the config service. Add them to
						<code>SETTINGS</code> in <code>shared/config.js</code>, or delete them.
					</p>
					<ul class="plain">
						{#each data.unknown as row (row.key + row.env + row.service)}
							<li><code>{row.key}</code> <span class="meta">{row.env} / {row.service}</span> {row.value}</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="card">
				<h2>Machine state</h2>
				<p class="muted">
					Written by code (build snapshots, the website scheduler, secret fingerprints). Leave these alone.
				</p>
				<ul class="plain">
					{#each data.state as row (row.key + row.env + row.service)}
						<li>
							<code>{row.key}</code>
							<span class="meta">{row.env} / {row.service} · {row.size.toLocaleString()} characters</span>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	{:else}
		<p class="muted">Loading…</p>
	{/if}
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.ready {
		display: grid;
		gap: 1rem;
		max-width: 80rem;
	}

	.intro,
	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		max-width: 52rem;
	}

	.error {
		color: var(--destructive);
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
	}

	table {
		width: 100%;
		min-width: 52rem;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}

	thead th {
		font-size: var(--text-xs, 0.75rem);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: 0;
	}

	.current {
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	thead th.current {
		color: var(--foreground);
	}

	th[scope="row"] {
		display: grid;
		gap: 0.15rem;
		font-weight: 400;
		width: 16rem;
	}

	.key {
		font-weight: 600;
	}

	.about,
	.meta {
		color: var(--muted-foreground);
		font-size: var(--text-xs, 0.75rem);
	}

	td .value {
		display: block;
		overflow-wrap: anywhere;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-xs, 0.75rem);
	}

	.from {
		display: inline-block;
		margin-top: 0.2rem;
		font-size: var(--text-xs, 0.75rem);
		color: var(--muted-foreground);
	}

	.from.missing {
		color: var(--destructive);
	}

	.from.local {
		color: var(--primary);
	}

	.card {
		display: grid;
		gap: 0.5rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
	}

	.card h2 {
		margin: 0;
		font-size: var(--text-base, 1rem);
	}

	.plain {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
</style>
