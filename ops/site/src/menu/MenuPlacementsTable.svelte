<script lang="ts">
	import { NativeSelect, RowAction, TextField } from "../ui";
	import type { SelectOption } from "../ui/types";
	import type { MenuPlacement, PosMenu } from "./types";
	import { parsePosScreenInput } from "../inventory/lightspeed-stock.js";

	let {
		menus = [],
		placements = [],
		sectionOptions = [],
		screenSuggestions = [],
		drinkName = "",
		posName = "",
		onposname,
		onchange,
	}: {
		menus?: PosMenu[];
		placements?: MenuPlacement[];
		sectionOptions?: SelectOption[];
		screenSuggestions?: string[];
		/** Shown on Print and Digital, which always use the drink's name. */
		drinkName?: string;
		/** The till button name: one override shared by every POS row. */
		posName?: string;
		onposname: (next: string) => void;
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
						<th scope="col">Name on it</th>
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
												row.channel as "print" | "digital",
												(e.currentTarget as HTMLSelectElement).value,
											)}
									/>
								{/if}
							</td>
							<td class="name-on">
								{#if row.channel === "pos"}
									<TextField
										id={`f-pos-name-${row.placement.posMenuId}`}
										size="sm"
										value={posName}
										placeholder={drinkName || "Same as the drink"}
										aria-label={`Name on the till for ${row.label}`}
										oninput={(e) => onposname((e.currentTarget as HTMLInputElement).value)}
									/>
								{:else}
									<span class="inherited" title="Print and digital menus use the drink's name">{drinkName || "The drink's name"}</span>
								{/if}
							</td>
							<td class="icon-col">
								<RowAction label={`Remove ${row.label}`} onclick={() => remove(row.placement)} />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="hint">Not on any menu yet. Use Add placement to put it on Print, Digital or a POS menu.</p>
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
		gap: var(--space-3);
	}

	/* On the card's own surface; rows carry their own dividers. */
	.table-wrap {
		overflow-x: auto;
		border-top: 1px solid var(--border);
	}

	.menu-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.menu-table th,
	.menu-table td {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	.menu-table th {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
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
		width: 20%;
	}

	.location-cell {
		width: 40%;
		min-width: 12rem;
	}

	.name-on {
		min-width: 12rem;
	}

	.inherited {
		color: var(--fg-muted);
	}

	.location-cell :global(select) {
		width: 100%;
	}

	.icon-col {
		width: 3rem;
		padding-left: 0.2rem;
		padding-right: var(--space-1);
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
