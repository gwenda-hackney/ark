/**
 * One-time migration: populate Unit amount + Order quantity from the old Bottle size (ml) field.
 *
 * Migration rules:
 *   ml stock  → unit_amount = bottle_size_ml, order_qty = 1
 *   kg stock  → unit_amount = bottle_size_ml (pieces/kg), order_qty = 1
 *   pack stock → change unit to "each", order_qty = bottle_size_ml, unit_amount = unchanged
 *   no unit   → infer ml (all are spirits/liqueurs with bottle=700), then apply ml rule
 *
 * Items that already have unit_amount set are skipped.
 * Items with cost=0 are still migrated so the data model is complete.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLICKUP_API = "https://api.clickup.com/api/v2";
const STOCK_LIST_ID = "901219316533";

// Field IDs
const FIELD = {
  stockUnit: "3998a369-ac24-4dee-8802-3b4cc515ea65",
  bottleSizeMl: "2c8b8ed5-0dce-44f7-a7a3-3f54fc854e60",
  unitAmount: "344740a6-ae71-42a8-ba32-faafeabac2d2",
  orderQty: "68bedefd-8abf-447c-88e4-5de1da10b136",
};

// Stock unit option IDs
const UNIT_OPTION = {
  ml: "2d18c89c-1051-43c7-8b1f-fc4fdfd665c0",
  each: "7905f285-ef20-4175-bc52-d9644471bff1",
  kg: "18e09da8-acc0-47ac-83d8-c66fcb92167d",
};

function loadEnv(path: string): void {
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveDropdown(field: Record<string, unknown> | undefined): string | null {
  if (!field) return null;
  const opts = ((field.type_config as Record<string, unknown>)?.options ?? []) as Array<{ name: string; orderindex: number | string }>;
  const v = asNumber(field.value);
  if (v === null) return null;
  for (const o of opts) {
    if (asNumber(o.orderindex) === v) return o.name.toLowerCase();
  }
  return null;
}

async function setField(apiKey: string, taskId: string, fieldId: string, value: unknown): Promise<void> {
  const res = await fetch(`${CLICKUP_API}/task/${taskId}/field/${fieldId}`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Set field ${fieldId} on ${taskId} failed: ${body}`);
  }
}

async function fetchAllStockTasks(apiKey: string): Promise<Array<Record<string, unknown>>> {
  const tasks: Array<Record<string, unknown>> = [];
  for (let page = 0; ; page++) {
    const res = await fetch(
      `${CLICKUP_API}/list/${STOCK_LIST_ID}/task?archived=false&page=${page}&include_closed=true&subtasks=false`,
      { headers: { Authorization: apiKey } },
    );
    const data = await res.json() as { tasks?: Array<Record<string, unknown>> };
    const batch = data.tasks ?? [];
    tasks.push(...batch);
    if (batch.length < 100) break;
  }
  return tasks;
}

async function main(): Promise<void> {
  loadEnv(resolve("/workspace/.env"));
  const apiKey = process.env.CLICKUP_API_KEY ?? "";
  if (!apiKey) throw new Error("CLICKUP_API_KEY missing");

  console.log("Fetching stock items...");
  const tasks = await fetchAllStockTasks(apiKey);
  console.log(`Found ${tasks.length} stock items`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const task of tasks) {
    const id = task.id as string;
    const name = task.name as string;
    const fields = (task.custom_fields ?? []) as Array<Record<string, unknown>>;

    const getField = (fieldId: string, fieldName: string) =>
      fields.find((f) => f.id === fieldId || f.name === fieldName);

    const unitField = getField(FIELD.stockUnit, "Stock unit");
    const bottleField = getField(FIELD.bottleSizeMl, "Bottle size (ml)");
    const unitAmountField = getField(FIELD.unitAmount, "Unit amount");
    const orderQtyField = getField(FIELD.orderQty, "Order quantity");

    const stockUnit = resolveDropdown(unitField);
    const bottleSize = asNumber(bottleField?.value);
    const existingUnitAmount = asNumber(unitAmountField?.value);
    const existingOrderQty = asNumber(orderQtyField?.value);

    // Skip if both new fields already populated
    if (existingUnitAmount !== null && existingOrderQty !== null) {
      console.log(`  SKIP  ${name} (already migrated)`);
      skipped++;
      continue;
    }

    // Skip if no bottle size to migrate from
    if (bottleSize === null || bottleSize <= 0) {
      console.log(`  SKIP  ${name} (no bottle size, manual entry needed)`);
      skipped++;
      continue;
    }

    try {
      if (stockUnit === "pack") {
        // pack → each: order_qty = bottle_size (units per case/keg)
        await setField(apiKey, id, FIELD.stockUnit, UNIT_OPTION.each);
        await setField(apiKey, id, FIELD.orderQty, bottleSize);
        console.log(`  PACK→EACH  ${name}: order_qty=${bottleSize}`);
      } else if (stockUnit === null) {
        // no unit → infer ml (all are spirits/liqueurs)
        await setField(apiKey, id, FIELD.stockUnit, UNIT_OPTION.ml);
        await setField(apiKey, id, FIELD.unitAmount, bottleSize);
        await setField(apiKey, id, FIELD.orderQty, 1);
        console.log(`  NULL→ML  ${name}: unit_amount=${bottleSize}, order_qty=1`);
      } else {
        // ml or kg: unit_amount = bottle_size, order_qty = 1
        await setField(apiKey, id, FIELD.unitAmount, bottleSize);
        await setField(apiKey, id, FIELD.orderQty, 1);
        console.log(`  MIGRATE  ${name} (${stockUnit}): unit_amount=${bottleSize}, order_qty=1`);
      }
      migrated++;
    } catch (err) {
      console.error(`  ERROR  ${name}: ${err}`);
      errors++;
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
