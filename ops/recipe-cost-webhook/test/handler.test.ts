import { describe, expect, it, vi } from "vitest";
import {
  buildSmokeTestNote,
  handleWebhook,
  isSelfTriggeredUpdate,
  SMOKE_TEST_PREFIX,
} from "../src/handler";

const env = {
  CLICKUP_API_KEY: "pk_test",
};

const mockCostResult = {
  recipeId: "recipe_1",
  ingredientCount: 3,
  totalCost: 12.75,
  stockItemsTouched: 2,
};

describe("isSelfTriggeredUpdate", () => {
  it("skips description updates when writing to task body", () => {
    expect(
      isSelfTriggeredUpdate({
        history_items: [{ field: "content" }],
      }, env),
    ).toBe(true);
  });

  it("skips custom field updates when notes field id matches", () => {
    expect(
      isSelfTriggeredUpdate(
        {
          history_items: [
            {
              field: "custom_field",
              custom_field: { id: "cf_notes" },
            },
          ],
        },
        { ...env, CLICKUP_NOTES_FIELD_ID: "cf_notes" },
      ),
    ).toBe(true);
  });

  it("does not skip unrelated field updates", () => {
    expect(
      isSelfTriggeredUpdate({
        history_items: [{ field: "status" }],
      }, env),
    ).toBe(false);
  });
});

describe("buildSmokeTestNote", () => {
  it("includes prefix, timestamp, and event metadata", () => {
    const note = buildSmokeTestNote(
      { event: "taskUpdated", webhook_id: "wh_123" },
      new Date("2026-07-06T12:00:00.000Z"),
    );

    expect(note).toContain(SMOKE_TEST_PREFIX);
    expect(note).toContain("2026-07-06T12:00:00.000Z");
    expect(note).toContain("taskUpdated");
    expect(note).toContain("wh_123");
  });
});

describe("handleWebhook", () => {
  it("echoes ClickUp webhook challenge", async () => {
    const result = await handleWebhook(
      { challenge: "abc123" },
      env,
      vi.fn(),
    );

    expect(result).toEqual({
      status: 200,
      body: { challenge: "abc123" },
    });
  });

  it("writes a smoke-test note to ClickUp for task events", async () => {
    const writeNotes = vi.fn().mockResolvedValue(undefined);
    const recalculate = vi.fn().mockResolvedValue(mockCostResult);

    const result = await handleWebhook(
      {
        event: "taskUpdated",
        task_id: "task_abc",
        webhook_id: "wh_456",
        history_items: [{ field: "status" }],
      },
      env,
      writeNotes,
      recalculate,
    );

    expect(writeNotes).toHaveBeenCalledOnce();
    expect(writeNotes).toHaveBeenCalledWith(
      "pk_test",
      "recipe_1",
      expect.stringContaining(SMOKE_TEST_PREFIX),
      undefined,
    );
    expect(recalculate).toHaveBeenCalledWith("pk_test", "task_abc", env);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      task_id: "task_abc",
      recipe_id: "recipe_1",
      ingredient_count: 3,
      total_cost: 12.75,
      wrote: "markdown_description",
    });
  });

  it("skips self-triggered updates to avoid webhook loops", async () => {
    const writeNotes = vi.fn().mockResolvedValue(undefined);

    const result = await handleWebhook(
      {
        event: "taskUpdated",
        task_id: "task_abc",
        history_items: [{ field: "custom_field", custom_field: { id: "cf_notes" } }],
      },
      { ...env, CLICKUP_NOTES_FIELD_ID: "cf_notes" },
      writeNotes,
    );

    expect(writeNotes).not.toHaveBeenCalled();
    expect(result.body).toMatchObject({ ok: true, skipped: true });
  });

  it("accepts connectivity tests without a task id", async () => {
    const writeNotes = vi.fn().mockResolvedValue(undefined);
    const recalculate = vi.fn().mockResolvedValue(mockCostResult);

    const result = await handleWebhook({}, env, writeNotes, recalculate);

    expect(writeNotes).not.toHaveBeenCalled();
    expect(recalculate).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        mode: "connectivity_test",
        message: "Webhook reachable; no task id in payload",
      },
    });
  });

  it("writes a smoke-test note for automation payloads", async () => {
    const writeNotes = vi.fn().mockResolvedValue(undefined);
    const recalculate = vi.fn().mockResolvedValue(mockCostResult);

    const result = await handleWebhook(
      {
        auto_id: "c389706e-3a5f-4230-a2aa-cdea3dc1e4cc:main",
        trigger_id: "40dd6192-91d7-4f3e-b55f-605297c77bb7",
        payload: { id: "868djdyr0", name: "HookMe!" },
      },
      env,
      writeNotes,
      recalculate,
    );

    expect(recalculate).toHaveBeenCalledWith("pk_test", "868djdyr0", env);
    expect(writeNotes).toHaveBeenCalledWith(
      "pk_test",
      "recipe_1",
      expect.stringContaining(SMOKE_TEST_PREFIX),
      undefined,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, task_id: "868djdyr0" });
  });

  it("uses custom notes field when configured", async () => {
    const writeNotes = vi.fn().mockResolvedValue(undefined);
    const recalculate = vi.fn().mockResolvedValue(mockCostResult);

    await handleWebhook(
      {
        event: "taskUpdated",
        task_id: "task_abc",
        history_items: [{ field: "name" }],
      },
      { ...env, CLICKUP_NOTES_FIELD_ID: "cf_notes" },
      writeNotes,
      recalculate,
    );

    expect(writeNotes).toHaveBeenCalledWith(
      "pk_test",
      "recipe_1",
      expect.stringContaining(SMOKE_TEST_PREFIX),
      "cf_notes",
    );
  });
});
