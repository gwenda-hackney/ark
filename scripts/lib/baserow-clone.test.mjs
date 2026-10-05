import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  ROW_BATCH,
  baserowRequest,
  copyRows,
  retryDelayMs,
} from "./baserow-clone.mjs";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("baserowRequest", () => {
  it("waits out throttling, honouring Retry-After, then returns the answer", async () => {
    const answers = [
      json({ detail: "Request was throttled." }, 429, { "Retry-After": "3" }),
      json({ detail: "busy" }, 503),
      json({ ok: true }),
    ];
    const waits = [];
    const result = await baserowRequest(
      "https://b",
      "JWT",
      "t",
      "/api/x/",
      {},
      {
        fetchImpl: async () => answers.shift(),
        wait: async (ms) => waits.push(ms),
      },
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(waits, [3000, 2000]);
  });

  it("gives up after its attempts and names the request", async () => {
    let calls = 0;
    await assert.rejects(
      baserowRequest(
        "https://b",
        "Token",
        "t",
        "/api/rows/",
        { method: "POST" },
        {
          fetchImpl: async () => (
            calls++,
            json({ detail: "Request was throttled." }, 429)
          ),
          wait: async () => {},
        },
      ),
      /POST \/api\/rows\/ → 429: Request was throttled\./,
    );
    assert.equal(calls, 7);
  });

  it("does not retry a real error", async () => {
    let calls = 0;
    await assert.rejects(
      baserowRequest(
        "https://b",
        "JWT",
        "t",
        "/api/x/",
        {},
        {
          fetchImpl: async () => (
            calls++,
            json({ detail: "no such table" }, 404)
          ),
          wait: async () => {},
        },
      ),
      /404: no such table/,
    );
    assert.equal(calls, 1);
  });

  it("backs off 1s, 2s, 4s… up to a minute without Retry-After", () => {
    const res = new Response(null, { status: 429 });
    assert.deepEqual(
      [1, 2, 3, 8].map((n) => retryDelayMs(res, n)),
      [1000, 2000, 4000, 60000],
    );
  });
});

describe("copyRows", () => {
  /** A fake Baserow row API: new ids start at 1000, in order. */
  function fakeRows() {
    const calls = [];
    let next = 1000;
    const request = async (_base, _jwt, path, init) => {
      const body = JSON.parse(init.body);
      calls.push({ method: init.method, path, items: body.items });
      if (init.method === "POST")
        return { items: body.items.map(() => ({ id: next++ })) };
      return { items: body.items };
    };
    return { calls, request };
  }

  const fields = [
    { name: "Name", type: "text", primary: true },
    { name: "Parent", type: "link_row", link_row_table_id: 7 },
    { name: "Supplier", type: "link_row", link_row_table_id: 3 },
  ];

  it("creates rows in batches and maps old ids to new ones in order", async () => {
    const { calls, request } = fakeRows();
    const rows = Array.from({ length: 450 }, (_, i) => ({
      id: i + 1,
      Name: `row ${i + 1}`,
    }));
    const maps = new Map();
    const idMap = await copyRows(
      "https://b",
      "jwt",
      {
        rows,
        fields: fields.slice(0, 1),
        sourceTableId: 7,
        destTableId: 70,
        idMapsByOldTableId: maps,
      },
      request,
    );
    assert.deepEqual(
      calls.map((c) => c.items.length),
      [ROW_BATCH, ROW_BATCH, 50],
    );
    assert.ok(
      calls.every(
        (c) =>
          c.path === "/api/database/rows/table/70/batch/?user_field_names=true",
      ),
    );
    assert.equal(idMap.get("1"), "1000");
    assert.equal(idMap.get("450"), "1449");
    assert.equal(maps.get("7"), idMap);
  });

  it("links to other tables at once, and to its own table once every row exists", async () => {
    const { calls, request } = fakeRows();
    const maps = new Map([["3", new Map([["30", "300"]])]]);
    const rows = [
      // The child comes first: its parent doesn't exist yet when it's created.
      { id: 2, Name: "child", Parent: [{ id: 1 }], Supplier: [{ id: 30 }] },
      { id: 1, Name: "parent", Parent: [], Supplier: [] },
    ];
    await copyRows(
      "https://b",
      "jwt",
      {
        rows,
        fields,
        sourceTableId: 7,
        destTableId: 70,
        idMapsByOldTableId: maps,
      },
      request,
    );
    assert.deepEqual(calls[0].items, [
      { Name: "child", Supplier: [300] },
      { Name: "parent" },
    ]);
    assert.equal(calls[1].method, "PATCH");
    assert.deepEqual(calls[1].items, [{ id: 1000, Parent: [1001] }]);
  });

  it("stops when Baserow makes fewer rows than asked", async () => {
    const request = async () => ({ items: [] });
    await assert.rejects(
      copyRows(
        "https://b",
        "jwt",
        {
          rows: [{ id: 1, Name: "a" }],
          fields: fields.slice(0, 1),
          sourceTableId: 7,
          destTableId: 70,
          idMapsByOldTableId: new Map(),
        },
        request,
      ),
      /asked Baserow for 1 rows, it made 0/,
    );
  });
});
