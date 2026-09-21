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

export type InventoryKind =
  | "liquor"
  | "liqueur"
  | "wine"
  | "beer"
  | "syrup"
  | "juice"
  | "bitter"
  | "mixer"
  | "garnish"
  | "other";

export const INVENTORY_KINDS: { value: InventoryKind; label: string }[] = [
  { value: "liquor", label: "Liquor" },
  { value: "liqueur", label: "Liqueur" },
  { value: "wine", label: "Wine" },
  { value: "beer", label: "Beer" },
  { value: "syrup", label: "Syrup" },
  { value: "juice", label: "Juice" },
  { value: "bitter", label: "Bitter" },
  { value: "mixer", label: "Mixer" },
  { value: "garnish", label: "Garnish" },
  { value: "other", label: "Other" },
];

export type InventorySupplier = {
  _id?: string;
  supplierId?: string;
  name: string;
  /** Product page on that supplier's site, when we have one. */
  productUrl?: string;
  /** Wholesaler product code, e.g. SPA47010. */
  sku?: string;
  /** Order unit from the price list: BOTTLE, CASE24, KEG30L. */
  pack?: string;
  /** Trade price in GBP for one pack. */
  price?: number;
};

/** Wholesaler row in the Suppliers table. */
export type CatalogSupplier = {
  _id?: string;
  id?: string;
  name: string;
  website?: string;
  notes?: string;
  /** Inventory links using this supplier. */
  itemCount?: number;
};

export type InventoryItem = {
  _id?: string;
  id?: string;
  /** Short bar name, e.g. St-Germain. */
  name?: string;
  /** Product name on the bottle, e.g. St-Germain elderflower liqueur. */
  fullName?: string;
  kind?: InventoryKind;
  abv?: string;
  defaultUnit?: string;
  /**
   * Stand-in pack cost in GBP when no supplier price exists.
   * Volume kinds: typical bottle or litre. Count kinds: one piece.
   */
  estimatedCost?: number;
  /** One row per supplier. Product URL lives on the junction, not the catalog. */
  suppliers?: InventorySupplier[];
  notes?: string;
  active?: boolean;
  /** POS item SKU in Lightspeed K-Series. Not the wholesaler code. */
  lightspeedSku?: string;
  /** On-hand quantity from a Lightspeed count, or a manual correction. */
  actualQty?: number;
  actualUnit?: string;
  /** ISO timestamp of the last count (Lightspeed apply or a qty edit). */
  countedAt?: string;
};

export type LightspeedStatus = "matched" | "mismatch" | "missing";

export type LightspeedCsvRow = {
  key?: string;
  sku?: string;
  name?: string;
  quantity?: number | null;
  unit?: string;
  type?: string;
  accountingGroup?: string;
  defaultPrice?: number | null;
  menuScreen?: string;
  statisticsGroup?: string;
  buttonName?: string;
  suggestedDrinkType?: DrinkType;
  suggestedPrice?: string;
};

export type LightspeedOpsRow = {
  id?: string;
  name?: string;
  drinkType?: DrinkType;
  price?: string;
  lightspeedSku?: string;
  lightspeedName?: string;
  lightspeedStatus?: LightspeedStatus;
  section?: {
    title?: string;
    parentTitle?: string;
  };
};

export type LightspeedMatchRow = {
  via: string;
  ops: LightspeedOpsRow;
  lightspeed: LightspeedCsvRow;
};

export type LightspeedPreview = {
  ok?: boolean;
  applied?: boolean;
  menuName?: string;
  matched: LightspeedMatchRow[];
  conflicts: LightspeedMatchRow[];
  lightspeedOnly: LightspeedCsvRow[];
  archive: LightspeedCsvRow[];
  opsOnly: LightspeedOpsRow[];
  itemImportCsv?: string;
  menuLayoutCsv?: string;
  archiveSkuCsv?: string;
};

export function lightspeedStatusLabel(
  status: LightspeedStatus | string | undefined,
): string {
  if (status === "matched") return "Match";
  if (status === "mismatch") return "Name mismatch";
  if (status === "missing") return "Missing from POS";
  return "";
}

/** Who may sign in to ops (Baserow Users). */
export type OpsUser = {
  _id?: string;
  id?: string;
  email?: string;
  name?: string;
  active?: boolean;
};

export function parseGbp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[£,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatGbp(value: unknown): string {
  const n = parseGbp(value);
  if (n == null) return "";
  return `£${n.toFixed(2)}`;
}

export function skuFromProductUrl(url: string | undefined): string {
  const raw = String(url || "").trim();
  const match = raw.match(/\/P\/([A-Z0-9]+)\//i);
  return match ? match[1].toUpperCase() : "";
}

/** How the drink is served and configured in ops. */
export type DrinkType = "cocktail" | "pour" | "beer" | "packaged";

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

export type PublishTarget = "staging" | "production";

export type PublishStatus =
  | "excluded"
  | "missing"
  | "unknown"
  | "unpublished"
  | "published";

export type PublishDiff = {
  field: string;
  from?: string;
  to?: string;
};

export type TargetPublishState = {
  status: PublishStatus;
  changed?: string[];
  diff?: PublishDiff[];
};

export type ItemPublishState = {
  staging?: TargetPublishState;
  production?: TargetPublishState;
};

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
  ];

/** Where a drink appears for guests. POS can still sell it either way. */
export type GuestMenuPlacement = "both" | "print" | "digital" | "none";

export const GUEST_MENU_PLACEMENTS: {
  value: GuestMenuPlacement;
  label: string;
  blurb: string;
}[] = [
  { value: "both", label: "Both", blurb: "Print menu and website." },
  { value: "print", label: "Print", blurb: "Print menu only." },
  { value: "digital", label: "Digital", blurb: "Website only." },
  { value: "none", label: "Neither", blurb: "POS only. Not on print or the website." },
];

export function guestMenuPlacement(item?: {
  onPrintMenu?: boolean;
  onDigitalMenu?: boolean;
}): GuestMenuPlacement {
  const print = item?.onPrintMenu !== false;
  const digital = item?.onDigitalMenu !== false;
  if (print && digital) return "both";
  if (print) return "print";
  if (digital) return "digital";
  return "none";
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
  if (placement === "none") return "Neither";
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
  /** Name on the last Lightspeed item export. */
  lightspeedName?: string;
  /** Last reconcile against the POS item list. */
  lightspeedStatus?: LightspeedStatus;
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

const PUBLISH_FIELD_LABELS: Record<string, string> = {
  name: "name",
  description: "description",
  price: "price",
  priceAlt: "alt price",
  notes: "tasting note",
  drinkType: "kind",
  abv: "ABV",
  volume: "volume",
  producer: "producer",
  sectionId: "section",
  onDigitalMenu: "visibility",
  photo: "photo",
};

export function publishFieldLabel(field: string): string {
  return PUBLISH_FIELD_LABELS[field] || field;
}

export function formatChangedFields(changed?: string[]): string {
  return (changed || []).map(publishFieldLabel).join(", ");
}

export function formatDiffValue(value?: string): string {
  const text = String(value || "").trim();
  return text || "blank";
}

export function formatPublishDiff(diff: PublishDiff): string {
  if (diff.field === "photo") return "photo updated";
  return `${formatDiffValue(diff.from)} to ${formatDiffValue(diff.to)}`;
}

/** True when this drink has unpublished field changes or is not on the site yet. */
export function targetNeedsSync(state: TargetPublishState | undefined): boolean {
  return state?.status === "unpublished" || state?.status === "missing";
}

export function publishNeedsSync(publish?: ItemPublishState): boolean {
  return targetNeedsSync(publish?.staging) || targetNeedsSync(publish?.production);
}

/** True when the live website is missing this drink or is behind ops. */
export function publishNotLive(publish?: ItemPublishState): boolean {
  return targetNeedsSync(publish?.production);
}

export function publishChangeCount(publish?: ItemPublishState): number {
  return new Set([
    ...(publish?.staging?.changed || []),
    ...(publish?.production?.changed || []),
  ]).size;
}

export function publishPendingCount(
  items: MenuItem[],
  target?: PublishTarget,
): number {
  return items.filter((item) => {
    if (target) return targetNeedsSync(item.publish?.[target]);
    return publishNeedsSync(item.publish);
  }).length;
}

export function publishTargetPhrase(
  state: TargetPublishState | undefined,
): string {
  switch (state?.status) {
    case "published":
      return "up to date";
    case "unpublished": {
      const fields = formatChangedFields(state.changed);
      return fields ? `unpublished (${fields})` : "unpublished changes";
    }
    case "unknown":
      return "no recorded snapshot yet";
    case "missing":
      return "not on the website yet";
    case "excluded":
      return "not on the digital menu";
    default:
      return "no recorded snapshot yet";
  }
}

export function publishHint(publish?: ItemPublishState): string {
  return `Preview site: ${publishTargetPhrase(publish?.staging)}. Live website: ${publishTargetPhrase(publish?.production)}.`;
}

export function publishSyncLabel(publish?: ItemPublishState): string {
  if (!publishNeedsSync(publish)) return "Up to date";
  const count = publishChangeCount(publish);
  if (count === 1) return "1 unpublished change";
  if (count > 1) return `${count} unpublished changes`;
  return "Needs a website update";
}

export function publishLiveLabel(publish?: ItemPublishState): string {
  const live = publish?.production;
  if (!targetNeedsSync(live)) return "Live on the website";
  if (live?.status === "missing") return "Not on the live website";
  const fields = formatChangedFields(live?.changed);
  return fields
    ? `Not live · ${fields}`
    : "Not live · unpublished changes";
}

export type PublishGroupItem = {
  name: string;
  changed?: string[];
  diff?: PublishDiff[];
};

export type PublishGroups = {
  unpublished: PublishGroupItem[];
  missing: PublishGroupItem[];
  unknown: PublishGroupItem[];
  published: PublishGroupItem[];
  excluded: PublishGroupItem[];
};

export function groupItemsForPublish(
  items: MenuItem[],
  target: PublishTarget,
): PublishGroups {
  const groups: PublishGroups = {
    unpublished: [],
    missing: [],
    unknown: [],
    published: [],
    excluded: [],
  };
  for (const item of items) {
    const name = item.name?.trim() || "Untitled";
    const state = item.publish?.[target];
    const status = state?.status || "unknown";
    if (status === "unpublished") {
      groups.unpublished.push({
        name,
        changed: state?.changed,
        diff: state?.diff,
      });
    } else if (status === "missing") {
      groups.missing.push({ name });
    } else if (status === "unknown") {
      groups.unknown.push({ name });
    } else if (status === "published") {
      groups.published.push({ name });
    } else if (status === "excluded") {
      groups.excluded.push({ name });
    } else {
      groups.unknown.push({ name });
    }
  }
  return groups;
}

export function normalizeDrinkType(value: unknown): DrinkType {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "pour" || raw === "beer" || raw === "packaged") return raw;
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

/** UK pint. Half pint is half of this via `altCostFactor`. */
export const UK_PINT_ML = 568;

/** Standard single spirit / wine pour. Double is 2× via `altCostFactor`. */
export const SINGLE_POUR_ML = 25;

/** Primary serve quantity used to cost a draught pint or a neat pour. */
export function defaultServeQuantity(
  type: DrinkType | undefined,
): { quantity: number; unit: "ml" } | null {
  switch (normalizeDrinkType(type)) {
    case "beer":
      return { quantity: UK_PINT_ML, unit: "ml" };
    case "pour":
      return { quantity: SINGLE_POUR_ML, unit: "ml" };
    default:
      return null;
  }
}

export function priceLabels(type: DrinkType | undefined): {
  primary: string;
  alt?: string;
} {
  switch (normalizeDrinkType(type)) {
    case "pour":
      return { primary: "Single", alt: "Double" };
    case "beer":
      return { primary: "Pint", alt: "Half pint" };
    case "packaged":
      return { primary: "Price" };
    case "cocktail":
    default:
      return { primary: "Single", alt: "Double" };
  }
}

/** Guest / grid display: £14 · £18 or £7. */
export function formatPrices(item: {
  drinkType?: DrinkType;
  price?: string;
  priceAlt?: string;
}): string {
  const labels = priceLabels(item.drinkType);
  const primary = item.price?.trim();
  const alt = item.priceAlt?.trim();
  if (primary && alt && labels.alt) {
    return `£${primary} / £${alt}`;
  }
  if (primary) return `£${primary}`;
  if (alt) return `£${alt}`;
  return "";
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
