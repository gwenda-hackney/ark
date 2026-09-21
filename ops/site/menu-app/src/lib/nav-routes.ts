import type { NavRoute } from "../shell/types";

/**
 * Side rail. Stock is bar stock (menu items + inventory). Menu is the guest
 * menu: sections now, a visual website layout later.
 */
export const NAV_ROUTES: NavRoute[] = [
	{ id: "home", path: "/", name: "Dashboard", icon: "home" },
	{
		id: "stock",
		name: "Stock",
		icon: "stock",
		children: [
			{ id: "recipes", path: "/menu", name: "Menu items", icon: "recipes" },
			{ id: "inventory", path: "/inventory", name: "Inventory", icon: "inventory" },
			{ id: "suppliers", path: "/suppliers", name: "Suppliers", icon: "suppliers" },
			{ id: "lightspeed", path: "/lightspeed", name: "Lightspeed", icon: "lightspeed" },
		],
	},
	{
		id: "menu",
		name: "Menu",
		icon: "menu",
		children: [
			{ id: "sections", path: "/sections", name: "Sections", icon: "list" },
		],
	},
	{ id: "web", path: "/web", name: "Web", icon: "web" },
	{ id: "users", path: "/users", name: "Users", icon: "users" },
	{ id: "config", path: "/config", name: "Configuration", icon: "settings" },
];
