import {
	AllCommunityModule,
	type ICellRendererComp,
	type ICellRendererParams,
	ModuleRegistry,
	themeQuartz,
} from "ag-grid-community";
import { type Component, mount, unmount } from "svelte";

ModuleRegistry.registerModules([AllCommunityModule]);

/** True when the user is selecting cell text (drag or a selected word). */
export function hasRangeSelection(): boolean {
	if (typeof window === "undefined") return false;
	const sel = window.getSelection();
	return Boolean(sel && sel.type === "Range" && sel.toString().trim());
}

export {
	keepFullWidthGroupsTogether,
	type FullWidthGroupRow,
} from "./grid-groups";

/**
 * One AG Grid theme for ops — colours are CSS variables so Gwenda tokens apply.
 * Headers: 11px uppercase muted on surface-1. Hover and selected rows use
 * surface-3; DataGrid adds the gold edge on a selected row and the group-row
 * fill, and sets the row height from its `density`.
 */
export const opsGridTheme = themeQuartz.withParams({
	accentColor: "var(--primary)",
	// Rows are see-through; DataGrid paints the surface behind them: the page's
	// glow on a full-page grid, nothing in a card (--grid-bg: transparent).
	backgroundColor: "transparent",
	borderColor: "var(--border)",
	browserColorScheme: "inherit",
	cellTextColor: "var(--foreground)",
	dataBackgroundColor: "transparent",
	fontFamily: "var(--font)",
	// --text-sm. AG Grid needs a pixel number here, not a CSS variable.
	fontSize: 13,
	foregroundColor: "var(--foreground)",

	headerBackgroundColor: "var(--grid-head-bg, var(--panel-bg))",
	menuBackgroundColor: "var(--popover)",
	// --text-2xs
	headerFontSize: 11,
	headerFontWeight: 600,
	headerTextColor: "var(--muted-foreground)",

	oddRowBackgroundColor: "transparent",
	rowBorder: { style: "solid", width: 1, color: "var(--border)" },
	rowHoverColor: "var(--surface-3)",
	selectedRowBackgroundColor: "var(--surface-3)",

	spacing: 8,

	wrapperBorder: false,
	wrapperBorderRadius: 0,
});

/** Mount a Svelte component as an AG Grid cell renderer. */
export function svelteCell(
	component: object,
	toProps: (params: ICellRendererParams) => Record<string, unknown>,
): new () => ICellRendererComp {
	return class SvelteCellRenderer implements ICellRendererComp {
		private readonly gui = document.createElement("span");
		private instance: object | undefined;

		public constructor() {
			this.gui.style.display = "contents";
		}

		public init(params: ICellRendererParams): void {
			this.render(params);
		}

		public refresh(params: ICellRendererParams): boolean {
			this.render(params);
			return true;
		}

		public destroy(): void {
			this.clear();
		}

		public getGui(): HTMLElement {
			return this.gui;
		}

		private render(params: ICellRendererParams): void {
			this.clear();
			this.instance = mount(component as Component<Record<string, unknown>>, {
				target: this.gui,
				props: toProps(params),
			});
		}

		private clear(): void {
			if (!this.instance) return;
			void unmount(this.instance);
			this.instance = undefined;
		}
	};
}

/**
 * The column a RowAction sits in: just wide enough for the circle, no cell
 * padding, centred. Spread it into a column def and add the cellRenderer.
 */
export const ROW_ACTION_COLUMN = {
	headerName: "",
	width: 48,
	minWidth: 48,
	maxWidth: 48,
	flex: 0,
	sortable: false,
	filter: false,
	editable: false,
	resizable: false,
	suppressMovable: true,
	cellClass: "row-action-cell",
} as const;
