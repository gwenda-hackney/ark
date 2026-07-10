import { setCustomFieldValue } from "./clickup";
import { costPerBaseUnit, readStockModel } from "./stock-pricing";
import type { ClickUpCustomField, ClickUpTask, Env } from "./types";
import {
  computeExtendedLineCost,
  isCountUnit,
  isVolumeUnit,
  resolveUnitName,
  type UnitConversionConfig,
} from "./units";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
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
  if (fieldName) return fields.find((f) => f.name === fieldName);
  return undefined;
}

function collectTaskIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "id" in entry) {
          const id = (entry as { id?: unknown }).id;
          return typeof id === "string" ? id : undefined;
        }
        return undefined;
      })
      .filter((e): e is string => Boolean(e));
  }
  if (typeof value === "string") return [value];
  return [];
}

export function getStockTaskIds(
  ingredient: ClickUpTask,
  ingredientStockFieldId?: string,
): string[] {
  const ids = new Set<string>();
  if (ingredientStockFieldId) {
    const field = (ingredient.custom_fields ?? []).find(
      (c) => c.id === ingredientStockFieldId,
    );
    for (const id of collectTaskIds(field?.value)) ids.add(id);
  }
  for (const link of ingredient.linked_tasks ?? []) {
    if (typeof link.task_id === "string" && link.task_id) ids.add(link.task_id);
    if (typeof link.link_id === "string" && link.link_id) ids.add(link.link_id);
  }
  return [...ids];
}

/**
 * Resolves the cost per base UOM to apply when costing this ingredient line.
 *
 * Returns the cost per ml for ml stock, cost per item for each/kg stock.
 * Returns null if the ingredient's recipe unit is incompatible with the stock unit,
 * or if the stock item lacks sufficient pricing data.
 */
export function resolveStockUnitCost(
  stockTask: ClickUpTask,
  recipeUnit: string | null,
  env: Env,
): number | null {
  const model = readStockModel(stockTask, env);
  const base = costPerBaseUnit(model);
  if (base === null) return null;

  if (model.stockUnit === "ml" && isVolumeUnit(recipeUnit)) return base;
  if ((model.stockUnit === "each" || model.stockUnit === "kg") && isCountUnit(recipeUnit)) return base;
  return null;
}

function unitConversionConfig(env: Env): UnitConversionConfig {
  return {
    dashMl: env.DASH_ML ? Number(env.DASH_ML) : undefined,
    barspoonMl: env.BAR_SPOON_ML ? Number(env.BAR_SPOON_ML) : undefined,
    clMl: env.CL_ML ? Number(env.CL_ML) : undefined,
  };
}

export function computeIngredientExtendedLineCost(
  ingredient: ClickUpTask,
  stockUnitCost: number | null,
  env: Env,
): number {
  const qty = asNumber(findField(ingredient, env.INGREDIENT_QTY_FIELD_ID, "Qty")?.value);
  const unit = resolveUnitName(
    findField(ingredient, env.INGREDIENT_UNIT_FIELD_ID, "Unit")?.value,
  );
  return computeExtendedLineCost(qty, unit, stockUnitCost, unitConversionConfig(env));
}

export async function syncIngredientLineCost(
  apiKey: string,
  ingredient: ClickUpTask,
  env: Env,
  stockTask?: ClickUpTask,
): Promise<number> {
  const unit = resolveUnitName(
    findField(ingredient, env.INGREDIENT_UNIT_FIELD_ID, "Unit")?.value,
  );
  const stockUnitCost = stockTask
    ? resolveStockUnitCost(stockTask, unit, env)
    : null;

  const extCost = computeIngredientExtendedLineCost(ingredient, stockUnitCost, env);
  const ingredientId = ingredient.id;
  if (!ingredientId) return extCost;

  // Write display fields — failures are logged but don't abort the recipe total calculation.
  const tryWrite = async (fieldId: string | undefined, value: number): Promise<void> => {
    if (!fieldId) return;
    try {
      await setCustomFieldValue(apiKey, ingredientId, fieldId, value);
    } catch {
      // Field may not exist on all ingredient tasks; the recipe total is unaffected.
    }
  };

  if (stockUnitCost !== null) await tryWrite(env.INGREDIENT_UNIT_COST_FIELD_ID, stockUnitCost);
  await tryWrite(env.INGREDIENT_LINE_EXT_COST_FIELD_ID, extCost);
  await tryWrite(env.INGREDIENT_COST_FIELD_ID, extCost);
  await tryWrite(env.INGREDIENT_LINE_TOTAL_FIELD_ID, extCost);

  return extCost;
}
