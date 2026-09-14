import { describe, expect, it } from "vitest";
import {
  computeIngredientExtendedLineCost,
  resolveStockUnitCost,
} from "../src/ingredient-lines";
import { costPerBaseUnit, readStockModel } from "../src/stock-pricing";
import type { ClickUpTask, Env } from "../src/types";

const env: Env = {
  CLICKUP_API_KEY: "pk_test",
  INGREDIENT_QTY_FIELD_ID: "qty",
  INGREDIENT_UNIT_FIELD_ID: "unit",
  INGREDIENT_UNIT_COST_FIELD_ID: "unit-cost",
  STOCK_COST_FIELD_ID: "stock-cost",
  STOCK_UNIT_AMOUNT_FIELD_ID: "stock-unit-amount",
  STOCK_ORDER_QTY_FIELD_ID: "stock-order-qty",
  STOCK_UNIT_FIELD_ID: "stock-unit",
  DASH_ML: "1.75",
  BAR_SPOON_ML: "5",
  CL_ML: "10",
};

function mlStock(cost: number, unitAmountMl: number, orderQty = 1): ClickUpTask {
  return {
    custom_fields: [
      { id: "stock-cost", name: "Cost", value: cost },
      { id: "stock-unit-amount", name: "Unit amount", value: unitAmountMl },
      { id: "stock-order-qty", name: "Order quantity", value: orderQty },
      {
        id: "stock-unit",
        name: "Stock unit",
        value: 0,
        type_config: { options: [{ name: "ml", orderindex: 0 }] },
      },
    ],
  };
}

function eachStock(cost: number, orderQty = 1): ClickUpTask {
  return {
    custom_fields: [
      { id: "stock-cost", name: "Cost", value: cost },
      { id: "stock-order-qty", name: "Order quantity", value: orderQty },
      {
        id: "stock-unit",
        name: "Stock unit",
        value: 1,
        type_config: { options: [{ name: "each", orderindex: 1 }] },
      },
    ],
  };
}

function kgStock(cost: number, piecesPerKg: number, orderQty = 1): ClickUpTask {
  return {
    custom_fields: [
      { id: "stock-cost", name: "Cost", value: cost },
      { id: "stock-unit-amount", name: "Unit amount", value: piecesPerKg },
      { id: "stock-order-qty", name: "Order quantity", value: orderQty },
      {
        id: "stock-unit",
        name: "Stock unit",
        value: 2,
        type_config: { options: [{ name: "kg", orderindex: 2 }] },
      },
    ],
  };
}

function ingredient(qty: number, unitOrderIndex: number): ClickUpTask {
  return {
    custom_fields: [
      { id: "qty", name: "Qty", value: qty },
      { id: "unit", name: "Unit", value: unitOrderIndex },
    ],
  };
}

// ─── costPerBaseUnit ─────────────────────────────────────────────────────────

describe("costPerBaseUnit", () => {
  it("ml stock: cost ÷ (order_qty × unit_amount_ml)", () => {
    // single 700ml bottle at £22
    const model = readStockModel(mlStock(22, 700), env);
    expect(costPerBaseUnit(model)).toBeCloseTo(22 / 700, 6);
  });

  it("ml stock case: cost ÷ (order_qty × unit_amount_ml)", () => {
    // 6 × 750ml at £52.50
    const model = readStockModel(mlStock(52.5, 750, 6), env);
    expect(costPerBaseUnit(model)).toBeCloseTo(52.5 / (6 * 750), 6);
  });

  it("each stock: cost ÷ order_qty", () => {
    // case of 24 × 150ml at £66.99 (Grapefruit Tonic)
    const model = readStockModel(eachStock(66.99, 24), env);
    expect(costPerBaseUnit(model)).toBeCloseTo(66.99 / 24, 6);
  });

  it("each stock single unit: cost ÷ 1", () => {
    const model = readStockModel(eachStock(2.5), env);
    expect(costPerBaseUnit(model)).toBeCloseTo(2.5, 6);
  });

  it("kg stock: cost ÷ (order_qty × pieces_per_kg)", () => {
    // lime: £3.60/kg, 12 limes/kg → £0.30/lime
    const model = readStockModel(kgStock(3.6, 12), env);
    expect(costPerBaseUnit(model)).toBeCloseTo(0.3, 6);
  });

  it("kg stock multi-kg: cost ÷ (order_qty × pieces_per_kg)", () => {
    // lemon: £15/kg, 8 lemons/kg → £1.875/lemon
    const model = readStockModel(kgStock(15, 8), env);
    expect(costPerBaseUnit(model)).toBeCloseTo(1.875, 6);
  });

  it("returns null when cost is zero", () => {
    const model = readStockModel(mlStock(0, 700), env);
    expect(costPerBaseUnit(model)).toBeNull();
  });

  it("returns null when unit_amount is missing from ml stock", () => {
    const stock: ClickUpTask = {
      custom_fields: [
        { id: "stock-cost", name: "Cost", value: 22 },
        {
          id: "stock-unit",
          name: "Stock unit",
          value: 0,
          type_config: { options: [{ name: "ml", orderindex: 0 }] },
        },
      ],
    };
    expect(costPerBaseUnit(readStockModel(stock, env))).toBeNull();
  });
});

// ─── resolveStockUnitCost ────────────────────────────────────────────────────

describe("resolveStockUnitCost", () => {
  it("ml stock + ml recipe unit → cost per ml", () => {
    // Campari 700ml at £17 → £0.02429/ml
    const cost = resolveStockUnitCost(mlStock(17, 700), "ml", env);
    expect(cost).toBeCloseTo(17 / 700, 6);
  });

  it("ml stock + cl recipe unit → cost per ml", () => {
    const cost = resolveStockUnitCost(mlStock(17, 700), "cl", env);
    expect(cost).toBeCloseTo(17 / 700, 6);
  });

  it("ml stock + dash → cost per ml", () => {
    const cost = resolveStockUnitCost(mlStock(14.5, 200), "dash", env);
    expect(cost).toBeCloseTo(14.5 / 200, 6);
  });

  it("ml stock + each → null (incompatible units)", () => {
    expect(resolveStockUnitCost(mlStock(17, 700), "each", env)).toBeNull();
  });

  it("each stock + each → cost per item", () => {
    // Grapefruit Tonic: £66.99 for 24 → £2.79/bottle
    const cost = resolveStockUnitCost(eachStock(66.99, 24), "each", env);
    expect(cost).toBeCloseTo(66.99 / 24, 6);
  });

  it("each stock + ml → null (incompatible units)", () => {
    expect(resolveStockUnitCost(eachStock(66.99, 24), "ml", env)).toBeNull();
  });

  it("kg stock + each → cost per piece", () => {
    // lime: 0.25 × £0.30 = £0.075
    const cost = resolveStockUnitCost(kgStock(3.6, 12), "each", env);
    expect(cost).toBeCloseTo(0.3, 6);
  });

  it("kg stock + ml → null (incompatible units)", () => {
    expect(resolveStockUnitCost(kgStock(3.6, 12), "ml", env)).toBeNull();
  });
});

// ─── computeIngredientExtendedLineCost ──────────────────────────────────────

describe("computeIngredientExtendedLineCost", () => {
  // unit orderindex: 0=ml, 1=cl, 2=dash, 3=barspoon, 4=each, 5=slice, 6=top

  it("ml stock: 45ml spirit at £22/700ml", () => {
    const costPerMl = 22 / 700;
    expect(computeIngredientExtendedLineCost(ingredient(45, 0), costPerMl, env))
      .toBeCloseTo(45 * costPerMl, 2);
  });

  it("ml stock: 4.5cl = 45ml", () => {
    const costPerMl = 22 / 700;
    const mlCost = computeIngredientExtendedLineCost(ingredient(45, 0), costPerMl, env);
    const clCost = computeIngredientExtendedLineCost(ingredient(4.5, 1), costPerMl, env);
    expect(mlCost).toBeCloseTo(clCost, 2);
  });

  it("ml stock: 1 dash (1.75ml) costs less than 45ml", () => {
    const costPerMl = 22 / 700;
    const dashCost = computeIngredientExtendedLineCost(ingredient(1, 2), costPerMl, env);
    const fullCost = computeIngredientExtendedLineCost(ingredient(45, 0), costPerMl, env);
    expect(dashCost).toBeCloseTo(1.75 * costPerMl, 2);
    expect(dashCost).toBeLessThan(fullCost);
  });

  it("each stock: Grapefruit Tonic 1 bottle at £2.79", () => {
    const costPerBottle = 66.99 / 24;
    expect(computeIngredientExtendedLineCost(ingredient(1, 4), costPerBottle, env))
      .toBeCloseTo(66.99 / 24, 2);
  });

  it("kg stock: 0.25 lime at £0.30/lime rounds to £0.08", () => {
    const costPerLime = 3.6 / 12; // £0.30 per lime
    // 0.25 × 0.30 = 0.075 → rounds to £0.08
    expect(computeIngredientExtendedLineCost(ingredient(0.25, 4), costPerLime, env))
      .toBe(0.08);
  });

  it("returns 0 when stock unit cost is null (item has no cost)", () => {
    expect(computeIngredientExtendedLineCost(ingredient(45, 0), null, env)).toBe(0);
  });
});
