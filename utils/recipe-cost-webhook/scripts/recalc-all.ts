import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recalculateRecipeCostFromTask } from "../src/recipe-cost";
import type { Env } from "../src/types";

function loadEnvFile(path: string): void {
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function buildEnv(): Env {
  return {
    CLICKUP_API_KEY: process.env.CLICKUP_API_KEY ?? "",
    CLICKUP_NOTES_FIELD_ID: process.env.CLICKUP_NOTES_FIELD_ID,
    RECIPE_COST_FIELD_ID: process.env.RECIPE_COST_FIELD_ID,
    TARGET_POUR_COST_FIELD_ID: process.env.TARGET_POUR_COST_FIELD_ID,
    TARGET_COST_FIELD_ID: process.env.TARGET_COST_FIELD_ID,
    SUGGESTED_PRICE_FIELD_ID: process.env.SUGGESTED_PRICE_FIELD_ID,
    INGREDIENT_COST_FIELD_ID: process.env.INGREDIENT_COST_FIELD_ID,
    INGREDIENT_LINE_TOTAL_FIELD_ID: process.env.INGREDIENT_LINE_TOTAL_FIELD_ID,
    INGREDIENT_LINE_EXT_COST_FIELD_ID: process.env.INGREDIENT_LINE_EXT_COST_FIELD_ID,
    INGREDIENT_QTY_FIELD_ID: process.env.INGREDIENT_QTY_FIELD_ID,
    INGREDIENT_UNIT_FIELD_ID: process.env.INGREDIENT_UNIT_FIELD_ID,
    INGREDIENT_UNIT_COST_FIELD_ID: process.env.INGREDIENT_UNIT_COST_FIELD_ID,
    INGREDIENT_STOCK_FIELD_ID: process.env.INGREDIENT_STOCK_FIELD_ID,
    STOCK_MENU_ITEMS_FIELD_ID: process.env.STOCK_MENU_ITEMS_FIELD_ID,
    STOCK_COST_FIELD_ID: process.env.STOCK_COST_FIELD_ID,
    STOCK_UNIT_AMOUNT_FIELD_ID: process.env.STOCK_UNIT_AMOUNT_FIELD_ID,
    STOCK_ORDER_QTY_FIELD_ID: process.env.STOCK_ORDER_QTY_FIELD_ID,
    STOCK_UNIT_FIELD_ID: process.env.STOCK_UNIT_FIELD_ID,
    STOCK_INITIAL_QTY_FIELD_ID: process.env.STOCK_INITIAL_QTY_FIELD_ID,
    DASH_ML: process.env.DASH_ML,
    BAR_SPOON_ML: process.env.BAR_SPOON_ML,
    CL_ML: process.env.CL_ML,
  };
}

async function main(): Promise<void> {
  loadEnvFile(resolve("/workspace/.env"));
  const env = buildEnv();
  if (!env.CLICKUP_API_KEY) {
    throw new Error("CLICKUP_API_KEY is missing");
  }

  const listId = "901219335128";
  const response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true&subtasks=false`,
    { headers: { Authorization: env.CLICKUP_API_KEY } },
  );
  const data = (await response.json()) as { tasks?: Array<{ id?: string; name?: string; parent?: string | null }> };
  const recipes = (data.tasks ?? []).filter((task) => !task.parent);

  console.log(`Recalculating ${recipes.length} recipes...`);
  for (const [index, recipe] of recipes.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")).entries()) {
    if (!recipe.id) {
      continue;
    }
    const result = await recalculateRecipeCostFromTask(env.CLICKUP_API_KEY, recipe.id, env);
    console.log(
      `[${index + 1}/${recipes.length}] ${recipe.name}: cost=${result.totalCost} target=${result.targetCost ?? "-"} suggested=£${result.suggestedPrice ?? "-"}`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
