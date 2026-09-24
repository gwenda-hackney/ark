<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../../shell";
	import {
		BusyOverlay,
		Button,
		Card,
		Dialog,
		Field,
		NativeSelect,
		PageHeader,
		PageHelp,
		SearchField,
		Segmented,
		TextField,
	} from "../../ui";
	import { getMenu, previewLightspeedCsv } from "../../lib/api";
	import { flattenMenuSections, sectionPathLabel } from "../../lib/menu-sections";
	import { toast } from "../../lib/toast.svelte";
	import { easeOut, flyMs } from "../../lib/motion";
	import {
		DEFAULT_LIGHTSPEED_MENU,
		rankByName,
		serveBaseName,
	} from "../../../../functions/_lib/lightspeed-stock.js";
	import {
		DRINK_TYPES,
		GUEST_MENU_PLACEMENTS,
		guestMenuFlags,
		asGuestMenuPlacement,
		type LightspeedCsvRow,
		type LightspeedMatchRow,
		type LightspeedOpsRow,
		type LightspeedPreview,
		type MenuSection,
		type PosMenu,
		defaultPosMenus,
	} from "../../lib/types";
	import type { SelectOption, SegmentedItem } from "../../ui/types";
	import { RECONCILE_HELP } from "./lightspeed-help";

	let fileInput: HTMLInputElement | undefined;
	let dragOver = $state(false);
	let fileName = $state("");
	let csvText = $state("");
	let menuName = $state(DEFAULT_LIGHTSPEED_MENU);
	let posMenus = $state<PosMenu[]>([]);
	let preview = $state<LightspeedPreview | null>(null);
	let loading = $state(false);
	let applying = $state(false);
	let error = $state("");
	let tab = $state("decide");
	let query = $state("");
	let sections = $state<MenuSection[]>([]);
	let addRow = $state<LightspeedCsvRow | null>(null);
	let addName = $state("");
	let addSectionId = $state("");
	let addDrinkType = $state("pour");
	let addPrice = $state("");
	let addPlacement = $state("none");
	let addPosMenuId = $state("");
	let archiveAllOpen = $state(false);
	let importOpen = $state(false);
	let acting = $state("");
	let linkLs = $state<LightspeedCsvRow | null>(null);
	let linkOps = $state<LightspeedOpsRow | null>(null);
	let linkOpsId = $state("");
	let linkSku = $state("");
	let linkQuery = $state("");
	let linkAdopt = $state("keep");

	const archiveRows = $derived(preview?.archive ?? []);
	const decideRows = $derived(preview?.lightspeedOnly ?? []);
	const stockRows = $derived(preview?.stockOnly ?? []);
	const systemRows = $derived(preview?.systemOnly ?? []);
	const sectionOptions: SelectOption[] = $derived(
		flattenMenuSections(sections).map((section: MenuSection) => ({
			value: section._id,
			label: sectionPathLabel(section),
		})),
	);
	const drinkTypeOptions: SelectOption[] = DRINK_TYPES.map((row) => ({
		value: row.value,
		label: row.label,
	}));
	const guestPlacementItems: SegmentedItem[] = GUEST_MENU_PLACEMENTS.map((row) => ({
		id: row.value,
		label: row.label,
	}));
	const nameAdoptItems: SegmentedItem[] = [
		{ id: "keep", label: "Keep ops name" },
		{ id: "pos", label: "Use POS name" },
	];
	const tabs: SegmentedItem[] = $derived(
		preview
			? [
					{ id: "decide", label: "Lightspeed only", count: decideRows.length },
					{ id: "stock", label: "Stock", count: stockRows.length },
					{ id: "system", label: "System", count: systemRows.length },
					{ id: "mismatch", label: "Name mismatch", count: preview.conflicts.length },
					{ id: "missing", label: "Ops only", count: preview.opsOnly.length },
					{ id: "matched", label: "Matched", count: preview.matched.length },
					{ id: "archive", label: "Archive", count: archiveRows.length },
				]
			: [],
	);
	const filteredDecide = $derived(filterRows(decideRows, query));
	const filteredStock = $derived(filterRows(stockRows, query));
	const filteredSystem = $derived(filterRows(systemRows, query));
	const filteredArchive = $derived(filterRows(archiveRows, query));
	const busyLabel = $derived(
		acting === "save"
			? "Stamping SKUs…"
			: acting === "link"
				? "Matching…"
				: acting === "all"
					? "Marking leftovers…"
					: acting
						? "Updating…"
						: applying
							? "Stamping SKUs…"
							: "Matching…",
	);
	const linkOpen = $derived(Boolean(linkLs || linkOps));
	const linkTargetName = $derived(linkLs?.name || linkOps?.name || "");
	const linkOpsChoices = $derived(
		rankByName(linkTargetName, preview?.opsOnly ?? []).filter((item: LightspeedOpsRow) => {
			const q = linkQuery.trim().toLowerCase();
			if (!q) return true;
			return [item.name, item.lightspeedSku]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(q);
		}),
	);
	const linkLsChoices = $derived(
		rankByName(linkTargetName, decideRows).filter((row: LightspeedCsvRow) => {
			if (!row.sku) return false;
			const q = linkQuery.trim().toLowerCase();
			if (!q) return true;
			return [row.name, row.sku, row.buttonName]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(q);
		}),
	);
	const linkOpsOptions: SelectOption[] = $derived(
		linkOpsChoices.map((item: LightspeedOpsRow) => ({
			value: String(item.id || ""),
			label: item.name || "",
			hint: item.lightspeedSku || undefined,
		})),
	);
	const lastRecon = $derived.by(() => {
		const items = flattenMenuSections(sections).flatMap(
			(section) => section.items || [],
		);
		let matched = 0;
		let mismatch = 0;
		let missing = 0;
		for (const item of items) {
			if (item.lightspeedStatus === "matched") matched += 1;
			else if (item.lightspeedStatus === "mismatch") mismatch += 1;
			else if (item.lightspeedStatus === "missing") missing += 1;
		}
		return {
			matched,
			mismatch,
			missing,
			stamped: matched + mismatch + missing,
			total: items.length,
		};
	});
	const linkLsOptions: SelectOption[] = $derived(
		linkLsChoices.map((row: LightspeedCsvRow) => ({
			value: row.sku || "",
			label: row.name || row.sku || "",
			hint: row.sku,
		})),
	);

	onMount(() => {
		void getMenu()
			.then((data) => {
				sections = data.sections || [];
				posMenus = data.posMenus || [];
				const fallback = defaultPosMenus(posMenus)[0];
				if (fallback) menuName = fallback.name;
			})
			.catch(() => {
				sections = [];
			});
	});

	function priceLabel(value: number | null | undefined) {
		if (value == null) return "";
		return `£${value.toFixed(2)}`.replace(/\.00$/, "");
	}

	function rowKey(row: LightspeedCsvRow) {
		return row.key || row.sku || row.name || "";
	}

	function filterRows(rows: LightspeedCsvRow[], raw: string) {
		const q = raw.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) => {
			const hay = [
				row.name,
				row.sku,
				row.type,
				row.accountingGroup,
				row.statisticsGroup,
				row.menuScreen,
				row.buttonName,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return hay.includes(q);
		});
	}

	function guessSectionId(row: LightspeedCsvRow) {
		const parts = String(row.menuScreen || "")
			.split("/")
			.map((part) => part.trim())
			.filter(Boolean);
		const leaf = parts[parts.length - 1] || "";
		const flat = flattenMenuSections(sections);
		if (leaf) {
			const hit = flat.find(
				(section: MenuSection) =>
					String(section.title || "").toLowerCase() === leaf.toLowerCase(),
			);
			if (hit) return hit._id;
		}
		return flat[0]?._id || "";
	}

	function pickTab(next: LightspeedPreview) {
		if (next.lightspeedOnly.length) return "decide";
		if ((next.stockOnly || []).length) return "stock";
		if (next.conflicts.length) return "mismatch";
		if (next.opsOnly.length) return "missing";
		if ((next.systemOnly || []).length) return "system";
		if ((next.archive || []).length) return "archive";
		return "matched";
	}

	function resetPreview() {
		preview = null;
	}

	async function previewFile(text: string, extra: Parameters<typeof previewLightspeedCsv>[1] = {}) {
		const next = await previewLightspeedCsv(text, { menuName, ...extra });
		preview = next;
		return next;
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
			importOpen = false;
			const next = await previewFile(text);
			tab = pickTab(next);
			toast.ok("Matched drinks to the menu, stock to inventory.");
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

	async function apply() {
		if (!csvText) return;
		applying = true;
		acting = "save";
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				action: "save",
				menuName,
			});
			toast.ok("Stamped Lightspeed SKUs onto matched drinks and stock.");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not save the match.";
			error = message;
			toast.error(message);
		} finally {
			applying = false;
			acting = "";
		}
	}

	function openAdd(row: LightspeedCsvRow) {
		addRow = row;
		addName = serveBaseName(row.name) || row.name || "";
		addDrinkType = row.suggestedDrinkType || "pour";
		addPrice = row.suggestedPrice || "";
		addPlacement = "none";
		addSectionId = guessSectionId(row);
		const named = posMenus.find((menu) => menu.name === menuName);
		addPosMenuId = named?.id || defaultPosMenus(posMenus)[0]?.id || "";
	}

	function closeAdd() {
		addRow = null;
	}

	async function confirmAdd() {
		if (!addRow || !csvText) return;
		if (!addName.trim()) {
			toast.error("Name is required.");
			return;
		}
		if (!addSectionId) {
			toast.error("Pick a menu section.");
			return;
		}
		acting = rowKey(addRow);
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				action: "add",
				menuName,
				items: [
					{
						sku: addRow.sku,
						name: addName.trim(),
						sectionId: addSectionId,
						drinkType: addDrinkType,
						price: addPrice,
						defaultPrice: addRow.defaultPrice,
						posMenuIds: addPosMenuId ? [addPosMenuId] : undefined,
						menuScreen: addRow.menuScreen,
						...guestMenuFlags(asGuestMenuPlacement(addPlacement)),
					},
				],
			});
			tab = pickTab(preview);
			toast.ok(`Added ${addName.trim()} to the menu.`);
			closeAdd();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not add that drink.";
			error = message;
			toast.error(message);
		} finally {
			acting = "";
		}
	}

	async function addStock(row: LightspeedCsvRow) {
		if (!csvText) return;
		acting = rowKey(row);
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				action: "add-stock",
				menuName,
				items: [{ sku: row.sku, name: row.name, quantity: row.quantity, unit: row.unit }],
			});
			tab = pickTab(preview);
			toast.ok(`Added ${row.name || row.sku || "item"} to inventory.`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not add that stock row.";
			error = message;
			toast.error(message);
		} finally {
			acting = "";
		}
	}

	async function markArchive(rows: LightspeedCsvRow[]) {
		if (!csvText || !rows.length) return;
		acting = rows.length === 1 ? rowKey(rows[0]) : "all";
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				action: "archive",
				menuName,
				rows: rows.map((row) => ({ sku: row.sku, name: row.name })),
			});
			tab = pickTab(preview);
			toast.ok(
				rows.length === 1
					? `Marked ${rows[0].name || rows[0].sku || "item"} for archive.`
					: `Marked ${rows.length} leftovers for archive.`,
			);
			archiveAllOpen = false;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not mark those items.";
			error = message;
			toast.error(message);
		} finally {
			acting = "";
		}
	}

	async function unarchive(row: LightspeedCsvRow) {
		if (!csvText || !row.sku) return;
		acting = rowKey(row);
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				action: "unarchive",
				menuName,
				skus: [row.sku],
			});
			tab = pickTab(preview);
			toast.ok(`Moved ${row.name || row.sku} back to decide.`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not unmark that item.";
			error = message;
			toast.error(message);
		} finally {
			acting = "";
		}
	}

	function closeLink() {
		linkLs = null;
		linkOps = null;
		linkOpsId = "";
		linkSku = "";
		linkQuery = "";
		linkAdopt = "keep";
	}

	function openMatchLs(row: LightspeedCsvRow) {
		linkLs = row;
		linkOps = null;
		linkQuery = "";
		linkAdopt = "keep";
		linkSku = row.sku || "";
		const ranked = rankByName(row.name || "", preview?.opsOnly ?? []);
		linkOpsId = String(ranked[0]?.id || "");
	}

	function openMatchOps(item: LightspeedOpsRow) {
		linkOps = item;
		linkLs = null;
		linkQuery = "";
		linkAdopt = "keep";
		linkOpsId = String(item.id || "");
		const ranked = rankByName(item.name || "", decideRows);
		linkSku = ranked.find((row: LightspeedCsvRow) => row.sku)?.sku || "";
	}

	async function confirmLink() {
		if (!csvText) return;
		const itemId = linkOps ? String(linkOps.id || "") : linkOpsId;
		const sku = linkLs ? linkLs.sku || "" : linkSku;
		const posName = linkLs
			? linkLs.name || ""
			: decideRows.find((row) => row.sku === sku)?.name || "";
		if (!itemId) {
			toast.error("Pick a menu item to match.");
			return;
		}
		if (!sku) {
			toast.error("Pick a Lightspeed item to match.");
			return;
		}
		acting = "link";
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				action: "link",
				menuName,
				links: [
					{
						itemId,
						sku,
						name: posName,
						adoptName: linkAdopt === "pos",
					},
				],
			});
			tab = pickTab(preview);
			toast.ok("Linked the Lightspeed SKU to that menu item.");
			closeLink();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not match those items.";
			error = message;
			toast.error(message);
		} finally {
			acting = "";
		}
	}

	async function adoptPosName(row: LightspeedMatchRow) {
		if (!csvText || !row.ops.id || !row.lightspeed.sku) return;
		acting = "link";
		error = "";
		try {
			preview = await previewLightspeedCsv(csvText, {
				action: "link",
				menuName,
				links: [
					{
						itemId: row.ops.id,
						sku: row.lightspeed.sku,
						name: row.lightspeed.name,
						adoptName: true,
					},
				],
			});
			tab = pickTab(preview);
			toast.ok(`Renamed to ${row.lightspeed.name || "the POS name"}.`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not use the POS name.";
			error = message;
			toast.error(message);
		} finally {
			acting = "";
		}
	}

	function download(filename: string, csv: string | undefined) {
		if (!csv) return;
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="POS reconcile"
	>
		{#snippet actions()}
			<PageHelp title="POS reconcile" topics={RECONCILE_HELP} />
			<Button
				variant="outline"
				size="sm"
				disabled={!preview?.itemImportCsv || (preview.opsOnly?.length || 0) === 0}
				onclick={() =>
					download("lightspeed-item-import.csv", preview?.itemImportCsv)}
			>
				Download item import
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={!preview?.archiveSkuCsv || archiveRows.length === 0}
				onclick={() =>
					download("lightspeed-archive-skus.csv", preview?.archiveSkuCsv)}
			>
				Download archive SKUs
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={applying}
				disabled={!preview || applying}
				onclick={apply}
			>
				Stamp SKUs
			</Button>
		{/snippet}
		</PageHeader>

	<div class="stack">
		<Card
			title={preview ? "This file" : "Last reconcile"}
			subtitle={preview
				? `${fileName || "Item list"} compared with ops.`
				: "Match status from the last time SKUs were stamped."}
		>
			{#snippet actions()}
				<Button
					variant="outline"
					size="sm"
					onclick={() => (importOpen = true)}
				>
					Import item list
				</Button>
			{/snippet}
			{#if preview}
				<div class="status">
					<div class="fig" class:up={preview.conflicts.length === 0}>
						<p class="value tnum">{preview.matched.length}</p>
						<p class="fig-label">Matched</p>
					</div>
					<div class="fig" class:warn={preview.conflicts.length > 0}>
						<p class="value tnum">{preview.conflicts.length}</p>
						<p class="fig-label">Name mismatch</p>
					</div>
					<div class="fig" class:down={preview.opsOnly.length > 0}>
						<p class="value tnum">{preview.opsOnly.length}</p>
						<p class="fig-label">Ops only</p>
					</div>
					<div class="fig" class:warn={decideRows.length > 0}>
						<p class="value tnum">{decideRows.length}</p>
						<p class="fig-label">Lightspeed only</p>
					</div>
				</div>
			{:else if lastRecon.stamped === 0}
				<p class="muted">
					No reconcile has been stamped yet. Import a Lightspeed item list to compare.
				</p>
			{:else}
				<div class="status">
					<div class="fig up">
						<p class="value tnum">{lastRecon.matched}</p>
						<p class="fig-label">Matched</p>
					</div>
					<div class="fig" class:warn={lastRecon.mismatch > 0}>
						<p class="value tnum">{lastRecon.mismatch}</p>
						<p class="fig-label">Name mismatch</p>
					</div>
					<div class="fig" class:down={lastRecon.missing > 0}>
						<p class="value tnum">{lastRecon.missing}</p>
						<p class="fig-label">Ops only</p>
					</div>
				</div>
				<p class="status-note">
					{lastRecon.stamped} of {lastRecon.total} drinks were in the last stamp.
				</p>
			{/if}
		</Card>

		{#if importOpen}
		<Card
			title="Import item list"
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
		{/if}

		{#if preview}
			<div class="groups" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
				<Segmented bind:value={tab} items={tabs} size="sm" ariaLabel="Reconcile groups" />

				{#if tab === "decide"}
					<Card
						title="Lightspeed only"
					>
						{#snippet actions()}
							<SearchField
								bind:value={query}
								placeholder="Filter"
								ariaLabel="Filter Lightspeed only"
								count={query ? filteredDecide.length : undefined}
								width="14rem"
							/>
							<Button
								variant="outline"
								size="sm"
								disabled={!decideRows.length || Boolean(acting)}
								onclick={() => (archiveAllOpen = true)}
							>
								Archive remaining
							</Button>
						{/snippet}
						{#if decideRows.length === 0}
							<p class="muted">None left.</p>
						{:else if filteredDecide.length === 0}
							<p class="muted">None match.</p>
						{:else}
							<table class="table">
								<thead>
									<tr>
										<th>Name</th>
										<th>SKU</th>
										<th>Group</th>
										<th>Price</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each filteredDecide as row (rowKey(row))}
										<tr>
											<td>
												{row.name || ""}
												{#if row.statisticsGroup}
													<span class="mono">{row.statisticsGroup}</span>
												{/if}
											</td>
											<td class="mono-cell">{row.sku || ""}</td>
											<td>
												{row.accountingGroup || row.type || ""}
												{#if row.menuScreen}
													<span class="mono">{row.menuScreen}</span>
												{/if}
											</td>
											<td class="num">{priceLabel(row.defaultPrice)}</td>
											<td class="actions">
												<Button
													variant="outline"
													size="xs"
													disabled={!row.sku || !(preview?.opsOnly.length) || Boolean(acting)}
													onclick={() => openMatchLs(row)}
												>
													Match
												</Button>
												<Button
													variant="outline"
													size="xs"
													disabled={Boolean(acting)}
													onclick={() => openAdd(row)}
												>
													Add to menu
												</Button>
												<Button
													variant="ghost"
													size="xs"
													disabled={!row.sku || Boolean(acting)}
													onclick={() => void markArchive([row])}
												>
													Archive
												</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</Card>
				{:else if tab === "stock"}
					<Card
						title="Stock leftovers"
					>
						{#snippet actions()}
							<SearchField
								bind:value={query}
								placeholder="Filter stock"
								ariaLabel="Filter stock leftovers"
								count={query ? filteredStock.length : undefined}
								width="14rem"
							/>
						{/snippet}
						{#if stockRows.length === 0}
							<p class="muted">None left.</p>
						{:else if filteredStock.length === 0}
							<p class="muted">No stock rows match that filter.</p>
						{:else}
							<table class="table">
								<thead>
									<tr>
										<th>Name</th>
										<th>SKU</th>
										<th>Group</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each filteredStock as row (rowKey(row))}
										<tr>
											<td>{row.name || ""}</td>
											<td class="mono-cell">{row.sku || ""}</td>
											<td>{row.accountingGroup || row.type || ""}</td>
											<td class="actions">
												<Button
													variant="outline"
													size="xs"
													disabled={Boolean(acting)}
													onclick={() => void addStock(row)}
												>
													Add to inventory
												</Button>
												<Button
													variant="ghost"
													size="xs"
													disabled={!row.sku || Boolean(acting)}
													onclick={() => void markArchive([row])}
												>
													Archive
												</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</Card>
				{:else if tab === "system"}
					<Card
						title="System leftovers"
					>
						{#if systemRows.length === 0}
							<p class="muted">None left.</p>
						{:else if filteredSystem.length === 0}
							<p class="muted">No system rows match that filter.</p>
						{:else}
							<table class="table">
								<thead>
									<tr>
										<th>Name</th>
										<th>SKU</th>
										<th>Type</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each filteredSystem as row (rowKey(row))}
										<tr>
											<td>{row.name || row.sku || ""}</td>
											<td class="mono-cell">{row.sku || ""}</td>
											<td>{row.type || ""}</td>
											<td class="actions">
												<Button
													variant="ghost"
													size="xs"
													disabled={!row.sku || Boolean(acting)}
													onclick={() => void markArchive([row])}
												>
													Archive
												</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</Card>
				{:else if tab === "mismatch"}
					<Card
						title="Name mismatch"
					>
						{#if preview.conflicts.length === 0}
							<p class="muted">No SKU conflicts.</p>
						{:else}
							<table class="table">
								<thead>
									<tr>
										<th>Ops</th>
										<th>Lightspeed</th>
										<th>Price</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each preview.conflicts as row (row.ops.id || row.ops.name || "")}
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
												{priceLabel(row.lightspeed.defaultPrice)}
											</td>
											<td class="actions">
												<Button
													variant="outline"
													size="xs"
													disabled={!row.ops.id || !row.lightspeed.sku || Boolean(acting)}
													onclick={() => void adoptPosName(row)}
												>
													Use POS name
												</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</Card>
				{:else if tab === "missing"}
					<Card
						title="Ops only"
					>
						{#if preview.opsOnly.length === 0}
							<p class="muted">None.</p>
						{:else}
							<ul class="ops-only">
								{#each preview.opsOnly as row (row.id || row.name || "")}
									<li>
										<span class="ops-only-name">
											<span>{row.name}</span>
											{#if row.lightspeedSku}
												<span class="mono">{row.lightspeedSku}</span>
											{/if}
										</span>
										<span class="actions">
											<Button
												variant="outline"
												size="xs"
												disabled={!decideRows.length || Boolean(acting)}
												onclick={() => openMatchOps(row)}
											>
												Match
											</Button>
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</Card>
				{:else if tab === "matched"}
					<Card
						title="Matched"
					>
						{#if preview.matched.length === 0}
							<p class="muted">Nothing matched this file.</p>
						{:else}
							<table class="table">
								<thead>
									<tr>
										<th>Ops</th>
										<th>Lightspeed</th>
										<th>Price</th>
										<th>Via</th>
									</tr>
								</thead>
								<tbody>
									{#each preview.matched as row (`${row.ops.id || ""}:${row.lightspeed.key || ""}`)}
										<tr>
											<td>{row.ops.name}</td>
											<td>
												{row.lightspeed.name || ""}
												{#if row.lightspeed.sku}
													<span class="mono">{row.lightspeed.sku}</span>
												{/if}
												{#if row.lightspeed.menuScreen}
													<span class="mono">{row.lightspeed.menuScreen}</span>
												{/if}
											</td>
											<td class="num">
												{priceLabel(row.lightspeed.defaultPrice)}
											</td>
											<td class="via">{row.via}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</Card>
					{#if (preview.altServes || []).length}
						<Card
							title="Pint and half"
						>
							<table class="table">
								<thead>
									<tr>
										<th>Ops</th>
										<th>Lightspeed</th>
										<th>Price</th>
									</tr>
								</thead>
								<tbody>
									{#each preview.altServes || [] as row (`${row.ops.id || ""}:${row.lightspeed.key || row.lightspeed.sku || ""}`)}
										<tr>
											<td>{row.ops.name}</td>
											<td>
												{row.lightspeed.name || ""}
												{#if row.lightspeed.sku}
													<span class="mono">{row.lightspeed.sku}</span>
												{/if}
											</td>
											<td class="num">{priceLabel(row.lightspeed.defaultPrice)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</Card>
					{/if}
				{:else}
					<Card
						title="Marked for archive"
					>
						{#snippet actions()}
							<SearchField
								bind:value={query}
								placeholder="Filter archive"
								ariaLabel="Filter archive list"
								count={query ? filteredArchive.length : undefined}
								width="14rem"
							/>
						{/snippet}
						{#if archiveRows.length === 0}
							<p class="muted">Nothing marked yet.</p>
						{:else if filteredArchive.length === 0}
							<p class="muted">No marked items match that filter.</p>
						{:else}
							<table class="table">
								<thead>
									<tr>
										<th>Name</th>
										<th>SKU</th>
										<th>Group</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each filteredArchive as row (rowKey(row))}
										<tr>
											<td>{row.name || ""}</td>
											<td class="mono-cell">{row.sku || ""}</td>
											<td>{row.accountingGroup || row.type || ""}</td>
											<td class="actions">
												<Button
													variant="ghost"
													size="xs"
													disabled={!row.sku || Boolean(acting)}
													onclick={() => void unarchive(row)}
												>
													Keep
												</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</Card>
				{/if}
			</div>
		{/if}
	</div>

	<Dialog open={linkOpen} title="Match items" onclose={closeLink}>
		<p class="dialog-lead">
			{#if linkLs}
				Link {linkLs.name || linkLs.sku} to an ops drink.
			{:else}
				Link {linkOps?.name || "this drink"} to a Lightspeed leftover.
			{/if}
		</p>
		<div class="dialog-grid">
			<SearchField
				bind:value={linkQuery}
				placeholder={linkLs ? "Filter menu items" : "Filter POS leftovers"}
				ariaLabel={linkLs ? "Filter menu items" : "Filter POS leftovers"}
				count={linkQuery
					? linkLs
						? linkOpsOptions.length
						: linkLsOptions.length
					: undefined}
				width="100%"
			/>
			{#if linkLs}
				<Field label="Menu item" for="ls-link-ops">
					<NativeSelect
						id="ls-link-ops"
						size="sm"
						bind:value={linkOpsId}
						options={linkOpsOptions}
						disabled={!linkOpsOptions.length}
					/>
				</Field>
			{:else}
				<Field label="Lightspeed item" for="ls-link-pos">
					<NativeSelect
						id="ls-link-pos"
						size="sm"
						bind:value={linkSku}
						options={linkLsOptions}
						disabled={!linkLsOptions.length}
					/>
				</Field>
			{/if}
			<Field label="Name after match">
				<Segmented
					bind:value={linkAdopt}
					items={nameAdoptItems}
					size="sm"
					ariaLabel="Name after match"
				/>
			</Field>
		</div>
		{#if linkLs && !linkOpsOptions.length}
			<p class="error">No unmatched menu items to pair with.</p>
		{:else if linkOps && !linkLsOptions.length}
			<p class="error">No Lightspeed leftovers to pair with.</p>
		{/if}
		{#snippet footer()}
			<Button variant="ghost" size="sm" onclick={closeLink}>Cancel</Button>
			<Button
				variant="primary"
				size="sm"
				busy={acting === "link"}
				disabled={
					acting === "link" ||
					(linkLs ? !linkOpsId : !linkSku)
				}
				onclick={() => void confirmLink()}
			>
				Match
			</Button>
		{/snippet}
	</Dialog>

	<Dialog open={Boolean(addRow)} title="Add to menu" onclose={closeAdd}>
		<div class="dialog-grid">
			<Field label="Name" for="ls-add-name">
				<TextField id="ls-add-name" size="sm" bind:value={addName} />
			</Field>
			<Field label="Section" for="ls-add-section">
				<NativeSelect
					id="ls-add-section"
					size="sm"
					bind:value={addSectionId}
					options={sectionOptions}
					disabled={!sectionOptions.length}
				/>
			</Field>
			<Field label="Type" for="ls-add-type">
				<NativeSelect
					id="ls-add-type"
					size="sm"
					bind:value={addDrinkType}
					options={drinkTypeOptions}
				/>
			</Field>
			<Field label="Price" for="ls-add-price">
				<TextField id="ls-add-price" size="sm" mono bind:value={addPrice} />
			</Field>
			{#if posMenus.length}
				<Field label="POS menu" for="ls-add-pos-menu">
					<NativeSelect
						id="ls-add-pos-menu"
						size="sm"
						bind:value={addPosMenuId}
						options={posMenus.map((menu) => ({
							value: menu.id,
							label: menu.name,
							hint: menu.isDefault ? "Default" : undefined,
						}))}
					/>
				</Field>
			{/if}
			<Field
				label="Guest menus"
				tooltip="POS can still sell this if it is off print and the website."
			>
				<Segmented
					bind:value={addPlacement}
					items={guestPlacementItems}
					size="sm"
					ariaLabel="Guest menus"
				/>
			</Field>
		</div>
		{#if !sectionOptions.length}
			<p class="error">Create a menu section before adding drinks.</p>
		{/if}
		{#snippet footer()}
			<Button variant="ghost" size="sm" onclick={closeAdd}>Cancel</Button>
			<Button
				variant="primary"
				size="sm"
				busy={Boolean(acting)}
				disabled={!sectionOptions.length || Boolean(acting)}
				onclick={() => void confirmAdd()}
			>
				Add to menu
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		open={archiveAllOpen}
		title="Archive remaining"
		onclose={() => (archiveAllOpen = false)}
	>
		<p class="dialog-lead">
			Marks {decideRows.length}
			{decideRows.length === 1 ? "row" : "rows"} for archive. Does not change Lightspeed by itself.
		</p>
		{#snippet footer()}
			<Button variant="ghost" size="sm" onclick={() => (archiveAllOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={acting === "all"}
				disabled={acting === "all"}
				onclick={() => void markArchive(decideRows)}
			>
				Mark for archive
			</Button>
		{/snippet}
	</Dialog>

	<BusyOverlay
		active={loading || applying || Boolean(acting)}
		label={busyLabel}
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

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.status-note {
		margin: 0.85rem 0 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.status {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: var(--gap);
	}

	.fig-label {
		margin: 0.15rem 0 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.value {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 2.5vw, 2.1rem);
		font-weight: 600;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.fig.up .value {
		color: var(--up);
	}

	.fig.warn .value {
		color: var(--primary);
	}

	.fig.down .value {
		color: var(--down);
	}

	@media (max-width: 720px) {
		.status {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
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

	.via {
		color: var(--muted-foreground);
		text-transform: capitalize;
	}

	.mono,
	.mono-cell {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.mono {
		display: block;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.35rem;
		white-space: nowrap;
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
		align-items: center;
		justify-content: space-between;
		gap: 0.45rem 0.75rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.ops-only-name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.45rem 0.75rem;
		min-width: 0;
	}

	.ops-only .actions {
		margin-left: auto;
	}

	.ops-only li:last-child {
		border-bottom: 0;
	}

	.dialog-lead {
		margin: 0 0 var(--gap);
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.dialog-grid {
		display: grid;
		gap: var(--gap);
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
