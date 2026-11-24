import type { NavRoute } from "./shell/types";
import type { SegmentedItem } from "../ui/types";
import { pageTabs } from "./nav-tree";
import { FEATURED_ARTIST_CLOSED } from "../artists/featured-artist.js";

/**
 * Side rail (#312): one level, grouped by the job. What's on is everything
 * on at Gwenda and how it's marketed: the Schedule (every night in one
 * calendar), then Events, Pop-ups, Deals and Occasions, each its own list of
 * one kind, Artists, the weekly email and the venue's own photos (event
 * photos stay on each event's Images tab). Bar & kitchen is the menus, their
 * items and the stock behind them. Publish is the website: what's waiting to
 * go live. Settings is the rest.
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
			{ id: "occasions", path: "/occasions", name: "Occasions", icon: "events", hint: "Christmas parties and the like, on home" },
			{
				id: "artists",
				path: "/forms",
				name: "Artists",
				icon: "artist",
				hint: "Who applied to play, and past featured artists",
				// Applications first (#313): the website shows no featured artist
				// any more, so its tab is for looking up past ones.
				tabs: [
					{ id: "applications", label: "Applications", path: "/forms" },
					{
						id: "featured",
						label: "Featured artist",
						path: "/artists",
						...(FEATURED_ARTIST_CLOSED ? { badge: { label: "Off", tone: "warning", title: FEATURED_ARTIST_CLOSED } } : {}),
					},
				],
			},
			{
				id: "email",
				path: "/email",
				name: "Email",
				short: "Email",
				icon: "send",
				hint: "The monthly what's on, and emails you write",
				tabs: [
					{ id: "emails", label: "Emails", path: "/email" },
					{ id: "sent", label: "Sent", path: "/email/sent" },
					{ id: "people", label: "People", path: "/email/people" },
				],
			},
			{ id: "photos", path: "/venue/gallery", name: "Photos", icon: "camera", hint: "The venue's own photos, on the website" },
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
		],
	},
	{
		id: "settings",
		name: "Settings",
		icon: "",
		heading: true,
		children: [
			{ id: "venue", path: "/venue", name: "Venue", icon: "clock", hint: "Opening hours and parties, on the website" },
			{
				id: "users",
				path: "/users",
				name: "Users",
				icon: "users",
				hint: "Who may sign in, and what they can do",
				tabs: [
					{ id: "people", label: "People", path: "/users" },
					{ id: "roles", label: "Roles", path: "/users/roles" },
				],
			},
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
