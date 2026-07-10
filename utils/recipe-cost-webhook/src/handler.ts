import { setTaskNotes } from "./clickup";
import { extractTaskId, isAutomationPayload } from "./payload";
import { recalculateRecipeCostFromTask } from "./recipe-cost";
import type { ClickUpWebhookPayload, Env, HandlerResult } from "./types";

export const SMOKE_TEST_PREFIX = "[gwenda:recipe-cost]";

type NotesWriter = (
  apiKey: string,
  taskId: string,
  notes: string,
  notesFieldId?: string,
) => Promise<void>;

type CostRecalculator = (
  apiKey: string,
  changedTaskId: string,
  env: Env,
) => Promise<{
  recipeId: string;
  ingredientCount: number;
  totalCost: number;
  stockItemsTouched: number;
  targetCost?: number;
}>;

export function isSelfTriggeredUpdate(
  payload: ClickUpWebhookPayload,
  env: Env,
): boolean {
  const items = payload.history_items ?? [];
  const managedFieldIds = new Set(
    [
      env.CLICKUP_NOTES_FIELD_ID,
      env.RECIPE_COST_FIELD_ID,
      env.TARGET_COST_FIELD_ID,
      env.INGREDIENT_LINE_EXT_COST_FIELD_ID,
      env.STOCK_MENU_ITEMS_FIELD_ID,
    ].filter((entry): entry is string => Boolean(entry)),
  );

  return items.some((item) => {
    if (managedFieldIds.size > 0) {
      return (
        item.field === "custom_field" &&
        typeof item.custom_field?.id === "string" &&
        managedFieldIds.has(item.custom_field.id)
      );
    }

    return item.field === "content";
  });
}

export function buildSmokeTestNote(
  payload: ClickUpWebhookPayload,
  now: Date = new Date(),
): string {
  const event = payload.event ?? (isAutomationPayload(payload) ? "automation" : "unknown");
  const source = payload.webhook_id ?? payload.auto_id ?? "n/a";
  return `${SMOKE_TEST_PREFIX} Webhook connected at ${now.toISOString()} (event: ${event}, source: ${source}).`;
}

export async function handleWebhook(
  payload: ClickUpWebhookPayload,
  env: Env,
  writeNotes: NotesWriter = setTaskNotes,
  recalculate: CostRecalculator = recalculateRecipeCostFromTask,
): Promise<HandlerResult> {
  if (payload.challenge) {
    return { status: 200, body: { challenge: payload.challenge } };
  }

  const taskId = extractTaskId(payload);
  if (!taskId) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "connectivity_test",
        message: "Webhook reachable; no task id in payload",
      },
    };
  }

  if (!env.CLICKUP_API_KEY) {
    return { status: 500, body: { error: "CLICKUP_API_KEY is not configured" } };
  }

  if (isSelfTriggeredUpdate(payload, env)) {
    return {
      status: 200,
      body: { ok: true, skipped: true, reason: "self-triggered update" },
    };
  }

  const result = await recalculate(env.CLICKUP_API_KEY, taskId, env);
  const note = `${buildSmokeTestNote(payload)} Recipe ${result.recipeId}: ${result.ingredientCount} ingredients, total cost ${result.totalCost}, stock links touched ${result.stockItemsTouched}.`;
  await writeNotes(
    env.CLICKUP_API_KEY,
    result.recipeId,
    note,
    env.CLICKUP_NOTES_FIELD_ID,
  );

  return {
    status: 200,
    body: {
      ok: true,
      task_id: taskId,
      recipe_id: result.recipeId,
      ingredient_count: result.ingredientCount,
      total_cost: result.totalCost,
      target_cost: result.targetCost ?? null,
      stock_items_touched: result.stockItemsTouched,
      event: payload.event ?? null,
      wrote: env.CLICKUP_NOTES_FIELD_ID ? "custom_field" : "markdown_description",
    },
  };
}
