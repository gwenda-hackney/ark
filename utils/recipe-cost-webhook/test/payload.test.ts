import { describe, expect, it } from "vitest";
import { extractTaskId, isAutomationPayload } from "../src/payload";

describe("extractTaskId", () => {
  it("reads API webhook task_id", () => {
    expect(extractTaskId({ task_id: "abc123" })).toBe("abc123");
  });

  it("reads automation payload.id", () => {
    expect(
      extractTaskId({
        auto_id: "auto:main",
        payload: { id: "868djdyr0", name: "HookMe!" },
      }),
    ).toBe("868djdyr0");
  });

  it("reads nested task.id", () => {
    expect(extractTaskId({ task: { id: "task_nested" } })).toBe("task_nested");
  });
});

describe("isAutomationPayload", () => {
  it("detects automation payloads", () => {
    expect(
      isAutomationPayload({
        auto_id: "auto:main",
        payload: { id: "868djdyr0" },
      }),
    ).toBe(true);
  });
});
