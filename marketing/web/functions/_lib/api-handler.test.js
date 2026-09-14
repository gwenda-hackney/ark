import { describe, expect, it } from "vitest";
import { jsonResponse, withApiHandler } from "./api-handler.js";

describe("withApiHandler", () => {
  it("returns handler responses on success", async () => {
    const handler = withApiHandler(async () => jsonResponse({ ok: true }));
    const response = await handler({});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns JSON 500 when the handler throws", async () => {
    const handler = withApiHandler(async () => {
      throw new Error("boom");
    });
    const response = await handler({});
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Something went wrong. Please try again.",
    });
  });
});
