import type { PageHelpTopic } from "../ui/types";

/** Help on a menu's page (MenuEditor): its Help button opens these. */
export const MENU_PAGE_HELP: PageHelpTopic[] = [
	{
		title: "Saving",
		body: "Nothing on this page is written until you press Save menu: item changes, new items, items taken off, sections renamed, added, moved or removed, and the Details. The bar at the bottom says Unsaved changes until then. Leaving the menu with changes asks whether to discard them. Once saved, it goes on the website by itself within about 10 minutes; Update website does it straight away.",
	},
	{
		title: "Update website",
		body: "A saved menu goes on gwenda.co.uk by itself: within about 10 minutes of the last change, once edits have been quiet. Update website, at the top, does it straight away; the menu page shows it in about 2 minutes. Beside it: Goes on the website by itself (in a few minutes), Updating the website, On the website, or Not on the website yet when saves are set to wait for Update website. Save the menu first: it can't be pressed with unsaved changes.",
	},
	{
		title: "What the marks mean",
		body: "A dot beside a name: changed. New: added. Struck through: comes off when you save; Undo keeps it. A section moving to another menu says where it goes.",
	},
	{
		title: "Items",
		body: "Hover an item and press its pencil to change its name, price or line, then Done. Only its first price changes here; All details opens its full page. Add item, under a section, adds one.",
	},
	{
		title: "Taking an item off",
		body: "The bin, or Take off this menu in its dialog, asks first. An item on another menu stays there; one on no other menu is deleted, with its recipe, when you save.",
	},
	{
		title: "Sections and groups",
		body: "Click a section's name or line to change it. Drag it by its handle, or use Move up and Move down in its ⋯, to change the order. The ⋯ also adds a line, adds a group, moves a section to another menu or removes it.",
	},
	{
		title: "Details",
		body: "The menu's name, drinks or food, when it runs and on which days, and the pop-up kitchen it belongs to. Saved with Save menu, with everything else.",
	},
];
