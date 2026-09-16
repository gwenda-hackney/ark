<script lang="ts" generics="T">
	/**
	 * Trading-shaped AG Grid host: theme via CSS vars, dense rows.
	 * Columns keep `flex` so they fill the viewport on grow and shrink;
	 * `fitGridWidth` would bake pixel widths and never expand again.
	 */
	import { untrack } from "svelte";
	import {
		createGrid,
		type ColDef,
		type GridApi,
		type GridOptions,
	} from "ag-grid-community";
	import { hasRangeSelection, opsGridTheme } from "../lib/grid";
	import {
		readGridViewportScroll,
		recalledGridScroll,
		rememberGridScroll,
		scrollGridViewport,
	} from "../lib/grid-scroll";

	const NUMERIC_HEADER = "ag-right-aligned-header";

	function isNumericCol<T>(def: ColDef<T>): boolean {
		const type = def.type;
		if (type === "num" || (Array.isArray(type) && type.includes("num"))) {
			return true;
		}
		const cell = def.cellClass;
		if (typeof cell === "string") {
			return /(^|\s)(num|ag-right-aligned-cell)(\s|$)/.test(cell);
		}
		if (Array.isArray(cell)) {
			return cell.some(
				(cls) =>
					typeof cls === "string" &&
					/(^|\s)(num|ag-right-aligned-cell)(\s|$)/.test(cls),
			);
		}
		return false;
	}

	/**
	 * `width` without `flex` is a fixed column. defaultColDef.flex would
	 * otherwise stretch every sized col, and leftover would not land on the
	 * last flex column.
	 */
	function lockPixelCols<T>(defs: ColDef<T>[]): ColDef<T>[] {
		return defs.map((def) => {
			if (def.flex != null || def.width == null) return def;
			return { ...def, flex: 0 };
		});
	}

	function prepareColDefs<T>(defs: ColDef<T>[]): ColDef<T>[] {
		return withNumericHeaders(lockPixelCols(defs));
	}

	function withNumericHeaders<T>(defs: ColDef<T>[]): ColDef<T>[] {
		return defs.map((def) => {
			if (!isNumericCol(def)) return def;
			const existing = def.headerClass;
			if (typeof existing === "string" && existing.split(/\s+/).includes(NUMERIC_HEADER)) {
				return def;
			}
			if (Array.isArray(existing) && existing.includes(NUMERIC_HEADER)) {
				return def;
			}
			if (!existing) return { ...def, headerClass: NUMERIC_HEADER };
			if (typeof existing === "string") {
				return { ...def, headerClass: `${existing} ${NUMERIC_HEADER}` };
			}
			if (Array.isArray(existing)) {
				return { ...def, headerClass: [...existing, NUMERIC_HEADER] };
			}
			return {
				...def,
				headerClass: (params) => {
					const result = existing(params);
					if (!result) return NUMERIC_HEADER;
					if (typeof result === "string") {
						return result.split(/\s+/).includes(NUMERIC_HEADER)
							? result
							: `${result} ${NUMERIC_HEADER}`;
					}
					if (Array.isArray(result)) {
						return result.includes(NUMERIC_HEADER)
							? result
							: [...result, NUMERIC_HEADER];
					}
					return NUMERIC_HEADER;
				},
			};
		});
	}

	let {
		rowData,
		columnDefs,
		getRowId,
		context,
		class: className = "",
		onRowClicked,
		gridOptions = {},
		domLayout = "normal",
		pinnedBottomRowData,
		scrollKey = "",
	}: {
		rowData: T[];
		columnDefs: ColDef<T>[];
		getRowId: (row: T) => string;
		context?: unknown;
		class?: string;
		onRowClicked?: (row: T) => void;
		gridOptions?: Partial<GridOptions<T>>;
		domLayout?: "normal" | "autoHeight";
		pinnedBottomRowData?: T[];
		/** Persist/restore vertical scroll across parent remounts and overlays. */
		scrollKey?: string;
	} = $props();

	let host: HTMLDivElement | undefined = $state();
	let api = $state.raw<GridApi<T> | undefined>(undefined);

	function withPreservedScroll(root: HTMLElement, run: () => void) {
		const key = scrollKey;
		const top = key
			? Math.max(recalledGridScroll(key), readGridViewportScroll(root))
			: readGridViewportScroll(root);
		run();
		scrollGridViewport(root, top);
		if (key) rememberGridScroll(key, top);
		queueMicrotask(() => scrollGridViewport(root, top));
		requestAnimationFrame(() => scrollGridViewport(root, top));
	}

	function applyRows(grid: GridApi<T>, data: T[]) {
		grid.setGridOption("rowData", data);
		// getRowId keeps the same nodes. Force valueGetter / cellClass columns
		// (cost, pour, ABV) to reread the new row objects.
		grid.refreshCells({ force: true });
		grid.redrawRows();
	}

	$effect(() => {
		const el = host;
		if (!el) return;

		const idFn = untrack(() => getRowId);
		const extra = untrack(() => gridOptions);
		const key = untrack(() => scrollKey);
		const priorScroll = key ? recalledGridScroll(key) : 0;
		const userBodyScroll = extra.onBodyScroll;
		const grid: GridApi<T> = createGrid(el, {
			theme: opsGridTheme,
			columnDefs: untrack(() => prepareColDefs(columnDefs)),
			rowData: untrack(() => rowData),
			context: untrack(() => context),
			domLayout: untrack(() => domLayout),
			defaultColDef: {
				sortable: true,
				resizable: true,
				minWidth: 64,
				flex: 1,
				suppressHeaderMenuButton: true,
			},
			columnTypes: {
				num: {
					cellClass: "num ag-right-aligned-cell",
					headerClass: "ag-right-aligned-header",
				},
			},
			animateRows: false,
			headerHeight: 40,
			rowHeight: 38,
			suppressCellFocus: true,
			suppressScrollOnNewData: true,
			enableCellTextSelection: true,
			ensureDomOrder: true,
			tooltipShowDelay: 400,
			getRowId: (params) => (params.data ? idFn(params.data) : ""),
			pinnedBottomRowData: untrack(() => pinnedBottomRowData) ?? [],
			onRowClicked: (event) => {
				if (hasRangeSelection()) return;
				if (event.data) onRowClicked?.(event.data);
			},
			...extra,
			onBodyScroll: (event) => {
				if (key && event.direction === "vertical") {
					rememberGridScroll(key, event.top);
				}
				userBodyScroll?.(event);
			},
			onFirstDataRendered: (event) => {
				if (priorScroll > 0) scrollGridViewport(el, priorScroll);
				extra.onFirstDataRendered?.(event);
			},
		});

		api = grid;

		if (priorScroll > 0) {
			scrollGridViewport(el, priorScroll);
			queueMicrotask(() => scrollGridViewport(el, priorScroll));
			requestAnimationFrame(() => scrollGridViewport(el, priorScroll));
		}

		return () => {
			if (key) {
				rememberGridScroll(key, readGridViewportScroll(el));
			}
			if (api === grid) api = undefined;
			grid.destroy();
		};
	});

	$effect(() => {
		const grid = api;
		const el = host;
		if (!grid || !el) return;
		const data = rowData;
		withPreservedScroll(el, () => applyRows(grid, data));
	});
	$effect(() => {
		const grid = api;
		const el = host;
		if (!grid || !el) return;
		const defs = prepareColDefs(columnDefs);
		withPreservedScroll(el, () => {
			grid.setGridOption("columnDefs", defs);
			grid.refreshCells({ force: true });
		});
	});
	$effect(() => {
		const grid = api;
		const el = host;
		if (!grid || !el) return;
		const ctx = context;
		withPreservedScroll(el, () => {
			grid.setGridOption("context", ctx);
			grid.redrawRows();
		});
	});
	$effect(() => {
		const grid = api;
		const el = host;
		if (!grid || !el) return;
		const pinned = pinnedBottomRowData ?? [];
		withPreservedScroll(el, () => {
			grid.setGridOption("pinnedBottomRowData", pinned);
		});
	});

</script>

<div class="host {className}" class:auto={domLayout === "autoHeight"} bind:this={host}></div>

<style>
	.host {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 12rem;
	}

	.host.auto {
		height: auto;
		min-height: 0;
	}

	.host :global(.ag-header-cell-text) {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 12px;
		font-weight: 600;
	}

	.host :global(.ag-header-cell-resize)::after {
		display: none;
	}

	.host :global(.ag-header) {
		border-bottom: 1px solid var(--border);
	}

	/*
	  AG Grid paints a 1px header focus box via ::after. Links inside cells
	  (the name column) pick up the global :focus-visible pill, which hugs the
	  word. Keep one table-shaped ring on the cell instead.
	*/
	.host :global(.ag-header-cell:focus-visible),
	.host :global(.ag-header-group-cell:focus-visible),
	.host :global(.ag-cell:focus-visible),
	.host :global(.ag-cell :focus-visible) {
		outline: none;
		outline-offset: 0;
		border-radius: 0;
	}

	.host :global(.ag-cell:focus-within:not(.ag-cell-inline-editing)) {
		outline: 1px solid var(--ring);
		outline-offset: -4px;
	}

	.host :global(.ag-cell) {
		display: flex;
		align-items: center;
		overflow: hidden;
	}

	.host :global(.ag-right-aligned-cell),
	.host :global(.ag-cell.num) {
		justify-content: flex-end;
		text-align: right;
	}

	.host :global(.ag-right-aligned-cell .ag-cell-wrapper),
	.host :global(.ag-cell.num .ag-cell-wrapper) {
		justify-content: flex-end;
		width: 100%;
	}

	.host :global(.ag-right-aligned-header .ag-cell-label-container) {
		flex-direction: row;
	}

	.host :global(.ag-right-aligned-header .ag-header-cell-label) {
		flex-direction: row-reverse;
		justify-content: flex-start;
	}

	.host :global(.ag-right-aligned-header .ag-header-cell-text) {
		text-align: end;
	}

	.host :global(.ag-right-aligned-cell .ag-cell-inline-editing input),
	.host :global(.ag-cell.num .ag-cell-inline-editing input) {
		text-align: right;
	}

	/*
	  AG Grid zeros cell padding on edit and styles the input with its own
	  border/padding, so the value jumps. Keep the same box as a display cell:
	  1px border + (cellHorizontalPadding - 1px), input flush inside.
	*/
	.host :global(.ag-cell-inline-editing) {
		padding-left: calc(var(--ag-cell-horizontal-padding) - 1px);
		padding-right: calc(var(--ag-cell-horizontal-padding) - 1px);
		border: 1px solid transparent !important;
		border-radius: 0;
		box-shadow: inset 0 0 0 1px var(--ring);
		background-color: transparent;
		background-image: none;
	}

	.host :global(.ag-cell-inline-editing .ag-cell-editor),
	.host :global(.ag-cell-inline-editing .ag-cell-editor .ag-wrapper),
	.host :global(.ag-cell-inline-editing .ag-cell-editor input),
	.host :global(.ag-cell-inline-editing input),
	.host :global(.ag-cell-inline-editing select) {
		width: 100%;
		height: 100%;
		min-height: 0;
		margin: 0;
		padding: 0 !important;
		border: 0 !important;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		line-height: inherit;
		box-shadow: none !important;
		outline: none;
	}

	.host :global(.ag-cell.photo-cell),
	.host :global(.ag-cell.photo-cell .ag-cell-wrapper) {
		overflow: visible;
	}

	.host :global(.ag-cell-wrapper),
	.host :global(.ag-cell-value) {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
	}

	.host :global(.ag-row) {
		transition: background-color var(--t-fast) var(--ease-in-out);
	}

	.host :global(.ag-row-focus) {
		outline: none;
	}

	.host :global(.ag-root-wrapper),
	.host :global(.ag-root) {
		width: 100%;
		min-width: 0;
	}

	.host :global(.ag-root-wrapper) {
		border: 0;
		border-radius: 0;
		background: transparent;
		overflow: hidden;
	}

	.host :global(.ag-body-viewport),
	.host :global(.ag-center-cols-viewport),
	.host :global(.ag-header-viewport) {
		background: transparent;
	}
</style>
