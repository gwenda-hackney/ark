import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { resetBaserowClientForTests } from "../../../platform/baserow.js";
import {
  activeEmailsFromRows,
  createOpsUser,
  isOpsUser,
  listOpsUsers,
  resetUsersCacheForTests,
  updateOpsUser,
} from "./user-store.js";
import { jsonResponse, mockOpsBaserow, opsCatalogTables } from "../../../testing/test-baserow-mock.js";

afterEach(() => {
  vi.restoreAllMocks();
  resetBaserowClientForTests();
  resetUsersCacheForTests();
});

const tableEnv = { BASEROW_API_KEY: "token" };

describe("activeEmailsFromRows", () => {
  it("keeps active emails and drops inactive or blank ones", () => {
    const emails = activeEmailsFromRows([
      { Email: "A@X.com", Active: true },
      { Email: "skip@x.com", Active: false },
      { Email: "  b@y.com " },
      { Email: "" },
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
