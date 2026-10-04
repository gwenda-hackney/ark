import type { DrinkType } from "../menu/types";

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
  role?: "sellable" | "stock" | "system";
  packageContent?: string | number;
};
export type LightspeedOpsRow = {
  id?: string;
  name?: string;
  drinkType?: DrinkType;
  price?: string;
  lightspeedSku?: string;
  lightspeedName?: string;
  lightspeedMenuScreen?: string;
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
  altServes?: LightspeedMatchRow[];
  lightspeedOnly: LightspeedCsvRow[];
  stockMatched?: LightspeedMatchRow[];
  stockOnly?: LightspeedCsvRow[];
  stockOpsOnly?: LightspeedOpsRow[];
  systemOnly?: LightspeedCsvRow[];
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
  if (status === "missing") return "Not in POS";
  return "";
}
export function skuFromProductUrl(url: string | undefined): string {
  const raw = String(url || "").trim();
  const match = raw.match(/\/P\/([A-Z0-9]+)\//i);
  return match ? match[1].toUpperCase() : "";
}
