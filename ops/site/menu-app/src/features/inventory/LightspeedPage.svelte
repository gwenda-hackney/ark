<script lang="ts">
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import { BusyOverlay, Button, Card, PageHeader } from "../../ui";
	import { previewLightspeedCsv } from "../../lib/api";
	import { toast } from "../../lib/toast.svelte";
	import { easeOut, flyMs } from "../../lib/motion";
	import type { LightspeedPreview } from "../../lib/types";

	let fileInput: HTMLInputElement | undefined;
	let dragOver = $state(false);
	let fileName = $state("");
	let csvText = $state("");
	let preview = $state<LightspeedPreview | null>(null);
	let createKeys = $state<string[]>([]);
	let loading = $state(false);
	let applying = $state(false);
	let error = $state("");

	const createSet = $derived(new Set(createKeys));
	const createCount = $derived(
		(preview?.lightspeedOnly || []).filter(
			(row) => row.canCreate && row.key && createSet.has(row.key),
		).length,
	);

	function qtyLabel(qty: number | null | undefined, unit?: string) {
		if (qty == null) return "";
		return unit ? `${qty} ${unit}` : String(qty);
	}

	function resetPreview() {
		preview = null;
		createKeys = [];
	}

	async function loadCsv(file: File) {
		if (!/\.(csv|txt)$/i.test(file.name)) {
			error = "Use a CSV export from Lightspeed Back Office.";
			toast.error(error);
			return;
		}
		loading = true;
		error = "";
		resetPreview();
		try {
			const text = await file.text();
			fileName = file.name;
			csvText = text;
			preview = await previewLightspeedCsv(text);
			toast.ok("Matched against inventory.");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not read that file.";
			error = message;
			csvText = "";
			fileName = "";
			toast.error(message);
		} finally {
			loading = false;
		}
	}

	function onFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) void loadCsv(file);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) void loadCsv(file);
	}

	function toggleCreate(key: string | undefined, canCreate: boolean | undefined) {
		if (!key || !canCreate) return;
		if (createSet.has(key)) {
			createKeys = createKeys.filter((row) => row !== key);
			return;
		}
		createKeys = [...createKeys, key];
	}

	async function apply() {
		if (!csvText) return;
		applying = true;
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				apply: true,
				createKeys,
			});
			createKeys = [];
			const created = preview.created?.length || 0;
			toast.ok(
				created
					? `Saved counts. Created ${created} inventory ${created === 1 ? "item" : "items"}.`
					: "Saved Lightspeed SKUs and counts.",
			);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not apply the count.";
			error = message;
			toast.error(message);
		} finally {
			applying = false;
		}
	}

	function downloadImport() {
		const csv = preview?.itemImportCsv;
		if (!csv) return;
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "lightspeed-item-import.csv";
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Lightspeed"
		subtitle="Ops owns the catalog. Upload a K-Series item list or stock count, store the on-hand quantity here, and download an item import for anything Lightspeed is missing."
	>
		{#snippet actions()}
			<Button
				variant="outline"
				size="sm"
				disabled={!preview?.itemImportCsv || (preview.opsOnly?.length || 0) === 0}
				onclick={downloadImport}
			>
				Download item import
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={applying}
				disabled={!preview || applying}
				onclick={apply}
			>
				Apply counts
			</Button>
		{/snippet}
	</PageHeader>

	<div class="stack">
		<Card
			title="Upload export"
			subtitle="Item list, stock levels, or a finished Inventory count. Match is Lightspeed SKU, then exact name."
		>
			<div
				class="drop"
				class:on={dragOver}
				role="button"
				tabindex="0"
				ondragenter={(event) => {
					event.preventDefault();
					dragOver = true;
				}}
				ondragover={(event) => {
					event.preventDefault();
					dragOver = true;
				}}
				ondragleave={() => {
					dragOver = false;
				}}
				ondrop={onDrop}
				onclick={() => fileInput?.click()}
				onkeydown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						fileInput?.click();
					}
				}}
			>
				<Icon name="upload" size={22} />
				<p>
					{fileName || "Drop a CSV here, or choose a file"}
				</p>
			</div>
			<input
				bind:this={fileInput}
				class="sr-only"
				type="file"
				accept=".csv,text/csv,.txt"
				onchange={onFile}
			/>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</Card>

		{#if preview}
			<div class="groups" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
				<Card
					title="Matched"
					subtitle="{preview.matched.length} rows. Apply writes SKU and quantity onto the catalog."
				>
					{#if preview.matched.length === 0}
						<p class="muted">Nothing matched this file.</p>
					{:else}
						<table class="table">
							<thead>
								<tr>
									<th>Ops</th>
									<th>Lightspeed</th>
									<th>Qty</th>
									<th>Via</th>
								</tr>
							</thead>
							<tbody>
								{#each preview.matched as row (row.ops.id + row.lightspeed.key)}
									<tr>
										<td>{row.ops.name}</td>
										<td>
											{row.lightspeed.name || ""}
											{#if row.lightspeed.sku}
												<span class="mono">{row.lightspeed.sku}</span>
											{/if}
										</td>
										<td class="num">
											{qtyLabel(row.lightspeed.quantity, row.lightspeed.unit)}
										</td>
										<td class="via">{row.via}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</Card>

				<Card
					title="Name mismatch"
					subtitle="{preview.conflicts.length} SKU hits whose Lightspeed name differs from ops."
				>
					{#if preview.conflicts.length === 0}
						<p class="muted">No SKU conflicts.</p>
					{:else}
						<table class="table">
							<thead>
								<tr>
									<th>Ops</th>
									<th>Lightspeed</th>
									<th>Qty</th>
								</tr>
							</thead>
							<tbody>
								{#each preview.conflicts as row (row.ops.id)}
									<tr>
										<td>
											{row.ops.name}
											{#if row.ops.lightspeedSku}
												<span class="mono">{row.ops.lightspeedSku}</span>
											{/if}
										</td>
										<td>
											{row.lightspeed.name || ""}
											{#if row.lightspeed.sku}
												<span class="mono">{row.lightspeed.sku}</span>
											{/if}
										</td>
										<td class="num">
											{qtyLabel(row.lightspeed.quantity, row.lightspeed.unit)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</Card>

				<Card
					title="In Lightspeed only"
					subtitle="Not created automatically. Tick Item rows to add them to ops when you apply."
				>
					{#if preview.lightspeedOnly.length === 0}
						<p class="muted">Every Lightspeed row matched inventory.</p>
					{:else}
						<table class="table">
							<thead>
								<tr>
									<th>Create</th>
									<th>Name</th>
									<th>SKU</th>
									<th>Type</th>
									<th>Qty</th>
								</tr>
							</thead>
							<tbody>
								{#each preview.lightspeedOnly as row (row.key)}
									<tr>
										<td>
											{#if row.canCreate}
												<label class="check">
													<input
														type="checkbox"
														checked={Boolean(row.key && createSet.has(row.key))}
														onchange={() =>
															toggleCreate(row.key, row.canCreate)}
													/>
													<span class="sr-only">Create {row.name}</span>
												</label>
											{:else}
												<span class="skip">Skip</span>
											{/if}
										</td>
										<td>{row.name || ""}</td>
										<td class="mono">{row.sku || ""}</td>
										<td>{row.type || ""}</td>
										<td class="num">{qtyLabel(row.quantity, row.unit)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if createCount > 0}
							<p class="hint">
								{createCount}
								{createCount === 1 ? "item" : "items"} will be created in ops.
							</p>
						{/if}
					{/if}
				</Card>

				<Card
					title="In ops only"
					subtitle="{preview.opsOnly.length} catalog rows missing from this file. Import them in Back Office with the download above."
				>
					{#if preview.opsOnly.length === 0}
						<p class="muted">Every catalog item was in the file.</p>
					{:else}
						<ul class="ops-only">
							{#each preview.opsOnly as row (row.id)}
								<li>
									<span>{row.name}</span>
									{#if row.lightspeedSku}
										<span class="mono">{row.lightspeedSku}</span>
									{/if}
									{#if row.active === false}
										<span class="skip">Inactive</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Card>
			</div>
		{/if}
	</div>

	<BusyOverlay
		active={loading || applying}
		label={applying ? "Saving counts…" : "Matching…"}
	/>
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.stack {
		display: grid;
		gap: var(--gap-lg);
		max-width: 64rem;
		align-content: start;
	}

	.drop {
		display: grid;
		justify-items: center;
		gap: 0.65rem;
		padding: 1.4rem 1rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--muted-foreground);
		text-align: center;
		cursor: pointer;
	}

	.drop.on {
		border-color: var(--primary);
		color: var(--foreground);
	}

	.drop p {
		margin: 0;
		font-size: var(--text-sm);
	}

	.error {
		margin: var(--gap-sm) 0 0;
		color: var(--destructive, #c97a7a);
		font-size: var(--text-sm);
	}

	.groups {
		display: grid;
		gap: var(--gap-lg);
	}

	.muted,
	.hint {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.hint {
		margin-top: 0.75rem;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.table th,
	.table td {
		padding: 0.55rem 0.4rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}

	.table th {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.table tr:last-child td {
		border-bottom: 0;
	}

	.num {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.via,
	.skip {
		color: var(--muted-foreground);
		text-transform: capitalize;
	}

	.mono {
		display: block;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.check {
		display: inline-flex;
		align-items: center;
	}

	.check input {
		accent-color: var(--primary);
	}

	.ops-only {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}

	.ops-only li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.45rem 0.75rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.ops-only li:last-child {
		border-bottom: 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
