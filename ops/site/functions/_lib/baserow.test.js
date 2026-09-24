import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  baserowClient,
  baserowFetch,
  linkHasQuery,
  parseRetryAfterMs,
  resetBaserowClientForTests,
  resolveOpsTableIds,
} from "./baserow.js";

const env = { BASEROW_API_KEY: "token" };

afterEach(() => {
  mock.restoreAll();
  resetBaserowClientForTests();
});

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("parseRetryAfterMs", () => {
  it("reads integer seconds and caps the wait", () => {
    assert.equal(parseRetryAfterMs("1"), 1000);
    assert.equal(parseRetryAfterMs("30"), 5000);
  });

  it("backs off when the header is missing", () => {
    assert.equal(parseRetryAfterMs("", 0), 200);
    assert.equal(parseRetryAfterMs(null, 1), 400);
    assert.equal(parseRetryAfterMs(undefined, 3), 1600);
  });
});

describe("linkHasQuery", () => {
  it("builds a Baserow advanced filter for a link row", () => {
    assert.deepEqual(JSON.parse(linkHasQuery("Menu Item", 3).filters), {
      filter_type: "AND",
      filters: [{ field: "Menu Item", type: "link_row_has", value: "3" }],
    });
  });
});

describe("baserowFetch", () => {
  it("retries 429s after releasing the concurrency slot", async () => {
    const sleeps = [];
    baserowClient.sleep = async (ms) => {
      sleeps.push(ms);
    };
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls < 3) {
        return jsonResponse(
          { detail: "Request was throttled." },
          429,
          { "Retry-After": "1" },
        );
      }
      return jsonResponse({ ok: true });
    });

    const payload = await baserowFetch(env, "/api/database/rows/table/1/");
    assert.deepEqual(payload, { ok: true });
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [1000, 1000]);
  });

  it("caps concurrent Baserow calls", async () => {
    baserowClient.maxConcurrent = 2;
    baserowClient.slotWaitMs = 5;
    let current = 0;
    let peak = 0;
    const release = [];
    mock.method(globalThis, "fetch", () => {
      current += 1;
      peak = Math.max(peak, current);
      return new Promise((resolve) => {
        release.push(() => {
          current -= 1;
          resolve(jsonResponse({ ok: true }));
        });
      });
    });

    const requests = [
      baserowFetch(env, "/a"),
      baserowFetch(env, "/b"),
      baserowFetch(env, "/c"),
    ];
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(peak, 2);
    assert.equal(release.length, 2);
    release.shift()();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(peak, 2);
    assert.equal(release.length, 2);
    while (release.length) release.shift()();
    await Promise.all(requests);
    assert.equal(peak, 2);
  });

  it("does not hang after the slot wait cap when every slot stays busy", async () => {
    baserowClient.maxConcurrent = 1;
    baserowClient.slotWaitMs = 5;
    baserowClient.slotWaitCapMs = 20;
    let current = 0;
    let peak = 0;
    const held = [];
    mock.method(globalThis, "fetch", () => {
      current += 1;
      peak = Math.max(peak, current);
      if (current === 1) {
        return new Promise((resolve) => {
          held.push(() => {
            current -= 1;
            resolve(jsonResponse({ ok: true }));
          });
        });
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    const first = baserowFetch(env, "/held");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(held.length, 1);

    const second = await Promise.race([
      baserowFetch(env, "/after-cap"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("slot waiter hung")), 200),
      ),
    ]);
    assert.deepEqual(second, { ok: true });
    assert.ok(peak >= 2);
    while (held.length) held.shift()();
    await first;
  });
});

describe("resolveOpsTableIds", () => {
  it("resolves table ids by name from the catalog and caches", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      jsonResponse([
        { id: 11, name: "Menu Sections", database_id: 9 },
        { id: 12, name: "Menu Items", database_id: 9 },
        { id: 13, name: "Ingredients", database_id: 9 },
        { id: 14, name: "Inventory", database_id: 9 },
        { id: 15, name: "Suppliers", database_id: 9 },
        { id: 16, name: "Inventory suppliers", database_id: 9 },
        { id: 17, name: "Users", database_id: 9 },
        { id: 99, name: "Menu Items", database_id: 8 },
      ]),
    );
    const env = { BASEROW_API_KEY: "token" };
    const first = await resolveOpsTableIds(env);
    const second = await resolveOpsTableIds(env);
    assert.equal(first.databaseId, "9");
    assert.equal(first.sections, "11");
    assert.equal(first.inventorySuppliers, "16");
    assert.equal(first.users, "17");
    assert.equal(second, first);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it("scopes to BASEROW_OPS_DATABASE_ID when set", async () => {
    mock.method(globalThis, "fetch", async () =>
      jsonResponse([
        { id: 11, name: "Menu Sections", database_id: 9 },
        { id: 12, name: "Menu Items", database_id: 9 },
        { id: 13, name: "Ingredients", database_id: 9 },
        { id: 21, name: "Menu Sections", database_id: 7 },
        { id: 22, name: "Menu Items", database_id: 7 },
        { id: 23, name: "Ingredients", database_id: 7 },
      ]),
    );
    const tables = await resolveOpsTableIds({
      BASEROW_API_KEY: "token",
      BASEROW_OPS_DATABASE_ID: "7",
    });
    assert.equal(tables.databaseId, "7");
    assert.equal(tables.sections, "21");
    assert.equal(tables.items, "22");
  });
});
