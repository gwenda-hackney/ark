export const UNIT_ORDER_TO_NAME: Record<number, string> = {
  0: "ml",
  1: "cl",
  2: "dash",
  3: "barspoon",
  4: "each",
  5: "slice",
  6: "top",
};

export interface UnitConversionConfig {
  dashMl?: number;
  barspoonMl?: number;
  clMl?: number;
}

const DEFAULTS: Required<UnitConversionConfig> = {
  dashMl: 1.75,
  barspoonMl: 5,
  clMl: 10,
};

/** Units measured in volume — compatible with ml stock. */
export function isVolumeUnit(unit: string | null): boolean {
  return unit === "ml" || unit === "cl" || unit === "dash" || unit === "barspoon";
}

/** Units measured as discrete pieces — compatible with each/kg stock. */
export function isCountUnit(unit: string | null): boolean {
  return unit === "each" || unit === "slice" || unit === "top";
}

export function resolveUnitName(value: unknown): string | null {
  if (typeof value === "number" && value in UNIT_ORDER_TO_NAME) {
    return UNIT_ORDER_TO_NAME[value];
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (Object.values(UNIT_ORDER_TO_NAME).includes(normalized)) {
      return normalized;
    }
  }
  return null;
}

export function quantityInMl(
  qty: number,
  unit: string | null,
  config: UnitConversionConfig = {},
): number | null {
  const { dashMl, barspoonMl, clMl } = { ...DEFAULTS, ...config };
  switch (unit) {
    case "ml":
      return qty;
    case "cl":
      return qty * clMl;
    case "dash":
      return qty * dashMl;
    case "barspoon":
      return qty * barspoonMl;
    default:
      return null;
  }
}

/**
 * Compute the extended line cost for one ingredient.
 *
 * unitCost is always expressed in the stock's base UOM:
 *   ml stock  → unitCost is cost per ml; qty is converted to ml first
 *   each/kg   → unitCost is cost per item/piece; qty is used directly
 */
export function computeExtendedLineCost(
  qty: number | null,
  unit: string | null,
  unitCost: number | null,
  config: UnitConversionConfig = {},
): number {
  if (qty === null || unitCost === null) return 0;

  if (isCountUnit(unit)) {
    return Math.round(qty * unitCost * 100) / 100;
  }

  const volumeMl = quantityInMl(qty, unit, config);
  if (volumeMl !== null) {
    return Math.round(volumeMl * unitCost * 100) / 100;
  }

  return 0;
}
