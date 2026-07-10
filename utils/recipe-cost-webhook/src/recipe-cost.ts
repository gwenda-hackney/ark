import { getTask, setCustomFieldValue } from "./clickup";
import {
  getStockTaskIds,
  syncIngredientLineCost,
} from "./ingredient-lines";
import { computeSuggestedPrice } from "./suggested-price";
import type { Env } from "./types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function recalculateRecipeCostFromTask(
  apiKey: string,
  changedTaskId: string,
  env: Env,
): Promise<{
  recipeId: string;
  ingredientCount: number;
  totalCost: number;
  stockItemsTouched: number;
  targetCost?: number;
}> {
  const changedTask = await getTask(apiKey, changedTaskId, true);
  const recipeId =
    typeof changedTask.parent === "string" && changedTask.parent.length > 0
      ? changedTask.parent
      : changedTaskId;

  const recipeTask = await getTask(apiKey, recipeId, true);
  const ingredients = recipeTask.subtasks ?? [];

  let totalCost = 0;
  const stockItemIds = new Set<string>();

  for (const ingredient of ingredients) {
    const linkedStockIds = getStockTaskIds(ingredient, env.INGREDIENT_STOCK_FIELD_ID);
    const stockTask =
      linkedStockIds.length > 0
        ? await getTask(apiKey, linkedStockIds[0])
        : undefined;

    totalCost += await syncIngredientLineCost(apiKey, ingredient, env, stockTask);

    for (const stockId of linkedStockIds) {
      stockItemIds.add(stockId);
    }
  }

  totalCost = round2(totalCost);

  if (env.RECIPE_COST_FIELD_ID) {
    await setCustomFieldValue(apiKey, recipeId, env.RECIPE_COST_FIELD_ID, totalCost);
  }

  let targetCost: number | undefined;
  let suggestedPrice: number | undefined;
  if (env.TARGET_POUR_COST_FIELD_ID && env.TARGET_COST_FIELD_ID) {
    const targetPourField = (recipeTask.custom_fields ?? []).find(
      (field) => field.id === env.TARGET_POUR_COST_FIELD_ID || field.name === "Target Pour Cost",
    );
    const targetPourCost = asNumber(targetPourField?.value);
    if (targetPourCost !== null && targetPourCost > 0) {
      targetCost = round2(totalCost / targetPourCost);
      await setCustomFieldValue(apiKey, recipeId, env.TARGET_COST_FIELD_ID, targetCost);

      suggestedPrice = computeSuggestedPrice(totalCost, targetCost, targetPourCost);
      if (env.SUGGESTED_PRICE_FIELD_ID) {
        await setCustomFieldValue(apiKey, recipeId, env.SUGGESTED_PRICE_FIELD_ID, suggestedPrice);
      }
    }
  }

  if (env.STOCK_MENU_ITEMS_FIELD_ID) {
    for (const stockTaskId of stockItemIds) {
      await setCustomFieldValue(apiKey, stockTaskId, env.STOCK_MENU_ITEMS_FIELD_ID, {
        add: [recipeId],
        rem: [],
      });
    }
  }

  return {
    recipeId,
    ingredientCount: ingredients.length,
    totalCost,
    stockItemsTouched: stockItemIds.size,
    targetCost,
    suggestedPrice,
  };
}
