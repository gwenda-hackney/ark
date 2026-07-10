/**
 * Stock purchase model and cost-per-UOM derivation.
 *
 * Three stock units:
 *   ml   – liquid goods (spirits, syrups, juices). Unit amount = ml per bottle/unit.
 *          Cost per ml = Cost ÷ (Order quantity × Unit amount)
 *          Recipe ingredient must use a volume unit: ml, cl, dash, barspoon.
 *
 *   each – packaged goods ordered by the piece (RTDs, cans).
 *          Unit amount = ml per can/bottle (informational only, not used for costing).
 *          Cost per item = Cost ÷ Order quantity
 *          Recipe ingredient must use a count unit: each, slice, top.
 *
 *   kg   – fresh produce. Unit amount = pieces per kg (e.g. 12 limes/kg, 8 lemons/kg).
 *          Cost per piece = Cost ÷ (Order quantity × Unit amount)
 *          Recipe ingredient must use a count unit: each, slice, top.
 */

import type { ClickUpCustomField, ClickUpTask, Env } from "./types";

export type StockUnit = "ml" | "each" | "kg";

export interface StockModel {
  stockUnit: StockUnit | null;
  cost: number | null;
  orderQty: number;
  unitAmount: number | null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function findField(
  task: ClickUpTask,
  fieldId?: string,
  fieldName?: string,
): ClickUpCustomField | undefined {
  const fields = task.custom_fields ?? [];
  if (fieldId) {
    const hit = fields.find((f) => f.id === fieldId);
    if (hit) return hit;
  }
  if (fieldName) {
    return fields.find((f) => f.name === fieldName);
  }
  return undefined;
}

function resolveDropdownOption(field: ClickUpCustomField | undefined): string | null {
  if (!field) return null;
  if (typeof field.value === "string") return field.value.toLowerCase();
  const idx = asNumber(field.value);
  if (idx === null) return null;
  for (const opt of field.type_config?.options ?? []) {
    if (asNumber(opt.orderindex) === idx && typeof opt.name === "string") {
      return opt.name.toLowerCase();
    }
  }
  return null;
}

export function readStockModel(task: ClickUpTask, env: Env): StockModel {
  const rawUnit = resolveDropdownOption(
    findField(task, env.STOCK_UNIT_FIELD_ID, "Stock unit"),
  );
  const stockUnit: StockUnit | null =
    rawUnit === "ml" || rawUnit === "each" || rawUnit === "kg" ? rawUnit : null;

  const cost = asNumber(findField(task, env.STOCK_COST_FIELD_ID, "Cost")?.value);

  const rawOrderQty = asNumber(
    findField(task, env.STOCK_ORDER_QTY_FIELD_ID, "Order quantity")?.value,
  );
  const orderQty = rawOrderQty !== null && rawOrderQty > 0 ? rawOrderQty : 1;

  const unitAmount = asNumber(
    findField(task, env.STOCK_UNIT_AMOUNT_FIELD_ID, "Unit amount")?.value,
  );

  return { stockUnit, cost, orderQty, unitAmount };
}

/**
 * Returns cost per base UOM:
 *   ml stock  → cost per ml
 *   each stock → cost per item
 *   kg stock  → cost per piece
 * Returns null when required fields are missing or cost is zero.
 */
export function costPerBaseUnit(model: StockModel): number | null {
  const { stockUnit, cost, orderQty, unitAmount } = model;
  if (cost === null || cost <= 0) return null;

  if (stockUnit === "ml" || stockUnit === "kg") {
    if (unitAmount === null || unitAmount <= 0) return null;
    return cost / (orderQty * unitAmount);
  }

  if (stockUnit === "each") {
    return cost / orderQty;
  }

  return null;
}
