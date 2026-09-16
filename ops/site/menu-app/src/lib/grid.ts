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
 */
export const opsGridTheme = themeQuartz.withParams({
	accentColor: "var(--primary)",
	backgroundColor: "var(--background)",
	borderColor: "var(--border)",
	browserColorScheme: "inherit",
	cellTextColor: "var(--foreground)",
	dataBackgroundColor: "var(--background)",
	fontFamily: "var(--font)",
	fontSize: 13,
	foregroundColor: "var(--foreground)",

	headerBackgroundColor: "var(--background)",
	headerFontSize: 11,
	headerFontWeight: 600,
	headerTextColor: "var(--muted-foreground)",

	oddRowBackgroundColor: "transparent",
	rowBorder: { style: "solid", width: 1, color: "var(--border)" },
	rowHoverColor: "var(--accent)",
	selectedRowBackgroundColor: "var(--primary-wash)",

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
