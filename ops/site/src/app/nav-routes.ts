import type { NavRoute } from "./shell/types";
import type { SegmentedItem } from "../ui/types";
import { pageTabs } from "./nav-tree";

/**
 * Side rail (#312): one level, grouped by the job. What's on is everything
 * on at Gwenda: the Schedule (every night in one calendar), then Events,
 * Pop-ups and Deals, each its own list of one kind, and Artists. Bar &
 * kitchen is the menus, their items and the stock behind them. Publish is
 * what goes out: the website, the weekly email and the venue's own photos
 * (event photos stay on each event's Images tab). Settings is the rest.
 *
 * A page with tabs lists them here, each with its own address: old
 * addresses (/suppliers, /forms, /lightspeed/export) are those tabs.
 */
export const NAV_ROUTES: NavRoute[] = [
	{ id: "home", path: "/", name: "Dashboard", icon: "home" },
	{
		id: "whats-on",
		name: "What's on",
		icon: "",
		heading: true,
		children: [
			{ id: "schedule", path: "/events/schedule", name: "Schedule", icon: "calendar", hint: "Every night in one calendar" },
			{ id: "events", path: "/events", name: "Events", icon: "star", hint: "Gigs, residencies, one-off nights" },
			{ id: "popups", path: "/popups", name: "Pop-ups", icon: "recipes", hint: "Guest kitchens, their menus and nights" },
			{ id: "deals", path: "/deals", name: "Deals", icon: "tag", hint: "Happy Hour and the like" },
			{
				id: "artists",
				path: "/forms",
				name: "Artists",
				icon: "artist",
				hint: "Who applied to play",
				// Featured artist is off for now (spa-path.js OFF_PAGES, #313): its
				// tab stays, greyed out, and /artists lands on Applications.
				tabs: [
					{ id: "applications", label: "Applications", path: "/forms" },
					{ id: "featured", label: "Featured artist", path: "/artists" },
				],
			},
		],
	},
	{
		id: "bar-kitchen",
		name: "Bar & kitchen",
		icon: "",
		heading: true,
		children: [
			{ id: "menus", path: "/menus", name: "Menus", icon: "list", hint: "Drinks and pop-up menus, their dates and sections" },
			{ id: "recipes", path: "/menu", name: "Items", icon: "menu", hint: "Every drink and dish" },
			{
				id: "stock",
				path: "/inventory",
				name: "Stock",
				icon: "stock",
				hint: "Bottles, what they cost, and who we buy from",
				tabs: [
					{ id: "inventory", label: "Inventory", path: "/inventory" },
					{ id: "suppliers", label: "Suppliers", path: "/suppliers" },
				],
			},
		],
	},
	{
		id: "publish",
		name: "Publish",
		icon: "",
		heading: true,
		children: [
			{ id: "web", path: "/web", name: "Website", icon: "web", badge: "website", hint: "What's waiting to go live" },
			{ id: "email", path: "/email", name: "Weekly email", short: "Email", icon: "send", hint: "This week's what's on email" },
			{ id: "photos", path: "/venue/gallery", name: "Photos", icon: "camera", hint: "The venue's own photos, on the website" },
		],
	},
	{
		id: "settings",
		name: "Settings",
		icon: "",
		heading: true,
		children: [
			{ id: "venue", path: "/venue", name: "Venue", icon: "clock", hint: "Opening hours and parties, on the website" },
			{ id: "users", path: "/users", name: "Users", icon: "users", hint: "Who may sign in" },
			{
				id: "lightspeed",
				path: "/lightspeed",
				name: "Lightspeed",
				icon: "lightspeed",
				hint: "Match the till's items, and export ours",
				tabs: [
					{ id: "reconcile", label: "Reconcile", path: "/lightspeed" },
					{ id: "export", label: "Export", path: "/lightspeed/export" },
				],
			},
			{ id: "config", path: "/config", name: "Configuration", icon: "settings", hint: "Pour targets, event tasks" },
			{
				id: "dev-tools",
				path: "/web/dev",
				name: "Developer tools",
				icon: "code",
				hint: "Compare test and live",
				adminOnly: true,
			},
		],
	},
];

/** A rail page's tabs, for its header: `PageHeader tabs={{ items: navTabs("stock"), value }}`. */
export function navTabs(id: string): SegmentedItem[] {
	return pageTabs(NAV_ROUTES, id);
}
