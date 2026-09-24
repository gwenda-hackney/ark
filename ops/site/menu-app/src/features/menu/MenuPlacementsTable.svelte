<script lang="ts">
	import { Button, Field, NativeSelect } from "../../ui";
	import type { SelectOption } from "../../ui/types";
	import type { MenuPlacement, PosMenu } from "../../lib/types";
	import { parsePosScreenInput } from "../../../../functions/_lib/lightspeed-stock.js";

	let {
		menus = [],
		placements = [],
		sectionOptions = [],
		screenSuggestions = [],
		defaultSectionId = "",
		onchange,
	}: {
		menus?: PosMenu[];
		placements?: MenuPlacement[];
		sectionOptions?: SelectOption[];
		screenSuggestions?: string[];
		defaultSectionId?: string;
		onchange: (next: MenuPlacement[]) => void;
	} = $props();

	const rows = $derived.by(() => {
		const list = placements || [];
		const print = list.find((row) => row.channel === "print");
		const digital = list.find((row) => row.channel === "digital");
		const pos = list.filter((row) => row.channel === "pos");
		const out: Array<{
			key: string;
			channel: "print" | "digital" | "pos";
			label: string;
			placement: MenuPlacement;
		}> = [];
		if (print) {
			out.push({
				key: "print",
				channel: "print",
				label: "Print",
				placement: print,
			});
		}
		if (digital) {
			out.push({
				key: "digital",
				channel: "digital",
				label: "Digital",
				placement: digital,
			});
		}
		for (const row of pos) {
			out.push({
				key: `pos:${row.posMenuId}`,
				channel: "pos",
				label: row.posMenuName ? `POS · ${row.posMenuName}` : "POS",
				placement: row,
			});
		}
		return out;
	});

	const canAddPrint = $derived(!(placements || []).some((row) => row.channel === "print"));
	const canAddDigital = $derived(
		!(placements || []).some((row) => row.channel === "digital"),
	);
	const unusedMenus = $derived(
		(menus || []).filter(
			(menu) =>
				!(placements || []).some(
					(row) =>
						row.channel === "pos" && String(row.posMenuId) === String(menu.id),
				),
		),
	);

	const addOptions = $derived.by((): SelectOption[] => {
		const options: SelectOption[] = [{ value: "", label: "Add…" }];
		if (canAddPrint) options.push({ value: "print", label: "Print" });
		if (canAddDigital) options.push({ value: "digital", label: "Digital" });
		for (const menu of unusedMenus) {
			options.push({
				value: `pos:${menu.id}`,
				label: menu.isDefault
					? `POS · ${menu.name} (default)`
					: `POS · ${menu.name}`,
			});
		}
		return options;
	});

	const screenOptions = $derived.by((): SelectOption[] => {
		const known = new Set(
			(screenSuggestions || []).map((path) => path.toLowerCase()),
		);
		const extras = (placements || [])
			.filter((row) => row.channel === "pos")
			.map((row) => parsePosScreenInput(row.posScreen))
			.filter((path) => path && !known.has(path.toLowerCase()));
		const paths = [...(screenSuggestions || []), ...extras];
		return [
			{ value: "", label: "Choose screen…" },
			...paths.map((path) => ({ value: path, label: path })),
		];
	});

	function emit(next: MenuPlacement[]) {
		onchange(next);
	}

	function defaultScreen() {
		const existing = (placements || []).find((row) => row.channel === "pos");
		return (
			parsePosScreenInput(existing?.posScreen) ||
			parsePosScreenInput(screenSuggestions[0]) ||
			"Signature Cocktails"
		);
	}

	function defaultSection() {
		return (
			String(defaultSectionId || "").trim() ||
			String(sectionOptions[0]?.value || "").trim()
		);
	}

	function onAdd(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		(event.currentTarget as HTMLSelectElement).value = "";
		if (!value) return;
		const list = [...(placements || [])];
		if (value === "print" || value === "digital") {
			const sectionId = defaultSection();
			if (!sectionId) return;
			emit([
				...list.filter((row) => row.channel !== value),
				{ channel: value, sectionId },
			]);
			return;
		}
		if (value.startsWith("pos:")) {
			const id = value.slice(4);
			const menu = (menus || []).find((row) => String(row.id) === id);
			if (!menu) return;
			emit([
				...list,
				{
					channel: "pos",
					posMenuId: String(menu.id),
					posMenuName: menu.name,
					posScreen: defaultScreen(),
				},
			]);
		}
	}

	function setSection(channel: "print" | "digital", sectionId: string) {
		if (!sectionId) return;
		emit(
			(placements || []).map((row) =>
				row.channel === channel ? { ...row, sectionId } : row,
			),
		);
	}

	function setScreen(posMenuId: string, screen: string) {
		const path = parsePosScreenInput(screen);
		if (!path) return;
		emit(
			(placements || []).map((row) =>
				row.channel === "pos" && String(row.posMenuId) === String(posMenuId)
					? { ...row, posScreen: path }
					: row,
			),
		);
	}

	function remove(row: MenuPlacement) {
		if (row.channel === "pos") {
			emit(
				(placements || []).filter(
					(entry) =>
						!(
							entry.channel === "pos" &&
							String(entry.posMenuId) === String(row.posMenuId)
						),
				),
			);
			return;
		}
		emit((placements || []).filter((entry) => entry.channel !== row.channel));
	}
</script>

<div class="panel">
	{#if rows.length}
		<div class="table-wrap">
			<table class="menu-table">
				<thead>
					<tr>
						<th scope="col">Channel</th>
						<th scope="col">Location</th>
						<th scope="col" class="icon-col">
							<span class="sr-only">Remove</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.key)}
						<tr>
							<td class="name-cell">{row.label}</td>
							<td class="location-cell">
								{#if row.channel === "pos"}
									<NativeSelect
										id={`f-menu-screen-${row.placement.posMenuId}`}
										size="sm"
										options={screenOptions}
										value={parsePosScreenInput(row.placement.posScreen)}
										aria-label={`Screen for ${row.label}`}
										onchange={(e) =>
											setScreen(
												String(row.placement.posMenuId),
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								{:else}
									<NativeSelect
										id={`f-menu-section-${row.channel}`}
										size="sm"
										options={sectionOptions}
										value={row.placement.sectionId || ""}
										aria-label={`Chapter for ${row.label}`}
										onchange={(e) =>
											setSection(
												row.channel,
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								{/if}
							</td>
							<td class="icon-col">
								<Button
									variant="ghost"
									size="xs"
									type="button"
									aria-label={`Remove ${row.label}`}
									onclick={() => remove(row.placement)}
								>
									Remove
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="hint">
			No menus yet. Add Print, Digital, and/or a POS menu below.
		</p>
	{/if}

	{#if addOptions.length > 1}
		<Field label="Add" for="f-add-menu-row">
			<NativeSelect
				id="f-add-menu-row"
				size="sm"
				options={addOptions}
				value=""
				onchange={onAdd}
			/>
		</Field>
	{/if}

	{#if rows.some((row) => row.channel === "print" || row.channel === "digital") && !rows.some((row) => row.channel === "pos")}
		<p class="hint warn">
			Guest menus need a POS row so the till can sell this drink.
		</p>
	{/if}
</div>

<style>
	.panel {
		display: grid;
		gap: 0.75rem;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
	}

	.menu-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.menu-table th,
	.menu-table td {
		padding: 0.4rem 0.65rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	.menu-table th {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		background: color-mix(in srgb, var(--card) 70%, transparent);
	}

	.menu-table tbody tr:last-child td {
		border-bottom: 0;
	}

	.name-cell {
		font-weight: 500;
		white-space: nowrap;
		width: 28%;
	}

	.location-cell {
		min-width: 12rem;
	}

	.location-cell :global(select) {
		width: 100%;
	}

	.icon-col {
		width: 4.5rem;
		padding-left: 0.2rem;
		padding-right: 0.35rem;
		text-align: right;
		white-space: nowrap;
	}

	.hint {
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.hint.warn {
		color: var(--warning, var(--primary));
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
