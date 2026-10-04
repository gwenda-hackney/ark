import type { LightspeedStatus } from "../inventory/types";
import type { ItemPublishState } from "./publish";
import { SINGLE_POUR_ML, UK_PINT_ML, normalizePrices, priceLabels, type PriceRow } from "./prices.js";

export type Ingredient = {
  id?: number | string;
  quantity?: string | number | null;
  unit?: string;
  name?: string;
  note?: string;
  /** Ingredient alcohol by volume, e.g. "40" or "40%". */
  abv?: string;
  /** Shared inventory catalog row, when picked from stock. */
  inventoryId?: string;
};
/** Guest menu line from ingredient names (no quantities). */
export function flattenIngredientsForMenu(
	ingredients: Ingredient[] | undefined | null,
): string {
	if (!Array.isArray(ingredients)) return "";
	return ingredients
		.map((ing) => (typeof ing?.name === "string" ? ing.name.trim() : ""))
		.filter(Boolean)
		.join(", ");
}
export type PosMenu = {
  id: string;
  name: string;
  orderRank?: number;
  isDefault?: boolean;
};
export type PlacementChannel = "print" | "digital" | "pos";
export type MenuPlacement = {
  _id?: string;
  id?: string;
  channel: PlacementChannel;
  sectionId?: string | null;
  sectionTitle?: string;
  posMenuId?: string | null;
  posMenuName?: string;
  posScreen?: string;
  orderRank?: number;
};
export function posMenusLabel(menus?: PosMenu[] | null): string {
  const names = (menus || []).map((row) => String(row.name || "").trim()).filter(Boolean);
  if (!names.length) return "None";
  return names.join(" · ");
}
export function posMenuIdsOf(item?: { posMenus?: PosMenu[] | null } | null): string[] {
  return (item?.posMenus || []).map((row) => String(row.id)).filter(Boolean);
}
export function defaultPosMenus(menus?: PosMenu[] | null): PosMenu[] {
  const list = Array.isArray(menus) ? menus : [];
  const marked = list.filter((row) => row.isDefault);
  return marked.length ? marked : list.slice(0, 1);
}
/** How the drink is served and configured in ops. */
export type DrinkType = "cocktail" | "pour" | "beer" | "packaged" | "postmix";
/**
 * Cocktail build / family. Independent of menu section placement
 * (a signature under Our Formulas can still be a spritz).
 */
export type CocktailType =
	| "spritz"
	| "highball"
	| "sour"
	| "stirred"
	| "negroni"
	| "fizz"
	| "other";
export const COCKTAIL_TYPES: { value: CocktailType; label: string }[] = [
	{ value: "spritz", label: "Spritz" },
	{ value: "highball", label: "Highball" },
	{ value: "sour", label: "Sour" },
	{ value: "stirred", label: "Stirred" },
	{ value: "negroni", label: "Negroni" },
	{ value: "fizz", label: "Fizz" },
	{ value: "other", label: "Other" },
];
export function normalizeCocktailType(value: unknown): CocktailType | "" {
	const raw = String(value || "")
		.trim()
		.toLowerCase();
	if (!raw) return "";
	const found = COCKTAIL_TYPES.find((row) => row.value === raw);
	return found?.value || "";
}
export function cocktailTypeLabel(value: unknown): string {
	const normalized = normalizeCocktailType(value);
	if (!normalized) return "";
	return (
		COCKTAIL_TYPES.find((row) => row.value === normalized)?.label || normalized
	);
}
/** Infer cocktail type from a menu section slug when backfilling. */
export function cocktailTypeFromSectionSlug(slug: unknown): CocktailType | "" {
	const raw = String(slug || "")
		.trim()
		.toLowerCase();
	return normalizeCocktailType(raw);
}
export const DRINK_TYPES: { value: DrinkType; label: string; blurb: string }[] =
  [
    {
      value: "cocktail",
      label: "Cocktail",
      blurb: "Built or mixed drink with a recipe. Optional double price.",
    },
    {
      value: "pour",
      label: "Pour",
      blurb: "Spirit or wine poured neat. Optional double price.",
    },
    {
      value: "beer",
      label: "Beer",
      blurb: "Draught beer. Optional half-pint price.",
    },
    {
      value: "packaged",
      label: "Packaged",
      blurb: "Bottled or canned as sold. One unit price.",
    },
    {
      value: "postmix",
      label: "Postmix",
      blurb: "Bag-in-box soft drink. Pint and half-pint prices.",
    },
  ];
/** Guest channel chips. Print and/or Digital; neither = POS only. */
export type GuestMenuPlacement = "both" | "print" | "digital" | "none";
export const GUEST_MENU_CHANNELS: {
  value: "print" | "digital";
  label: string;
  blurb: string;
}[] = [
  { value: "print", label: "Print", blurb: "Print menu chapter." },
  { value: "digital", label: "Digital", blurb: "Website menu." },
];
export const GUEST_MENU_PLACEMENTS: {
  value: GuestMenuPlacement;
  label: string;
  blurb: string;
}[] = [
  { value: "both", label: "Both", blurb: "Print menu and website." },
  { value: "print", label: "Print", blurb: "Print menu only." },
  { value: "digital", label: "Digital", blurb: "Website only." },
  { value: "none", label: "POS only", blurb: "Till only. Not on print or the website." },
];
export function guestMenuPlacement(item?: {
  onPrintMenu?: boolean;
  onDigitalMenu?: boolean;
  placements?: MenuPlacement[];
}): GuestMenuPlacement {
  if (Array.isArray(item?.placements) && item.placements.length) {
    const print = item.placements.some((row) => row.channel === "print");
    const digital = item.placements.some((row) => row.channel === "digital");
    if (print && digital) return "both";
    if (print) return "print";
    if (digital) return "digital";
    return "none";
  }
  const print = item?.onPrintMenu !== false;
  const digital = item?.onDigitalMenu !== false;
  if (print && digital) return "both";
  if (print) return "print";
  if (digital) return "digital";
  return "none";
}
export function guestChannelsOf(item?: {
  onPrintMenu?: boolean;
  onDigitalMenu?: boolean;
  placements?: MenuPlacement[];
}): Array<"print" | "digital"> {
  const placement = guestMenuPlacement(item);
  if (placement === "both") return ["print", "digital"];
  if (placement === "print") return ["print"];
  if (placement === "digital") return ["digital"];
  return [];
}
export function guestMenuFlags(placement: GuestMenuPlacement): {
  onPrintMenu: boolean;
  onDigitalMenu: boolean;
} {
  if (placement === "print") return { onPrintMenu: true, onDigitalMenu: false };
  if (placement === "digital") return { onPrintMenu: false, onDigitalMenu: true };
  if (placement === "none") return { onPrintMenu: false, onDigitalMenu: false };
  return { onPrintMenu: true, onDigitalMenu: true };
}
export function guestMenuLabel(
  placement: GuestMenuPlacement | string | undefined,
): string {
  if (placement === "print") return "Print";
  if (placement === "digital") return "Digital";
  if (placement === "none") return "POS only";
  if (placement === "both") return "Both";
  return "";
}
export function asGuestMenuPlacement(value: string | undefined): GuestMenuPlacement {
  if (value === "print" || value === "digital" || value === "none" || value === "both") {
    return value;
  }
  return "both";
}
export function guestMenuBlurb(placement: GuestMenuPlacement | string | undefined): string {
  return (
    GUEST_MENU_PLACEMENTS.find((row) => row.value === placement)?.blurb || ""
  );
}
/**
 * Target pour cost as a percent of selling price, keyed by drink type.
 * Cocktail 20% is the usual mixed-drink target (18 to 24% industry band).
 */
export type PourTargetMap = Record<DrinkType, number>;
export const DEFAULT_POUR_TARGETS: PourTargetMap = {
  cocktail: 20,
  pour: 18,
  beer: 22,
  packaged: 25,
  postmix: 15,
};
export const POUR_TARGET_META: Record<
  DrinkType,
  { label: string; blurb: string }
> = {
  cocktail: {
    label: "Cocktail",
    blurb: "Industry standard for mixed drinks (usually 18 to 24%). Cost should be about a fifth of the menu price.",
  },
  pour: {
    label: "Pour",
    blurb: "Neat spirit or wine. Tighter than a mixed drink because the glass is mostly the bottle.",
  },
  beer: {
    label: "Beer",
    blurb: "Draught textbook target. UK pints often run higher because the pint price is market-capped.",
  },
  packaged: {
    label: "Packaged",
    blurb: "Bottle or can as sold. Higher than a cocktail because you are selling the whole unit.",
  },
  postmix: {
    label: "Postmix",
    blurb: "Bag-in-box soft drink. Target is usually lower than bottled softs.",
  },
};
export function clampPourTarget(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 80) return null;
  return Math.round(n * 10) / 10;
}
export function normalizePourTargets(
  value: Partial<PourTargetMap> | null | undefined,
): PourTargetMap {
  const next = { ...DEFAULT_POUR_TARGETS };
  for (const row of DRINK_TYPES) {
    const clamped = clampPourTarget(value?.[row.value]);
    if (clamped != null) next[row.value] = clamped;
  }
  return next;
}
export function pourTargetFor(
  type: DrinkType | undefined,
  map?: PourTargetMap | null,
): number {
  const targets = normalizePourTargets(map);
  return targets[normalizeDrinkType(type)];
}
export type MenuItem = {
  _id?: string;
  id?: string;
  name?: string;
  sectionId?: string;
  section?: {
    _id?: string;
    _ref?: string;
    title?: string;
    parentTitle?: string;
  };
  /** Primary price: single / pint / unit depending on drinkType. */
  price?: string;
  /** Second size: double (cocktail/pour) or half pint (beer). */
  priceAlt?: string;
  /**
   * Every price, main one first. `price` / `priceAlt` and the two SKUs are
   * kept in step with the first two rows (see prices.js).
   */
  prices?: PriceRow[];
  drinkType?: DrinkType;
  /** Cocktail build: spritz, highball, stirred, etc. Ops only. */
  cocktailType?: CocktailType | "";
  /** Guest-facing tasting note (e.g. Floral fizz). Not the cocktail category. */
  notes?: string;
  glassware?: string;
  ice?: string;
  garnish?: string;
  onDigitalMenu?: boolean;
  /** Guest print menu. Independent of the website. Default on. */
  onPrintMenu?: boolean;
  /** Per-channel locations (print / digital / POS). */
  placements?: MenuPlacement[];
	description?: string;
	method?: string;
  abv?: string;
  volume?: string;
  producer?: string;
  ingredients?: Ingredient[];
  /** Ops-only AI reading for this spec. Not published to the website. */
  analysisNote?: {
    summary?: string;
    concerns?: string[];
    questions?: string[];
    specKey?: string;
  } | null;
  image?: {
    alt?: string;
    asset?: { url?: string };
  };
  publish?: ItemPublishState;
  /** POS item SKU in Lightspeed K-Series. */
  lightspeedSku?: string;
  /** SKU for the alt serve button (double / half pint). */
  lightspeedSkuAlt?: string;
  /** Short till / button name in Lightspeed (e.g. Baladin IPA). Empty = use drink name. */
  lightspeedName?: string;
  /** POS Menu/Screen from Lightspeed, e.g. Gwenda/Spirits/Liqueurs & Amari. */
  lightspeedMenuScreen?: string;
  /** Last reconcile against the POS item list. */
  lightspeedStatus?: LightspeedStatus;
  /** Lightspeed menus this drink appears on. */
  posMenus?: PosMenu[];
};
export type MenuSection = {
  _id: string;
  id?: string;
  title: string;
  slug?: string;
  subtitle?: string;
  orderRank?: number;
  parentId?: string | null;
  parentTitle?: string;
  items?: MenuItem[];
  subsections?: MenuSection[];
};
export function normalizeDrinkType(value: unknown): DrinkType {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "pour" || raw === "beer" || raw === "packaged" || raw === "postmix") {
    return raw;
  }
  return "cocktail";
}
export function drinkTypeLabel(type: DrinkType | undefined): string {
  const found = DRINK_TYPES.find((row) => row.value === normalizeDrinkType(type));
  return found?.label || "Cocktail";
}
export function hasRecipe(type: DrinkType | undefined): boolean {
  return normalizeDrinkType(type) === "cocktail";
}
export function serveTabLabel(type: DrinkType | undefined): string {
  return hasRecipe(type) ? "Recipe" : "Serve";
}
export { UK_PINT_ML, SINGLE_POUR_ML };
/** Primary serve quantity used to cost a draught pint or a neat pour. */
export function defaultServeQuantity(
  type: DrinkType | undefined,
): { quantity: number; unit: "ml" } | null {
  switch (normalizeDrinkType(type)) {
    case "beer":
    case "postmix":
      return { quantity: UK_PINT_ML, unit: "ml" };
    case "pour":
      return { quantity: SINGLE_POUR_ML, unit: "ml" };
    default:
      return null;
  }
}
export { priceLabels };
export type { PriceRow };
/** Guest / grid display: £14 / £18, £7, or every size for more. */
export function formatPrices(item: Parameters<typeof normalizePrices>[0]): string {
  return normalizePrices(item)
    .map((row) => row.price)
    .filter(Boolean)
    .map((price) => `£${price}`)
    .join(" / ");
}
export const UNITS = [
  "ml",
  "cl",
  "dash",
  "barspoon",
  "drop",
  "splash",
  "each",
  "slice",
  "wedge",
  "sprig",
  "top",
  "pinch",
  "tsp",
  "tbsp",
] as const;
export const GLASSWARE = [
  "",
  "Coupe",
  "Nick & Nora",
  "Martini",
  "Rocks",
  "Highball",
  "Collins",
  "Flute",
  "Wine",
  "Mug",
  "Julep",
  "Hurricane",
] as const;
export const ICE_OPTIONS = ["", "Cubed", "Crushed", "Block", "None"] as const;
