import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_SMOKE_EMAIL } from "../../../../shared/smoke-test.js";

vi.mock("./baserow.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveSubscribeTableId: vi.fn(async () => ({ ok: true, tableId: "55" })),
}));

import { runSignupSmoke } from "./signup-smoke.js";

/** The Subscribers table, as far as subscribeEmail and the smoke test use it. */
function fakeSubscribers({ failCreate = false } = {}) {
  const rows = new Map();
  let nextId = 1;
  const fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    const id = url.pathname.match(/\/table\/55\/(\d+)\/$/)?.[1];
    if (method === "GET") {
      const email = url.searchParams.get("filter__Email__equal");
      return Response.json({
        results: [...rows.values()].filter((row) => row.Email === email),
      });
    }
    if (method === "POST") {
      if (failCreate)
        return new Response('{"error":"ERROR_X"}', { status: 500 });
      const row = { id: nextId++, ...JSON.parse(init.body) };
      rows.set(row.id, row);
      return Response.json(row);
    }
    if (method === "PATCH") {
      Object.assign(rows.get(Number(id)), JSON.parse(init.body));
      return Response.json(rows.get(Number(id)));
    }
    if (method === "DELETE") {
      rows.delete(Number(id));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });
  return { rows, fetch };
}

const env = { BASEROW_API_KEY: "token" };

describe("runSignupSmoke", () => {
  let table;
  beforeEach(() => {
    table = fakeSubscribers();
    vi.stubGlobal("fetch", table.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("signs up, merges the second tag, and leaves no row", async () => {
    const tags = [];
    const detail = await runSignupSmoke(env);
    expect(detail).toContain(SIGNUP_SMOKE_EMAIL);
    for (const [, init] of table.fetch.mock.calls)
      if (init?.body) tags.push(JSON.parse(init.body).Tag);
    expect(tags).toEqual([["prelaunch"], ["prelaunch", "wifi"]]);
    expect(table.rows.size).toBe(0);
  });

  it("clears a row a failed run left behind first", async () => {
    table.rows.set(99, {
      id: 99,
      Email: SIGNUP_SMOKE_EMAIL,
      Tag: ["prelaunch", "wifi"],
      Synced: false,
    });
    await runSignupSmoke(env);
    expect(table.rows.size).toBe(0);
  });

  it("names the step that failed, and still cleans up", async () => {
    const failing = fakeSubscribers({ failCreate: true });
    vi.stubGlobal("fetch", failing.fetch);
    await expect(runSignupSmoke(env)).rejects.toThrow(/^Signing up failed/);
    expect(failing.rows.size).toBe(0);
  });

  it("fails when a sign-up doesn't stick", async () => {
    const real = table.fetch.getMockImplementation();
    // Baserow accepts the create but the row never appears.
    table.fetch.mockImplementation(async (input, init = {}) =>
      init.method === "POST" ? Response.json({ id: 1 }) : real(input, init),
    );
    await expect(runSignupSmoke(env)).rejects.toThrow(
      "After signing up: expected one row for the test address, found 0.",
    );
  });
});
