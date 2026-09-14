import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recalculateRecipeCostFromTask } from "../src/recipe-cost";
import { parseTaskId } from "../src/task-id";
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
  const env: Env = {
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

  if (!env.CLICKUP_API_KEY) {
    throw new Error("CLICKUP_API_KEY is missing. Set it in /workspace/.env");
  }

  return env;
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npm run run:local -- <task-id-or-clickup-url>");
    console.error("Example: npm run run:local -- https://app.clickup.com/t/869e11qm3");
    process.exit(1);
  }

  loadEnvFile(resolve("/workspace/.env"));
  const taskId = parseTaskId(input);
  const env = buildEnv();

  console.log(`Running recipe cost recalculation for task ${taskId}...`);
  const result = await recalculateRecipeCostFromTask(env.CLICKUP_API_KEY, taskId, env);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
