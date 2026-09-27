import type { PageHelpTopic } from "../ui/types";

export const RECONCILE_HELP: PageHelpTopic[] = [
	{
		title: "Two pages",
		body: "Reconcile and Export are separate pages under Lightspeed in the side nav.",
	},
	{
		title: "Import item list",
		body: "Back Office: Menu, Item list, Export. Match is SKU, then name, then button name. The page shows the last stamped status until you import a new file.",
	},
	{
		title: "Stamp SKUs",
		body: "Writes matched Lightspeed SKUs, names, and POS screens onto ops drinks and stock. Close names count as a match. Name mismatches keep the ops name unless you choose Use POS name. You can change screens on the drink after that.",
	},
	{
		title: "Lightspeed only",
		body: "In the item list, not on the ops menu. Add, match, or archive.",
	},
	{
		title: "Stock",
		body: "Kegs and garnishes. Lightspeed needs them as items so a pour can decrement inventory. Add to inventory, or archive if we no longer hold them. Unused stock that is not a recipe line and not sold is archived automatically.",
	},
	{
		title: "System",
		body: "Modifier groups, extra shot, service charge. Service charge is not archived. The rest can be archived after Fall 2026 is live if you no longer need the button.",
	},
	{
		title: "Name mismatch",
		body: "Same SKU, different name. Stamp SKUs keeps the ops wording.",
	},
	{
		title: "Ops only",
		body: "On the ops menu, not in this file. Match a Lightspeed row, or download item import.",
	},
	{
		title: "Matched",
		body: "Ops drinks found in the file. Pint and half are one ops drink and two Lightspeed SKUs.",
	},
	{
		title: "Archive",
		body: "SKU list for Back Office bulk archive after the new menu is live. Import does not archive by itself.",
	},
	{
		title: "Download item import",
		body: "Creates Lightspeed library rows for ops drinks missing from the file. Official New items import sheet. File import (new), then Map identical column names. Skip empty optional columns.",
	},
	{
		title: "Download archive SKUs",
		body: "Use in Back Office bulk archive when you are ready.",
	},
];

export const EXPORT_HELP: PageHelpTopic[] = [
	{
		title: "CSV preview",
		body: "The grid is one Lightspeed File import: menu drinks plus inventory stock that is not already a same-named drink. Drinks with an alt price become two buttons (single + double). Every draught beer also gets a half-pint button (Alt price, or half the pint). Button names use the drink POS name when set (e.g. Baladin IPA (Half)). Stock-only bottles still export separately. Missing SKUs get G0001, G0002, … on download.",
	},
	{
		title: "Menu filter",
		body: "Narrow drinks to one POS menu (Fall 2026, Gwenda, …), all menus, or unassigned. Stock always stays in the list. Menu/Screen paths use the filtered menu when one is selected.",
	},
	{
		title: "Select",
		body: "Select all, or tick individual rows. Download writes exactly what you see for the selection.",
	},
	{
		title: "Download",
		body: "Back Office: Menu, Item list, Import, File import (new). Click Map identical column names. Skip empty optional columns. SKU, Type, and Accounting group must stay mapped. Price is the Back Office label (docs and exports often say Default price). Sharing mode is Local / Shared / Global (we send LOCAL). Docket name is the kitchen or bar ticket label; blank means use the item Name.",
	},
];

export const MENUS_HELP: PageHelpTopic[] = [
	{
		title: "Name",
		body: "The Lightspeed menu name drinks can be assigned to. Fall 2026 is the default for new drinks. Name it as it appears in Back Office.",
	},
	{
		title: "Default for new drinks",
		body: "New menu items get this assignment until you change it.",
	},
	{
		title: "Menus list",
		body: "A drink can sit on more than one menu. That is how leftover Baladin stays on Gwenda until it is sold through.",
	},
];
