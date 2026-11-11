import type { NavRoute } from "./shell/types";

/**
 * Side rail. Menu items is the guest menu (its sections are in Configuration). Stock is inventory and suppliers.
 * Lightspeed is POS reconcile and export. Events is series and schedule.
 * Artists holds the artist whose work is hanging at Gwenda and play applications
 * (the website's play form). Website shows what is waiting to appear on the
 * public site. Weekly email is the what's on email to the mailing list.
 * Gallery is the venue's own photos on the website (event photos stay on each
 * event's Images tab). Developer tools (admins) compare preview, code and databases.
 */
export const NAV_ROUTES: NavRoute[] = [
	{ id: "home", path: "/", name: "Dashboard", icon: "home" },
	{
		id: "service",
		name: "Service",
		icon: "",
		heading: true,
		children: [
			{ id: "recipes", path: "/menu", name: "Menu items", icon: "menu", hint: "Drinks on the guest menu" },
			{
				id: "stock",
				name: "Stock",
				icon: "stock",
				children: [
					{ id: "inventory", path: "/inventory", name: "Inventory", icon: "inventory", hint: "Bottles and what they cost" },
					{ id: "suppliers", path: "/suppliers", name: "Suppliers", icon: "suppliers", hint: "Who we buy from" },
				],
			},
			{
				id: "lightspeed",
				name: "Lightspeed",
				icon: "lightspeed",
				children: [
					{ id: "lightspeed-reconcile", path: "/lightspeed", name: "Reconcile", icon: "lightspeed", hint: "Match a Lightspeed item list" },
					{ id: "lightspeed-export", path: "/lightspeed/export", name: "Export", icon: "upload", hint: "Item import for Lightspeed" },
				],
			},
		],
	},
	{
		id: "programme",
		name: "Programme",
		icon: "",
		heading: true,
		children: [
			{
				id: "events",
				name: "Events",
				icon: "events",
				children: [
					{ id: "events-series", path: "/events", name: "Series", icon: "list", hint: "Residencies and their defaults" },
					{ id: "events-schedule", path: "/events/schedule", name: "Schedule", icon: "events", hint: "Upcoming nights" },
				],
			},
			{
				id: "artists",
				name: "Artists",
				icon: "artist",
				children: [
					{ id: "artist", path: "/artists", name: "Featured artist", short: "Artist", icon: "artist", hint: "Work hanging at Gwenda" },
					{ id: "forms", path: "/forms", name: "Play applications", short: "Applications", icon: "forms", hint: "Artists who applied to play" },
				],
			},
			{ id: "web", path: "/web", name: "Website", icon: "web", badge: "website", hint: "See what's waiting and publish it" },
			{ id: "email", path: "/email", name: "Weekly email", short: "Email", icon: "send", hint: "This week's what's on email" },
		],
	},
	{
		id: "settings",
		name: "Settings",
		icon: "",
		heading: true,
		children: [
			{ id: "venue", path: "/venue", name: "Venue details", icon: "clock", hint: "Opening hours and parties, on the website" },
			{ id: "gallery", path: "/venue/gallery", name: "Gallery", icon: "camera", hint: "The venue's own photos, on the website" },
			{ id: "users", path: "/users", name: "Users", icon: "users", hint: "Who may sign in" },
			{ id: "config", path: "/config", name: "Configuration", icon: "settings", hint: "Menu sections, pour targets, event tasks" },
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
