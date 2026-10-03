<script lang="ts" generics="T">
	/**
	 * Trading-shaped AG Grid host: theme via CSS vars, dense rows.
	 * Columns keep `flex` so they fill the viewport on grow and shrink;
	 * `fitGridWidth` would bake pixel widths and never expand again.
	 *
	 * `density` sets the row height (40 or 32px) and stamps `data-density`
	 * on the host, so cell renderers can tighten with it. Pages that size
	 * their own rows (`getRowHeight`) read their density at call time; this
	 * component resets row heights when it changes.
	 */
	import { untrack } from "svelte";
	import {
		createGrid,
		type ColDef,
		type GridApi,
		type GridOptions,
	} from "ag-grid-community";
	import { hasRangeSelection, opsGridTheme } from "./grid";
	import {
		readGridViewportScroll,
		recalledGridScroll,
		rememberGridScroll,
		scrollGridViewport,
	} from "./grid-scroll";
	import { HEADER_HEIGHT, rowHeightFor, type Density } from "./view-prefs";

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
		return withNumericAlignment(lockPixelCols(defs));
	}

	/** Right-align headers and cells for `type: "num"` (and explicit num classes). */
	function withNumericAlignment<T>(defs: ColDef<T>[]): ColDef<T>[] {
		return defs.map((def) => {
			if (!isNumericCol(def)) return def;
			let next: ColDef<T> = { ...def };

			const header = next.headerClass;
			if (typeof header === "string" && header.split(/\s+/).includes(NUMERIC_HEADER)) {
				/* already set */
			} else if (Array.isArray(header) && header.includes(NUMERIC_HEADER)) {
				/* already set */
			} else if (!header) {
				next = { ...next, headerClass: NUMERIC_HEADER };
			} else if (typeof header === "string") {
				next = { ...next, headerClass: `${header} ${NUMERIC_HEADER}` };
			} else if (Array.isArray(header)) {
				next = { ...next, headerClass: [...header, NUMERIC_HEADER] };
			} else {
				next = {
					...next,
					headerClass: (params) => {
						const result = header(params);
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
			}

			const cell = next.cellClass;
			if (typeof cell === "function") {
				const prior = cell;
				next = {
					...next,
					cellClass: (params) => {
						const result = prior(params);
						const classes = Array.isArray(result)
							? result.join(" ")
							: String(result || "");
						if (/(^|\s)(num|ag-right-aligned-cell)(\s|$)/.test(classes)) {
							return result;
						}
						const extra = "num ag-right-aligned-cell";
						if (!result) return extra;
						if (Array.isArray(result)) return [...result, "num", "ag-right-aligned-cell"];
						return `${classes} ${extra}`;
					},
				};
			} else if (typeof cell === "string") {
				if (!/(^|\s)(num|ag-right-aligned-cell)(\s|$)/.test(cell)) {
					next = { ...next, cellClass: `${cell} num ag-right-aligned-cell` };
				}
			} else if (Array.isArray(cell)) {
				const joined = cell.filter((c) => typeof c === "string").join(" ");
				if (!/(^|\s)(num|ag-right-aligned-cell)(\s|$)/.test(joined)) {
					next = { ...next, cellClass: [...cell, "num", "ag-right-aligned-cell"] };
				}
			} else if (!cell) {
				next = { ...next, cellClass: "num ag-right-aligned-cell" };
			}

			return next;
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
		hideHeader = false,
		density = "comfortable",
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
		/**
		 * Drop the header row. For phone lists that are down to one column,
		 * where a lone "NIGHT" heading says nothing the rows do not.
		 */
		hideHeader?: boolean;
		density?: Density;
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
			headerHeight: untrack(() => (hideHeader ? 0 : HEADER_HEIGHT[density])),
			rowHeight: untrack(() => rowHeightFor(density)),
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
		if (!grid) return;
		grid.setGridOption("headerHeight", hideHeader ? 0 : HEADER_HEIGHT[density]);
	});
	let appliedDensity: Density | undefined;
	$effect(() => {
		const grid = api;
		const el = host;
		const next = density;
		if (!grid || !el) return;
		if (appliedDensity === undefined || appliedDensity === next) {
			appliedDensity = next;
			return;
		}
		appliedDensity = next;
		withPreservedScroll(el, () => {
			if (!untrack(() => gridOptions).rowHeight) {
				grid.setGridOption("rowHeight", rowHeightFor(next));
			}
			grid.resetRowHeights();
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

<div
	class="host {className}"
	class:auto={domLayout === "autoHeight"}
	data-density={density}
	bind:this={host}
></div>

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
		letter-spacing: var(--tracking-label);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.host :global(.ag-header-cell-resize)::after {
		display: none;
	}

	.host :global(.ag-header) {
		border-bottom: 1px solid var(--border);
	}

	/*
	  One focus ring for the table. AG Grid paints its own cell-focus border;
	  global :focus-visible also rings links/buttons inside cells. Keep a single
	  inset ring on the focused cell and silence everything nested.
	*/
	.host :global(.ag-header-cell:focus),
	.host :global(.ag-header-cell:focus-visible),
	.host :global(.ag-header-group-cell:focus),
	.host :global(.ag-header-group-cell:focus-visible),
	.host :global(.ag-cell:focus:not(.ag-cell-inline-editing)),
	.host :global(.ag-cell:focus-visible:not(.ag-cell-inline-editing)),
	.host :global(.ag-cell :focus),
	.host :global(.ag-cell :focus-visible) {
		outline: none !important;
		outline-offset: 0;
		box-shadow: none !important;
	}

	.host :global(.ag-cell.ag-cell-focus:not(.ag-cell-inline-editing)),
	.host :global(.ag-cell:focus-within:not(.ag-cell-inline-editing)) {
		border-color: transparent !important;
		outline: 1px solid var(--ring);
		outline-offset: -4px;
		box-shadow: none !important;
	}

	.host :global(.ag-cell.ag-cell-focus.ag-cell-inline-editing),
	.host :global(.ag-cell:focus-within.ag-cell-inline-editing) {
		outline: none !important;
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
	.host :global(.ag-cell.num .ag-cell-wrapper),
	.host :global(.ag-right-aligned-cell .ag-cell-value),
	.host :global(.ag-cell.num .ag-cell-value) {
		justify-content: flex-end;
		width: 100%;
		text-align: right;
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
	.host :global(.ag-cell.num .ag-cell-inline-editing input),
	.host :global(.ag-right-aligned-cell .ag-cell-editor input),
	.host :global(.ag-cell.num .ag-cell-editor input) {
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
		box-shadow: inset 0 0 0 1px var(--ring) !important;
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

	/* Selected: a quiet fill and a 2px gold edge, so it reads without shouting. */
	.host :global(.ag-row.row-selected),
	.host :global(.ag-row.ag-row-selected) {
		background-color: var(--surface-3) !important;
		box-shadow: inset 2px 0 0 var(--primary);
	}

	/* Group rows (sections, weeks): one step up from the rows they head. */
	.host :global(.ag-full-width-row),
	.host :global(.ag-row.row-group) {
		background-color: var(--surface-2) !important;
		border-bottom: 1px solid var(--border);
	}

	.host :global(.ag-full-width-row.ag-row-hover) {
		background-color: var(--surface-2) !important;
	}

	.host[data-density="compact"] :global(.ag-cell) {
		font-size: var(--text-sm);
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

	/*
	  Touch screens: AG Grid lays an invisible scrollbar strip over the right
	  edge. Painted, it hid the end of every row border and read as a blank
	  gutter on phones.
	*/
	.host :global(.ag-scrollbar-invisible),
	.host :global(.ag-scrollbar-invisible .ag-body-vertical-scroll-viewport),
	.host :global(.ag-scrollbar-invisible .ag-body-horizontal-scroll-viewport) {
		background: transparent;
	}

	.host :global(.ag-body-vertical-scroll.ag-scrollbar-invisible) {
		pointer-events: none;
	}
</style>
