import { isEditorPath, parseShellPath } from "../../../functions/_lib/spa-path.js";

export type MobileTabId = "home" | "stock" | "more";

export type MobileTab = {
	id: MobileTabId;
	label: string;
	icon: string;
	/** Fallback href when the tab is a real destination. */
	path: string;
};

export const MOBILE_TABS: MobileTab[] = [
	{ id: "home", label: "Home", icon: "home", path: "/" },
	{ id: "stock", label: "Stock", icon: "stock", path: "/menu" },
	{ id: "more", label: "More", icon: "more", path: "/config" },
];

const STOCK_PATH_KEY = "ops.stock-path";

export type ToolId = "breakeven" | "cashflow" | "stock";

export const TOOL_FRAMES: Record<
	ToolId,
	{ src: string; title: string; label: string; hint: string }
> = {
	breakeven: {
		src: "/breakeven/",
		title: "Break-even",
		label: "Break-even",
		hint: "Monthly and daily targets",
	},
	cashflow: {
		src: "/cashflow/",
		title: "Cashflow",
		label: "Cashflow",
		hint: "Till, stock cost, and cash",
	},
	stock: {
		src: "/stock/",
		title: "Wholesale stock",
		label: "Wholesale stock",
		hint: "Drive-synced price list",
	},
};

export function isToolId(value: string | null | undefined): value is ToolId {
	return value === "breakeven" || value === "cashflow" || value === "stock";
}

export function toolFrameFor(path: string): (typeof TOOL_FRAMES)[ToolId] {
	const route = parseShellPath(path);
	const id = isToolId(route.tool) ? route.tool : "breakeven";
	return TOOL_FRAMES[id];
}

export function mobileTabFor(path: string): MobileTabId {
	const page = parseShellPath(path).page;
	if (page === "menu" || page === "inventory" || page === "lightspeed" || page === "suppliers")
		return "stock";
	if (
		page === "config" ||
		page === "sections" ||
		page === "users" ||
		page === "web" ||
		page === "tools"
	)
		return "more";
	return "home";
}

export function isStockListPath(path: string): boolean {
	const route = parseShellPath(path);
	return (
		(route.page === "menu" || route.page === "inventory") &&
		!route.isNew &&
		!route.slug
	);
}

export function stockSwitchValue(path: string): "menu" | "inventory" {
	return parseShellPath(path).page === "inventory" ? "inventory" : "menu";
}

export function hideShellChrome(path: string): boolean {
	return isEditorPath(path);
}

export function readStockPath(): string {
	try {
		const value = localStorage.getItem(STOCK_PATH_KEY);
		if (value === "/inventory" || value === "/menu") return value;
	} catch {
		/* ignore */
	}
	return "/menu";
}

export function rememberStockPath(path: string): void {
	const page = parseShellPath(path).page;
	if (page !== "menu" && page !== "inventory") return;
	const stored = page === "inventory" ? "/inventory" : "/menu";
	try {
		localStorage.setItem(STOCK_PATH_KEY, stored);
	} catch {
		/* ignore */
	}
}

export function tabHref(id: MobileTabId): string {
	if (id === "stock") return readStockPath();
	if (id === "more") return "/config";
	return "/";
}
