import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { resetBaserowClientForTests } from "./baserow.js";
import {
  createPosMenu,
  DEFAULT_POS_MENU_NAME,
  defaultPosMenuIds,
  deletePosMenu,
  listPosMenus,
  mapPosMenu,
  mapPosMenuLinks,
  normalizePosMenuIds,
  posMenuLinkFields,
  updatePosMenu,
} from "./pos-menu-store.js";
import { jsonResponse, mockOpsBaserow } from "./test-baserow-mock.js";

afterEach(() => {
  mock.restoreAll();
  resetBaserowClientForTests();
});

const tableEnv = { BASEROW_API_KEY: "token" };

describe("pos menu helpers", () => {
  it("maps link-row values and keeps unique ids", () => {
    assert.equal(mapPosMenu({ id: 1, Name: "" }), null);
    assert.deepEqual(
      mapPosMenuLinks([
        { id: 1, value: "Fall 2026" },
        { id: "1", value: "Fall 2026" },
        { id: 2, value: "Live" },
        null,
      ]),
      [
        { id: "1", name: "Fall 2026" },
        { id: "2", name: "Live" },
      ],
    );
    assert.deepEqual(normalizePosMenuIds(["2", { id: 2 }, { id: "1" }, ""]), [
      "2",
      "1",
    ]);
    assert.deepEqual(defaultPosMenuIds([{ id: "9", isDefault: true }]), ["9"]);
    assert.deepEqual(
      posMenuLinkFields({ posMenuIds: ["1", "2"] }, { posMenus: 77 }),
      { "POS menus": [1, 2] },
    );
    assert.deepEqual(posMenuLinkFields({ name: "Negroni" }, { posMenus: 77 }), {});
    assert.equal(DEFAULT_POS_MENU_NAME, "Fall 2026");
  });
});

describe("list / create / update / delete POS menus", () => {
  it("lists menus with the default first by order, then name", async () => {
    mock.method(
      globalThis,
      "fetch",
      mockOpsBaserow(async () =>
        jsonResponse({
          results: [
            { id: 2, Name: "Live", Order: 2, Default: false },
            { id: 1, Name: "Fall 2026", Order: 1, Default: true },
          ],
        }),
      ),
    );
    const menus = await listPosMenus(tableEnv);
    assert.deepEqual(
      menus.map((row) => row.name),
      ["Fall 2026", "Live"],
    );
    assert.equal(menus[0].isDefault, true);
  });

  it("creates the first menu as default and rejects a name clash", async () => {
    let created = null;
    mock.method(
      globalThis,
      "fetch",
      mockOpsBaserow(async (_input, init, url) => {
        const method = init?.method || "GET";
        if (method === "POST" && url.includes("/rows/table/77/")) {
          const body = JSON.parse(init.body);
          created = {
            id: 3,
            Name: body.Name,
            Order: body.Order,
            Default: body.Default,
          };
          return jsonResponse(created);
        }
        return jsonResponse({
          results: created ? [created] : [],
        });
      }),
    );
    const menu = await createPosMenu(tableEnv, { name: "Fall 2026" });
    assert.equal(menu.name, "Fall 2026");
    assert.equal(menu.isDefault, true);

    await assert.rejects(
      () => createPosMenu(tableEnv, { name: "fall 2026" }),
      (error) => error.status === 409,
    );
  });

  it("clears other defaults when a menu is marked default", async () => {
    const patches = [];
    mock.method(
      globalThis,
      "fetch",
      mockOpsBaserow(async (_input, init, url) => {
        const method = init?.method || "GET";
        if (method === "PATCH") {
          const body = JSON.parse(init.body);
          patches.push({ url, body });
          const id = url.match(/\/rows\/table\/77\/(\d+)/)?.[1];
          return jsonResponse({
            id: Number(id),
            Name: body.Name || (id === "2" ? "Live" : "Fall 2026"),
            Order: body.Order ?? (id === "2" ? 2 : 1),
            Default: body.Default,
          });
        }
        return jsonResponse({
          results: [
            { id: 1, Name: "Fall 2026", Order: 1, Default: true },
            { id: 2, Name: "Live", Order: 2, Default: false },
          ],
        });
      }),
    );
    const menu = await updatePosMenu(tableEnv, "2", { isDefault: true });
    assert.equal(menu.isDefault, true);
    assert.ok(
      patches.some(
        (row) => row.url.includes("/77/1/") && row.body.Default === false,
      ),
    );
  });

  it("promotes another menu when the default is deleted", async () => {
    const patches = [];
    mock.method(
      globalThis,
      "fetch",
      mockOpsBaserow(async (_input, init, url) => {
        const method = init?.method || "GET";
        if (method === "DELETE") {
          return jsonResponse({ ok: true });
        }
        if (method === "PATCH") {
          const body = JSON.parse(init.body);
          patches.push(body);
          return jsonResponse({
            id: 2,
            Name: "Live",
            Order: 2,
            Default: true,
          });
        }
        return jsonResponse({
          results: [
            { id: 1, Name: "Fall 2026", Order: 1, Default: true },
            { id: 2, Name: "Live", Order: 2, Default: false },
          ],
        });
      }),
    );
    await deletePosMenu(tableEnv, "1");
    assert.deepEqual(patches, [{ Default: true }]);
  });
});
