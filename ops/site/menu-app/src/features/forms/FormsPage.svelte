<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { BusyOverlay, Button, NativeSelect, PageHeader, SearchField } from "../../ui";
	import { getFormSubmissions, type FormSubmission } from "../../lib/api";
	import { setCrumbLeaf } from "../../lib/crumbs.svelte";
	import { loginNext, navigate, parseShellPath } from "../../lib/nav";
	import { formatWhen } from "../../lib/web-metrics";
	import FormsGrid from "./FormsGrid.svelte";

	let { path = "/forms" }: { path?: string } = $props();

	const route = $derived(parseShellPath(path));
	const openId = $derived(route.page === "forms" ? route.slug : null);

	let rows = $state<FormSubmission[]>([]);
	let loading = $state(true);
	let error = $state("");
	let query = $state("");
	let formFilter = $state("");

	const selected = $derived(rows.find((row) => row.id === openId) ?? null);

	const forms = $derived.by(() => {
		const titles = new Map<string, string>();
		for (const row of rows) {
			const key = row.formSlug || row.formTitle;
			if (!titles.has(key)) titles.set(key, row.formTitle || key);
		}
		return [...titles.entries()].sort((a, b) => a[1].localeCompare(b[1]));
	});

	const formOptions = $derived([
		{ value: "", label: "All forms" },
		...forms.map(([value, label]) => ({ value, label })),
	]);

	const visible = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return rows.filter((row) => {
			const formKey = row.formSlug || row.formTitle;
			if (formFilter && formKey !== formFilter) return false;
			if (!needle) return true;
			const haystack = [
				row.name,
				row.email,
				row.formTitle,
				row.status,
				...row.answers.map((answer) => `${answer.label} ${answer.value}`),
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(needle);
		});
	});

	const detailFields = $derived.by(() => {
		if (!selected) return [];
		const fields = [
			selected.name ? { key: "name", label: "Name", value: selected.name } : null,
			selected.email ? { key: "email", label: "Email", value: selected.email } : null,
			...selected.answers,
		];
		return fields.filter((field): field is { key: string; label: string; value: string } =>
			Boolean(field?.value),
		);
	});

	function personLabel(row: FormSubmission): string {
		return row.name || row.email || "Submission";
	}

	$effect(() => {
		setCrumbLeaf(selected ? personLabel(selected) : "");
	});

	onDestroy(() => {
		setCrumbLeaf("");
	});

	onMount(() => {
		void (async () => {
			try {
				const data = await getFormSubmissions();
				rows = data.submissions || [];
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Could not load submissions.";
				if (message.startsWith("auth:")) {
					window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/forms"))}`;
					return;
				}
				error = message;
			} finally {
				loading = false;
			}
		})();
	});
</script>

<div class="forms-root">
	{#if openId}
		<div class="detail scrollbar-fade">
			<PageHeader
				title={selected ? personLabel(selected) : "Submission"}
				subtitle={selected
					? [selected.formTitle, selected.status, selected.submittedAt ? formatWhen(selected.submittedAt) : ""]
							.filter(Boolean)
							.join(" · ")
					: ""}
			>
				{#snippet actions()}
					<Button variant="outline" size="sm" type="button" onclick={() => navigate("/forms")}>
						Back
					</Button>
				{/snippet}
			</PageHeader>
			{#if error}
				<p class="error">{error}</p>
			{:else if !loading && !selected}
				<p class="muted">That submission is not in the current list.</p>
			{:else if selected}
				<dl class="answers">
					{#each detailFields as field (field.key)}
						<div>
							<dt>{field.label}</dt>
							<dd>{field.value}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</div>
	{:else}
		<div class="list">
			<PageHeader
				title="Forms"
				subtitle="People who sent a form on the site. Latest reply for each address."
			>
				{#snippet actions()}
					<SearchField
						bind:value={query}
						placeholder="Search people"
						ariaLabel="Search submissions"
						count={query ? visible.length : undefined}
					/>
				{/snippet}
				{#if forms.length > 1}
					<div class="filters">
						<NativeSelect bind:value={formFilter} options={formOptions} size="sm" />
					</div>
				{/if}
			</PageHeader>
			{#if error}
				<p class="error">{error}</p>
			{:else if !loading && visible.length === 0}
				<p class="muted">
					{rows.length === 0 ? "No submissions yet." : "Nothing matches that search."}
				</p>
			{:else if !loading}
				<div class="grid-host">
					<FormsGrid rows={visible} />
				</div>
			{/if}
		</div>
	{/if}
	<BusyOverlay active={loading} label="Loading…" />
</div>

<style>
	.forms-root {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		background: var(--background);
	}

	.list,
	.detail {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		padding: var(--page-gutter);
		gap: var(--gap);
	}

	.detail {
		overflow-y: auto;
		max-width: 44rem;
	}

	.filters {
		max-width: 16rem;
	}

	.grid-host {
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	.error {
		margin: 0;
		color: var(--destructive, #c97a7a);
		font-size: var(--text-sm);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.answers {
		display: grid;
		gap: 0.85rem;
		margin: 0;
	}

	.answers div {
		display: grid;
		gap: 0.15rem;
	}

	dt {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	dd {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
