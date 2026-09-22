import type { NavRoute } from "../shell/types";

/**
 * Side rail. Menu is the guest menu. Stock is inventory and suppliers.
 * Lightspeed is POS reconcile and export.
 */
export const NAV_ROUTES: NavRoute[] = [
	{ id: "home", path: "/", name: "Dashboard", icon: "home" },
	{
		id: "menu",
		name: "Menu",
		icon: "menu",
		children: [
			{ id: "recipes", path: "/menu", name: "Menu items", icon: "recipes" },
			{ id: "sections", path: "/sections", name: "Sections", icon: "list" },
		],
	},
	{
		id: "stock",
		name: "Stock",
		icon: "stock",
		children: [
			{ id: "inventory", path: "/inventory", name: "Inventory", icon: "inventory" },
			{ id: "suppliers", path: "/suppliers", name: "Suppliers", icon: "suppliers" },
		],
	},
	{
		id: "lightspeed",
		name: "Lightspeed",
		icon: "lightspeed",
		children: [
			{ id: "lightspeed-reconcile", path: "/lightspeed", name: "Reconcile", icon: "lightspeed" },
			{ id: "lightspeed-export", path: "/lightspeed/export", name: "Export", icon: "upload" },
		],
	},
	{ id: "events", path: "/events", name: "Events", icon: "events" },
	{ id: "web", path: "/web", name: "Web", icon: "web" },
	{ id: "users", path: "/users", name: "Users", icon: "users" },
	{ id: "config", path: "/config", name: "Configuration", icon: "settings" },
];
