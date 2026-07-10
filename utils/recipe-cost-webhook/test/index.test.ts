import { describe, expect, it } from "vitest";
import worker from "../src/index";

const env = { CLICKUP_API_KEY: "pk_test" };

describe("worker routes", () => {
  it("responds to GET /webhook for connectivity checks", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/webhook"),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      webhook: "POST /webhook",
    });
  });

  it("responds to GET / with service info", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/"),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "gwenda-recipe-cost-webhook",
    });
  });
});
