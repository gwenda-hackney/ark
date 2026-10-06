import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { resetBaserowClientForTests } from "../../../../../shared/baserow.js";
import {
  activeEmailsFrom,
  createOpsUser,
  isOpsUser,
  listOpsUsers,
  resetUsersCacheForTests,
  updateOpsUser,
} from "./user-store.js";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1UserRepository } from "./adapters/d1-users.js";
import { jsonResponse, mockOpsBaserow, opsCatalogTables } from "../../testing/test-baserow-mock.js";

afterEach(() => {
  vi.restoreAllMocks();
  resetBaserowClientForTests();
  resetUsersCacheForTests();
});

const tableEnv = { BASEROW_API_KEY: "token" };

describe("activeEmailsFrom", () => {
  it("keeps active emails and drops inactive or blank ones", () => {
    const emails = activeEmailsFrom([
      { email: "A@X.com", active: true },
      { email: "skip@x.com", active: false },
      { email: "  b@y.com ", active: true },
      { email: "", active: true },
    ]);
    assert.deepEqual([...emails].sort(), ["a@x.com", "b@y.com"]);
  });
});

describe("isOpsUser", () => {
  it("matches the Access email against the Users table", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async (_input, _init, url) => {
        assert.match(url, /\/rows\/table\/99\//);
        return jsonResponse({
          results: [
            { id: 1, Email: "person@gwenda.com", Active: true },
            { id: 2, Email: "gone@gwenda.com", Active: false },
          ],
        });
      }));
    assert.equal(await isOpsUser(tableEnv, "Person@Gwenda.com"), true);
    assert.equal(await isOpsUser(tableEnv, "gone@gwenda.com"), false);
    assert.equal(await isOpsUser(tableEnv, "other@gwenda.com"), false);
  });

  it("fails closed when the Users table is missing from the catalog", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation( async (input) => {
      const url = String(input);
      if (url.includes("/tables/all-tables/")) {
        return jsonResponse(
          opsCatalogTables().filter((table) => table.name !== "Users"),
        );
      }
      return jsonResponse({ results: [] });
    });
    await assert.rejects(
      () => isOpsUser(tableEnv, "person@gwenda.com"),
      (error) => error.status === 503,
    );
  });
});

describe("isOpsUser on D1", () => {
  it("matches emails whatever their case, and only active users", async () => {
    const OPS_DB = createTestD1("ops");
    await d1UserRepository(OPS_DB).importAll({
      users: [
        { id: 1, name: "P", email: "person@gwenda.com", active: true },
        { id: 2, name: "G", email: "gone@gwenda.com", active: false },
      ],
    });
    const env = { OPS_DB, DATA_STORE_USERS: "d1" };
    assert.equal(await isOpsUser(env, " Person@Gwenda.com "), true);
    assert.equal(await isOpsUser(env, "gone@gwenda.com"), false);
    assert.equal(await isOpsUser(env, "other@gwenda.com"), false);
  });

  it("fails closed when the store can't be read", async () => {
    const OPS_DB = {
      prepare() {
        throw new Error("D1 is down");
      },
    };
    await assert.rejects(() => isOpsUser({ OPS_DB }, "person@gwenda.com"), /D1 is down/);
  });
});

describe("listOpsUsers / createOpsUser / updateOpsUser", () => {
  it("lists users with emails, sorted", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async () =>
        jsonResponse({
          results: [
            { id: 2, Name: "B", Email: "b@gwenda.com", Active: true },
            { id: 1, Name: "A", Email: "a@gwenda.com", Active: false },
            { id: 3, Name: "", Email: "", Active: true },
          ],
        }),
      ));
    const users = await listOpsUsers(tableEnv);
    assert.deepEqual(
      users.map((u) => u.email),
      ["a@gwenda.com", "b@gwenda.com"],
    );
    assert.equal(users[0].active, false);
  });

  it("creates a user and rejects duplicates", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async (_input, init) => {
        if ((init?.method || "GET") === "POST") {
          const body = JSON.parse(init.body);
          return jsonResponse({
            id: 9,
            Name: body.Name,
            Email: body.Email,
            Active: body.Active,
          });
        }
        return jsonResponse({
          results: [{ id: 1, Email: "a@gwenda.com", Active: true }],
        });
      }));
    const created = await createOpsUser(tableEnv, {
      email: "New@Gwenda.com",
      name: "New",
    });
    assert.equal(created.email, "new@gwenda.com");
    assert.equal(created.name, "New");
    assert.equal(created.active, true);

    await assert.rejects(
      () => createOpsUser(tableEnv, { email: "a@gwenda.com" }),
      (error) => error.status === 409,
    );
  });

  it("patches Active without requiring email", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async (_input, init) => {
        if ((init?.method || "GET") === "PATCH") {
          const body = JSON.parse(init.body);
          assert.deepEqual(body, { Active: false });
          return jsonResponse({
            id: 1,
            Email: "a@gwenda.com",
            Name: "A",
            Active: false,
          });
        }
        return jsonResponse({ results: [] });
      }));
    const user = await updateOpsUser(tableEnv, "1", { active: false });
    assert.equal(user.active, false);
  });
});
