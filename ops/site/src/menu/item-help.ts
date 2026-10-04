import type { PageHelpTopic } from "../ui/types";

/** Help drawer for the menu item editor. Only for what isn't obvious from the label. */
export const ITEM_HELP: PageHelpTopic[] = [
	{
		title: "Tabs",
		body: "Build is what the drink is and how to make it. Menu is where it shows up and what's printed beside it. Pricing is its prices and how they sit against the pour target. Analysis checks the numbers.",
	},
	{
		title: "Tasting note",
		body: "A few words shown under the drink's name, such as \"Floral fizz\". Keep it short.",
	},
	{
		title: "Category",
		body: "The style of cocktail: spritz, highball, sour and so on. It shows in the Menu list and you can search by it. Leave it blank if none fits.",
	},
	{
		title: "Menu description",
		body: "The line printed under the drink on the menu: the ingredient list or a short blurb. From recipe fills it with the ingredients from Recipe, which you can then edit.",
	},
	{
		title: "Recipe",
		body: "What goes in, picked from stock. The drink's cost, ABV and volume are worked out from these lines, so keep amounts right.",
	},
	{
		title: "Method and glassware",
		body: "How the bar makes it. Glassware and the method (shake, stir, build) also tell Analysis how much water ends up in the glass.",
	},
	{
		id: "abv-volume",
		title: "ABV and Volume",
		body: "The strength and size printed beside the drink. For a cocktail they're worked out from the recipe and locked (a lock in the box), so they change when the recipe does. Override (the pen button) unlocks one so you can type what the menu should say; it then shows a pen and keeps your figure when the recipe changes. Use recipe value locks it again on the recipe's figure. Beers, wines and spirits have no recipe, so you type theirs.",
	},
	{
		title: "Where it appears",
		body: "Each row puts the drink on one menu: Print, Digital, or a POS (till) menu. Location is the chapter on a printed or digital menu, or the screen on the till. A drink can be on as many as you like. Guest menus need a POS row too, so the till can sell it.",
	},
	{
		title: "Name on it",
		body: "Print and digital menus always use the drink's name. The till can use a shorter name: set it once and every POS row uses it.",
	},
	{
		title: "Repeat",
		body: "Two rows put the drink in the same place. Save keeps one of them. Change the chapter or screen if you want both.",
	},
	{
		title: "Prices",
		body: "One row for each size it sells in, such as Single and Double, or 125 ml and Bottle. The first price is the main one. Till SKU links the row to its button on the till, so sales match up.",
	},
	{
		title: "Pour cost and the pour target",
		body: "Pour cost is what a drink costs to make as a share of its price. The pour target is the share the house aims for, set under Pour targets. When a price is blank, its box suggests the price that meets the target.",
	},
	{
		title: "The price bar",
		body: "Each price sits on a bar. Red: below cost or under the target, so it earns too little. Green: at or a little over the target. Amber: well over the target, so it may be too dear for guests.",
	},
	{
		title: "Analysis",
		body: "Issues lists anything missing or out of line. Overview shows the spec, strength, UK units, cost and pour cost.",
	},
	{
		title: "Balance",
		body: "How much of the drink is spirit, citrus and sweet, in ml. Handy for checking a sour or comparing two specs.",
	},
	{
		title: "House",
		body: "How this drink compares with the other house cocktails. A low Volume or ABV number means it's smaller or weaker than most; a high one means bigger or stronger. The list shows the closest drinks by size and strength.",
	},
	{
		title: "AI reading",
		body: "Press Analyse for a short note on the drink, separate from the numbers. It does not make up volumes or ABV. Edit the spec and it says the reading is out of date.",
	},
];

/** Short ? tips beside a field or section title. The drawer has the longer story. */
export const ITEM_TIPS = {
	tastingNote: "A few words shown under the drink's name.",
	category: "The style of cocktail. It shows in the Menu list and search.",
	description: "Printed under the drink on the menu. From recipe fills it with the ingredients.",
	recipe: "What goes in, from stock. Cost, ABV and volume follow from these lines.",
	serve: "The stock this is poured from, for cost and the till.",
	method: "Glassware and method also tell Analysis how much water ends up in the glass.",
	abv: "Worked out from the recipe and locked. Override to type your own; Use recipe value to go back.",
	placements: "Each row puts the drink on one menu. Location is the chapter, or the screen on the till.",
	tillName: "A shorter name for the till. Every POS row uses it.",
	menuName: "Print and digital menus use the drink's name.",
	prices: "One row per size. Pour is the cost to make it as a share of its price.",
	sku: "Links this price to its button on the till.",
	gauges: "Red is too cheap, green earns enough, amber may be too dear.",
	stockAbv: "From the stock item. Change it on Inventory.",
	ingredientSearch: "Search stock. Enter picks the top match.",
	overview: "Spec, strength, cost and pour cost at a glance.",
	balance: "Spirit, citrus and sweet in the drink, in ml.",
	house: "Where this drink sits among the house cocktails, by size and strength.",
	aiReading: "A short note on the drink, separate from the numbers. It won't make up volumes or ABV.",
} as const;
