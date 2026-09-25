<script lang="ts">
	/**
	 * Developer tools (admins): staging against live, in three parts.
	 *   Content   Sanity documents that differ. Publish to live, or reset staging from live.
	 *   Code      Commits staging runs that live does not. Ships when release moves.
	 *   Databases Baserow production vs its copies. Production may drift; copy it over to debug.
	 */
	import { onDestroy, onMount } from "svelte";
	import { getSitePendingState } from "../../lib/site-pending.svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import { BusyOverlay, Button, Dialog, PageHeader, SearchField } from "../../ui";
	import {
		copyDbPair,
		getCodeDiff,
		getDbPairDiff,
		getDeployStatus,
		getReleaseDiff,
		getWebStatus,
		publishRelease,
		type CodeDiff,
		type DbPairDiff,
		type ReleaseDiff,
		type ReleaseEntry,
		type WebEnvStatus,
		type WebStatus,
	} from "../../lib/api";
	import { loginNext, navigate } from "../../lib/nav";
	import { easeOut, flyMs } from "../../lib/motion";
	import { toast } from "../../lib/toast.svelte";
	import { beginSitePublish, writeSitePublish } from "../../lib/site-publish";
	import { formatWhen, healthLabel, healthTone, shortCommit, siteHost } from "../../lib/web-metrics";
	import {
		changeLabel,
		countLabel,
		fieldSummary,
		filterEntries,
		groupEntries,
		includedWith,
	} from "../../lib/release-view";
	import SitePublishMonitor from "./SitePublishMonitor.svelte";

	type PairId = "ops" | "website";
	type Direction = "to-production" | "to-staging";
	type CopyRun = { runId: number | null; runUrl: string; status: string; conclusion: string | null };

	const PAIRS: { id: PairId; label: string; copy: string }[] = [
		{ id: "ops", label: "Ops", copy: "Gwenda Dev copy (dev ops)" },
		{ id: "website", label: "Website", copy: "Website Staging (gwenda-staging)" },
	];

	let diff = $state<ReleaseDiff | null>(null);
	let web = $state<WebStatus | null>(null);
	let code = $state<CodeDiff | null>(null);
	let dbs = $state<Record<PairId, DbPairDiff | null>>({ ops: null, website: null });
	let dbErrors = $state<Record<PairId, string>>({ ops: "", website: "" });
	let dbLoading = $state<Record<PairId, boolean>>({ ops: false, website: false });
	let copyRuns = $state<Record<PairId, CopyRun | null>>({ ops: null, website: null });
	let loading = $state(true);
	let loadError = $state("");
	let query = $state(
		typeof window === "undefined"
			? ""
			: new URLSearchParams(window.location.search).get("q") || "",
	);
	let selected = $state<Set<string>>(new Set());
	let open = $state<Set<string>>(new Set());
	let section = $state<Set<string>>(
		new Set(
			typeof window !== "undefined" && new URLSearchParams(window.location.search).get("q")
				? ["content"]
				: [],
		),
	);
	let confirm = $state<{ direction: Direction; scope: "all" | "selected" } | null>(null);
	let confirmCopy = $state<PairId | null>(null);
	let working = $state(false);
	let warnings = $state<string[]>([]);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const entries = $derived(diff?.entries ?? []);
	const visible = $derived(filterEntries(entries, query));
	const groups = $derived(groupEntries(visible));
	const extra = $derived(includedWith(entries, selected));
	const selectedCount = $derived(selected.size + extra.length);
	const local = $derived(Boolean(diff?.local));
	const staging = $derived(web?.environments.staging ?? null);
	const live = $derived(web?.environments.production ?? null);

	const codeSummary = $derived.by(() => {
		if (!code) return { tone: "muted", text: "Checking…" };
		if (code.same === null) return { tone: "muted", text: "Version unknown" };
		if (code.same) return { tone: "up", text: "Same code" };
		const ahead = code.aheadBy ?? code.commits.length;
		return {
			tone: "warn",
			text: ahead ? `${ahead} commit${ahead === 1 ? "" : "s"} not live` : "Different code",
		};
	});

	function dbSummary(id: PairId): { tone: string; text: string } {
		if (dbLoading[id] && !dbs[id]) return { tone: "muted", text: "Checking…" };
		if (dbErrors[id]) return { tone: "muted", text: "Can't compare here" };
		const pair = dbs[id];
		if (!pair) return { tone: "muted", text: "Not checked" };
		if (pair.inSync) return { tone: "up", text: "In sync" };
		const count = pair.tables.filter((table) => table.status !== "same").length;
		return { tone: "warn", text: `${count} table${count === 1 ? "" : "s"} differ` };
	}

	function toggle(set: Set<string>, id: string): Set<string> {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	}

	async function loadDb(id: PairId) {
		dbLoading = { ...dbLoading, [id]: true };
		try {
			dbs = { ...dbs, [id]: await getDbPairDiff(id) };
			dbErrors = { ...dbErrors, [id]: "" };
		} catch (err) {
			dbErrors = {
				...dbErrors,
				[id]: err instanceof Error ? err.message : "Could not compare these databases.",
			};
		} finally {
			dbLoading = { ...dbLoading, [id]: false };
		}
	}

	async function load() {
		loading = true;
		try {
			const [nextDiff, nextWeb] = await Promise.all([
				getReleaseDiff(),
				getWebStatus().catch(() => null),
			]);
			diff = nextDiff;
			web = nextWeb;
			loadError = "";
			const ids = new Set(nextDiff.entries.map((entry) => entry.id));
			selected = new Set([...selected].filter((id) => ids.has(id)));
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not compare staging and live.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/web/dev"))}`;
				return;
			}
			loadError = message;
		} finally {
			loading = false;
		}
		// Slower checks fill in after the page is usable.
		getCodeDiff()
			.then((next) => (code = next))
			.catch((err) => {
				code = {
					ok: false,
					staging: null,
					live: null,
					same: null,
					commits: [],
					error: err instanceof Error ? err.message : "Could not compare code.",
				};
			});
		void loadDb("ops");
		void loadDb("website");
	}

	async function pollCopies() {
		for (const pair of PAIRS) {
			const run = copyRuns[pair.id];
			if (!run?.runId || run.status === "completed") continue;
			try {
				const status = await getDeployStatus(run.runId);
				copyRuns = {
					...copyRuns,
					[pair.id]: {
						...run,
						runUrl: status.runUrl || run.runUrl,
						status: status.completed ? "completed" : status.status,
						conclusion: status.conclusion,
					},
				};
				if (status.completed) {
					if (status.conclusion === "success") {
						toast.ok(`${pair.label} copy finished.`);
						void loadDb(pair.id);
					} else {
						toast.error(`${pair.label} copy did not finish. Open the log for details.`);
					}
				}
			} catch {
				/* keep polling */
			}
		}
	}

	onMount(() => {
		void load();
		pollTimer = setInterval(() => void pollCopies(), 5000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	function toggleGroup(list: ReleaseEntry[]) {
		const all = list.every((entry) => selected.has(entry.id));
		const next = new Set(selected);
		for (const entry of list) {
			if (all) next.delete(entry.id);
			else next.add(entry.id);
		}
		selected = next;
	}

	function toneIcon(tone: string): string {
		if (tone === "up") return "check";
		if (tone === "down") return "x-circle";
		if (tone === "warn") return "alert";
		return "help";
	}

	function ask(direction: Direction) {
		confirm = { direction, scope: selected.size ? "selected" : "all" };
	}

	async function copyContent() {
		if (!confirm || working) return;
		const { direction, scope } = confirm;
		const ids = scope === "selected" ? [...selected] : null;
		working = true;
		warnings = [];
		try {
			const result = await publishRelease(ids, direction);
			confirm = null;
			selected = new Set();
			warnings = result.warnings;
			if (result.deploy?.runId) {
				writeSitePublish({
					target: direction === "to-staging" ? "staging" : "production",
					runId: result.deploy.runId,
					runUrl: result.deploy.runUrl || "",
					status: result.deploy.alreadyRunning ? "in_progress" : "queued",
					conclusion: null,
					completed: false,
				});
			}
			const count = countLabel(result.written.length + result.deleted.length);
			toast.ok(
				direction === "to-staging"
					? `Staging reset: ${count} copied from live.`
					: `Published ${count}. What's on is live now; other pages rebuild in a few minutes.`,
			);
			await load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not copy.");
		} finally {
			working = false;
		}
	}

	async function copyDatabase() {
		if (!confirmCopy || working) return;
		const id = confirmCopy;
		working = true;
		try {
			const run = await copyDbPair(id);
			confirmCopy = null;
			copyRuns = {
				...copyRuns,
				[id]: {
					runId: run.runId ?? null,
					runUrl: run.runUrl || "",
					status: run.status || "queued",
					conclusion: null,
				},
			};
			toast.ok("Copy started. It takes a few minutes; progress shows here.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not start the copy.");
		} finally {
			working = false;
		}
	}

	async function rebuildStaging() {
		try {
			const run = await beginSitePublish("staging");
			toast.ok(run.status === "in_progress" ? "A staging rebuild is already running." : "Staging rebuild started.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not rebuild staging.");
		}
	}
	/** This environment's website and preview (dev ops: the dev website). */
	const siteUrls = $derived(getSitePendingState().urls);
</script>

{#snippet site(label: string, env: WebEnvStatus | null, fallbackUrl: string)}
	{@const tone = healthTone(env)}
	<div class="site">
		<p class="site-label">{label}</p>
		<a class="site-host" href={env?.siteUrl || fallbackUrl} target="_blank" rel="noreferrer">
			{siteHost(env?.siteUrl || fallbackUrl)}
			<Icon name="external-link" size={12} />
		</a>
		<p class="site-meta">
			<span class="health {tone}">
				<Icon name={toneIcon(tone)} size={13} />
				{healthLabel(env)}
			</span>
			{#if env?.code.commit}
				<span class="mono" title="Code version">{shortCommit(env.code.commit)}</span>
			{/if}
		</p>
	</div>
{/snippet}

{#snippet sectionHead(id: string, title: string, tone: string, text: string)}
	<button
		type="button"
		class="section-head"
		aria-expanded={section.has(id)}
		onclick={() => (section = toggle(section, id))}
	>
		<span class="section-title">{title}</span>
		<span class="pill {tone}">
			<Icon name={toneIcon(tone)} size={13} />
			{text}
		</span>
		<Icon name={section.has(id) ? "chevron-up" : "chevron-down"} size={18} />
	</button>
{/snippet}

<div class="page scrollbar-fade">
	<PageHeader
		title="Developer tools"
		subtitle="Staging against the live site: content, code and data. Admins only."
	>
		{#snippet actions()}
			<Button variant="ghost" size="sm" onclick={() => navigate("/web/dev/settings")}>Settings</Button>
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
	{:else if diff}
		<div class="ready" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<section class="flow" aria-label="Sites">
				{@render site("Staging", staging, siteUrls.preview)}
				<div class="arrow"><Icon name="chevron-right" size={22} /></div>
				{@render site("Live", live, siteUrls.live)}
			</section>

			{#if local}
				<p class="banner">
					<Icon name="lock" size={16} />
					<span>
						Ops on your machine: copying content changes the Gwenda Dev copy, never gwenda.co.uk.
						Site rebuilds and database copies only run in hosted ops.
					</span>
				</p>
			{/if}

			<SitePublishMonitor />

			{#if warnings.length}
				<ul class="warnings">
					{#each warnings as warning (warning)}
						<li>{warning}</li>
					{/each}
				</ul>
			{/if}

			<!-- 1. Content -->
			<section class="card" aria-label="Content">
				{@render sectionHead(
					"content",
					"Content",
					entries.length ? "warn" : "up",
					entries.length
						? `${entries.length} document${entries.length === 1 ? "" : "s"} differ`
						: "In sync",
				)}
				{#if section.has("content")}
					<div class="section-body">
						{#if !entries.length}
							<p class="muted">
								Every published document on staging matches the live site. Saving an event in ops
								puts it on staging, and it shows up here.
							</p>
						{:else}
							<p class="muted">
								{diff.counts.added} new on staging · {diff.counts.changed} changed · {diff.counts.removed}
								only on live. Tick documents to act on some; otherwise the buttons act on all.
							</p>
							<div class="actions">
								<Button variant="primary" disabled={working} onclick={() => ask("to-production")}>
									{#snippet icon()}
										<Icon name="upload" size={16} />
									{/snippet}
									{selected.size ? `Publish ${countLabel(selectedCount)} to live` : "Publish all to live"}
								</Button>
								<Button variant="outline" disabled={working} onclick={() => ask("to-staging")}>
									{#snippet icon()}
										<Icon name="undo" size={16} />
									{/snippet}
									{selected.size ? `Reset ${countLabel(selected.size)} from live` : "Reset staging from live"}
								</Button>
							</div>
							<SearchField
								bind:value={query}
								placeholder="Filter documents"
								ariaLabel="Filter documents"
								count={query ? visible.length : undefined}
							/>
							{#if !visible.length}
								<p class="muted">Nothing matches that filter.</p>
							{/if}
							{#each groups as group (group.type)}
								{@const allOn = group.entries.every((entry) => selected.has(entry.id))}
								<section class="group" aria-label={group.label}>
									<header class="group-head">
										<input
											type="checkbox"
											checked={allOn}
											aria-label={`Select all ${group.label}`}
											onchange={() => toggleGroup(group.entries)}
										/>
										<h3>{group.label}</h3>
										<span class="count">{group.entries.length}</span>
									</header>
									<ul class="entries">
										{#each group.entries as entry (entry.id)}
											{@const expanded = open.has(entry.id)}
											{@const pulled = !selected.has(entry.id) && extra.some((row) => row.id === entry.id)}
											<li class="entry" class:on={selected.has(entry.id) || pulled}>
												<div class="entry-row">
													<input
														type="checkbox"
														checked={selected.has(entry.id) || pulled}
														disabled={pulled}
														title={pulled ? "Published with a document you picked that needs it." : undefined}
														aria-label={`Select ${entry.label}`}
														onchange={() => (selected = toggle(selected, entry.id))}
													/>
													<span class="badge {entry.change}">
														{entry.change === "removed" ? "Live only" : changeLabel(entry.change)}
													</span>
													<button
														type="button"
														class="entry-main"
														aria-expanded={expanded}
														disabled={!entry.fields.length}
														onclick={() => (open = toggle(open, entry.id))}
													>
														<span class="entry-label">{entry.label}</span>
														<span class="entry-fields">
															{pulled
																? "Needed by your selection"
																: entry.change === "removed"
																	? "Not on staging: publishing removes it from live"
																	: fieldSummary(entry)}
														</span>
														{#if entry.fields.length}
															<Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} />
														{/if}
													</button>
												</div>
												{#if expanded}
													<div class="scroll">
														<table>
															<thead>
																<tr>
																	<th scope="col">Field</th>
																	<th scope="col">Live</th>
																	<th scope="col">Staging</th>
																</tr>
															</thead>
															<tbody>
																{#each entry.fields as field (field.key)}
																	<tr>
																		<th scope="row">{field.label}</th>
																		<td class="old">{field.detailOnly ? "Details differ" : field.production}</td>
																		<td class="new">
																			{field.detailOnly ? "(crop, formatting or order)" : field.staging}
																		</td>
																	</tr>
																{/each}
															</tbody>
														</table>
													</div>
												{/if}
											</li>
										{/each}
									</ul>
								</section>
							{/each}
						{/if}
						{#if !local}
							<p class="footnote">
								Staging pages look out of date?
								<button type="button" class="link" onclick={() => void rebuildStaging()}>
									Rebuild staging
								</button>
							</p>
						{/if}
					</div>
				{/if}
			</section>

			<!-- 2. Code -->
			<section class="card" aria-label="Code">
				{@render sectionHead("code", "Code", codeSummary.tone, codeSummary.text)}
				{#if section.has("code")}
					<div class="section-body">
						{#if !code}
							<p class="muted">Checking…</p>
						{:else if code.same === null}
							<p class="muted">A site did not report its version, so the code can't be compared.</p>
						{:else if code.same}
							<p class="muted">Both sites run {shortCommit(code.live)}.</p>
						{:else}
							<p class="muted">
								Staging runs {shortCommit(code.staging)}, live runs {shortCommit(code.live)}.
								{#if code.files}{code.files} files changed.{/if}
								Code goes live when the <span class="mono">release</span> branch moves to
								<span class="mono">main</span>, not from this page.
								{#if code.url}
									<a href={code.url} target="_blank" rel="noreferrer">Full comparison on GitHub</a>
								{/if}
							</p>
							{#if code.error}
								<p class="muted">{code.error}</p>
							{/if}
							{#if code.commits.length}
								<ul class="commits">
									{#each code.commits as commit (commit.sha)}
										<li>
											<a class="mono" href={commit.url} target="_blank" rel="noreferrer"
												>{shortCommit(commit.sha)}</a
											>
											<span class="commit-message">{commit.message}</span>
											<span class="commit-meta">{commit.author} · {formatWhen(commit.date)}</span>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					</div>
				{/if}
			</section>

			<!-- 3. Databases -->
			<section class="card" aria-label="Databases">
				{@render sectionHead(
					"data",
					"Databases",
					PAIRS.some((pair) => dbSummary(pair.id).tone === "warn") ? "warn" : PAIRS.every((pair) => dbSummary(pair.id).tone === "up") ? "up" : "muted",
					PAIRS.map((pair) => `${pair.label}: ${dbSummary(pair.id).text}`).join(" · "),
				)}
				{#if section.has("data")}
					<div class="section-body">
						<p class="muted">
							Production keeps changing, and that's expected. This shows whether each copy still
							matches production, table by table. Copying overwrites the copy's rows with
							production's (photos are not copied). Production is never changed.
						</p>
						{#each PAIRS as pair (pair.id)}
							{@const result = dbs[pair.id]}
							{@const summary = dbSummary(pair.id)}
							{@const run = copyRuns[pair.id]}
							<section class="group" aria-label={pair.label}>
								<header class="group-head db-head">
									<h3>{pair.label}: production → {pair.copy}</h3>
									<span class="pill {summary.tone}">{summary.text}</span>
								</header>
								<div class="db-body">
									{#if dbErrors[pair.id]}
										<p class="muted">{dbErrors[pair.id]}</p>
									{:else if result}
										<div class="scroll">
											<table>
												<thead>
													<tr>
														<th scope="col">Table</th>
														<th scope="col">Production</th>
														<th scope="col">Copy</th>
														<th scope="col">Difference</th>
													</tr>
												</thead>
												<tbody>
													{#each result.tables as table (table.name)}
														<tr class:same={table.status === "same"}>
															<th scope="row">{table.name}</th>
															<td class="num">{table.status === "extra" ? "—" : table.sourceRows}</td>
															<td class="num">{table.status === "missing" ? "—" : table.targetRows}</td>
															<td>
																{#if table.status === "same"}
																	Same
																{:else if table.status === "missing"}
																	Not in the copy
																{:else if table.status === "extra"}
																	Only in the copy
																{:else}
																	{[
																		table.sourceOnly ? `${table.sourceOnly} rows only in production` : "",
																		table.targetOnly ? `${table.targetOnly} only in the copy` : "",
																		table.missingColumns.length
																			? `copy lacks ${table.missingColumns.join(", ")}`
																			: "",
																		table.extraColumns.length
																			? `copy has ${table.extraColumns.join(", ")}`
																			: "",
																	]
																		.filter(Boolean)
																		.join(" · ")}
																{/if}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{/if}
									<div class="db-actions">
										<Button
											variant="outline"
											size="sm"
											busy={dbLoading[pair.id]}
											onclick={() => void loadDb(pair.id)}
										>
											Compare again
										</Button>
										{#if !local}
											<Button
												variant="outline"
												size="sm"
												disabled={working || Boolean(run && run.status !== "completed")}
												onclick={() => (confirmCopy = pair.id)}
											>
												{#snippet icon()}
													<Icon name="undo" size={14} />
												{/snippet}
												Copy production over it
											</Button>
										{/if}
										{#if run}
											<span
												class="run"
												class:failed={run.status === "completed" && run.conclusion !== "success"}
											>
												{run.status !== "completed"
													? "Copying…"
													: run.conclusion === "success"
														? "Copy finished."
														: "Copy failed."}
												{#if run.runUrl}
													<a href={run.runUrl} target="_blank" rel="noreferrer">Log</a>
												{/if}
											</span>
										{/if}
										{#if result}
											<span class="checked">Checked {formatWhen(result.checkedAt)}</span>
										{/if}
									</div>
								</div>
							</section>
						{/each}
					</div>
				{/if}
			</section>
		</div>
	{/if}

	<Dialog
		open={confirm !== null}
		title={confirm?.direction === "to-staging" ? "Reset staging from the live site?" : "Publish to gwenda.co.uk?"}
		onclose={() => {
			if (!working) confirm = null;
		}}
	>
		<p class="dialog-copy">
			{#if confirm?.direction === "to-staging"}
				{confirm.scope === "all" ? `All ${countLabel(entries.length)}` : countLabel(selected.size)} on staging
				will be overwritten with what is live: staging edits are lost, and documents only on staging are
				deleted. Ops still has its own data, so saving an event again stages it again. Staging rebuilds
				afterwards.
			{:else}
				{confirm?.scope === "all"
					? `All ${countLabel(entries.length)} go live.`
					: `${countLabel(selectedCount)} go live${extra.length ? `, including ${extra.length} your selection needs` : ""}.`}
				What's on updates straight away. Series, night and menu pages update when the live site finishes
				rebuilding, in a few minutes.
			{/if}
		</p>
		{#snippet footer()}
			<Button variant="outline" size="sm" disabled={working} onclick={() => (confirm = null)}>Cancel</Button>
			<Button variant="primary" size="sm" busy={working} onclick={() => void copyContent()}>
				{confirm?.direction === "to-staging" ? "Reset staging" : "Publish"}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		open={confirmCopy !== null}
		title="Copy production over the {confirmCopy === 'ops' ? 'Ops dev copy' : 'Website Staging database'}?"
		onclose={() => {
			if (!working) confirmCopy = null;
		}}
	>
		<p class="dialog-copy">
			{#if confirmCopy === "ops"}
				Every row in the Gwenda Dev copy of the Ops DB (what dev ops uses) is replaced with
				production's. Local edits there are lost.
			{:else}
				Every row in Website Staging (subscribers, form submissions) is replaced with production's, so
				gwenda-staging will hold real people's data. Staging-only rows are lost.
			{/if}
			Production is only read. Photos are not copied. It runs as a GitHub Action and takes a few minutes.
		</p>
		{#snippet footer()}
			<Button variant="outline" size="sm" disabled={working} onclick={() => (confirmCopy = null)}>Cancel</Button>
			<Button variant="primary" size="sm" busy={working} onclick={() => void copyDatabase()}>Copy</Button>
		{/snippet}
	</Dialog>
	<BusyOverlay active={loading && !diff} label="Comparing staging and live…" />
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
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		max-width: 60rem;
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.muted,
	.footnote {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.muted a,
	.footnote a {
		color: var(--primary);
	}

	.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-xs);
	}

	.banner {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		margin: 0;
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--primary-wash);
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.warnings {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--destructive);
		font-size: var(--text-sm);
	}

	/* Sites */
	.flow {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: stretch;
		gap: 0.75rem;
	}

	.site {
		display: grid;
		gap: 0.3rem;
		align-content: start;
		min-width: 0;
		padding: 1rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
	}

	.site-label {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.site-host {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		width: fit-content;
		max-width: 100%;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--foreground);
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.site-host:hover {
		color: var(--primary);
	}

	.site-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.85rem;
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.health {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-weight: 600;
	}

	.health.up {
		color: var(--up);
	}

	.health.down {
		color: var(--down, var(--destructive));
	}

	.arrow {
		display: grid;
		place-items: center;
		color: var(--muted-foreground);
	}

	/* Sections */
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		overflow: hidden;
	}

	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.9rem;
		width: 100%;
		padding: 0.95rem 1.1rem;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.section-head > :global(svg:last-child) {
		margin-left: auto;
		color: var(--muted-foreground);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.55rem;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 700;
		background: var(--muted);
		color: var(--muted-foreground);
	}

	.pill.up {
		color: var(--up);
		background: color-mix(in srgb, var(--up) 14%, transparent);
	}

	.pill.warn {
		color: var(--primary);
		background: var(--primary-wash);
	}

	.section-body {
		display: grid;
		gap: 0.85rem;
		padding: 0 1.1rem 1.1rem;
	}

	.actions,
	.db-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--primary);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.link:hover {
		text-decoration: underline;
	}

	/* Document list */
	.group {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--background);
		overflow: hidden;
	}

	.group-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.9rem;
		border-bottom: 1px solid var(--border);
	}

	.group-head h3 {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.db-head {
		flex-wrap: wrap;
		justify-content: space-between;
	}

	.count {
		margin-left: auto;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.entries {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.entry + .entry {
		border-top: 1px solid var(--border);
	}

	.entry.on {
		background: var(--primary-wash);
	}

	.entry-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		padding: 0.5rem 0.9rem;
	}

	input[type="checkbox"] {
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
		accent-color: var(--primary);
	}

	.badge {
		flex-shrink: 0;
		width: 4.75rem;
		padding: 0.15rem 0;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-align: center;
		text-transform: uppercase;
	}

	.badge.added {
		color: var(--up);
		background: color-mix(in srgb, var(--up) 14%, transparent);
	}

	.badge.changed {
		color: var(--primary);
		background: var(--primary-wash);
	}

	.badge.removed {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.entry-main {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.1rem 0.75rem;
		min-width: 0;
		padding: 0.25rem 0;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.entry-main:disabled {
		cursor: default;
	}

	.entry-main :global(svg) {
		margin-left: auto;
		color: var(--muted-foreground);
	}

	.entry-label {
		min-width: 0;
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.entry-fields {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.scroll {
		overflow-x: auto;
	}

	.entry .scroll {
		padding: 0 0.9rem 0.75rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: 0.45rem 0.6rem;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--border);
		overflow-wrap: anywhere;
	}

	thead th {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	tbody th {
		font-weight: 500;
	}

	td.num {
		font-variant-numeric: tabular-nums;
	}

	tr.same {
		color: var(--muted-foreground);
	}

	td.old {
		color: var(--muted-foreground);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--destructive) 55%, transparent);
	}

	/* Commits */
	.commits {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.commits li {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr);
		gap: 0.1rem 0.6rem;
		font-size: var(--text-sm);
	}

	.commits a {
		color: var(--primary);
	}

	.commit-message {
		overflow-wrap: anywhere;
	}

	.commit-meta {
		grid-column: 2;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
	}

	/* Databases */
	.db-body {
		display: grid;
		gap: 0.6rem;
		padding: 0.6rem 0.9rem 0.8rem;
	}

	.run,
	.checked {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.run a {
		color: var(--primary);
		margin-left: 0.3rem;
	}

	.run.failed {
		color: var(--destructive);
	}

	.checked {
		margin-left: auto;
	}

	.dialog-copy {
		margin: 0;
		line-height: 1.5;
	}

	@media (max-width: 640px) {
		.flow {
			grid-template-columns: minmax(0, 1fr);
		}

		.arrow :global(svg) {
			transform: rotate(90deg);
		}

		.badge {
			width: auto;
			padding: 0.15rem 0.45rem;
		}

		.checked {
			margin-left: 0;
		}
	}
</style>
