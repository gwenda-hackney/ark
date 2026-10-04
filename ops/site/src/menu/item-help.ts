import type { PageHelpTopic } from "../ui/types";

/**
 * Help drawer for the menu item editor. Only for what isn't obvious from the
 * label. A field's "?" opens one topic by its title (`help="Recipe"`).
 */
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
		body: "What goes in, picked from stock. The drink's cost, ABV and volume are worked out from these lines, so keep amounts right. Add ingredient searches stock: Enter picks the top match. A line's ABV comes from its stock item; change it on Inventory.",
	},
	{
		title: "Serve",
		body: "The stock this is poured from and how much goes in a serve. Its cost and the till both follow from it.",
	},
	{
		title: "Method and glassware",
		body: "How the bar makes it. Glassware and the method (shake, stir, build) also tell Analysis how much water ends up in the glass.",
	},
	{
		title: "ABV and Volume",
		body: "The strength and size printed beside the drink. For a cocktail they come from the recipe. Type over them if the menu should say something different. The refresh button works them out from the recipe again.",
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
