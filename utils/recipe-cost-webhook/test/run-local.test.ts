import { describe, expect, it } from "vitest";
import { parseTaskId } from "../src/task-id";

describe("parseTaskId", () => {
  it("accepts raw task ids", () => {
    expect(parseTaskId("869e11qm3")).toBe("869e11qm3");
  });

  it("extracts task id from clickup urls", () => {
    expect(parseTaskId("https://app.clickup.com/t/869e11qm3")).toBe("869e11qm3");
  });

  it("extracts task id from workspace-prefixed clickup urls", () => {
    expect(parseTaskId("https://app.clickup.com/t/90121776959/869e11nfy")).toBe(
      "869e11nfy",
    );
  });
});
