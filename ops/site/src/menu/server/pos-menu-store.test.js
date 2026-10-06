import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  createPosMenu,
  DEFAULT_POS_MENU_NAME,
  defaultPosMenuIds,
  deletePosMenu,
  listPosMenus,
  mapPosMenu,
  normalizePosMenuIds,
  updatePosMenu,
} from "./pos-menu-store.js";
import { memoryMenuRepository } from "./adapters/memory-menu.js";

function envWith(posMenus = []) {
  const menuRepository = memoryMenuRepository({ pos_menus: posMenus });
  return { env: { menuRepository }, repo: menuRepository };
}

describe("pos menu helpers", () => {
  it("maps records and keeps unique ids", () => {
    assert.equal(mapPosMenu({ id: 1, name: "" }), null);
    assert.deepEqual(mapPosMenu({ id: 1, name: " Live ", order: 2, isDefault: false }), {
      id: "1",
      name: "Live",
      orderRank: 2,
      isDefault: false,
    });
    assert.deepEqual(normalizePosMenuIds(["2", { id: 2 }, { id: "1" }, ""]), [
      "2",
      "1",
    ]);
    assert.deepEqual(defaultPosMenuIds([{ id: "9", isDefault: true }]), ["9"]);
    assert.equal(DEFAULT_POS_MENU_NAME, "Fall 2026");
  });
});

describe("list / create / update / delete POS menus", () => {
  it("lists menus by order, then name", async () => {
    const { env } = envWith([
      { id: 2, name: "Live", order: 2, isDefault: false },
      { id: 1, name: "Fall 2026", order: 1, isDefault: true },
    ]);
    const menus = await listPosMenus(env);
    assert.deepEqual(
      menus.map((row) => row.name),
      ["Fall 2026", "Live"],
    );
    assert.equal(menus[0].isDefault, true);
  });

  it("creates the first menu as default and rejects a name clash", async () => {
    const { env } = envWith();
    const menu = await createPosMenu(env, { name: "Fall 2026" });
    assert.equal(menu.name, "Fall 2026");
    assert.equal(menu.isDefault, true);

    await assert.rejects(
      () => createPosMenu(env, { name: "fall 2026" }),
      (error) => error.status === 409,
    );
  });

  it("clears other defaults when a menu is marked default", async () => {
    const { env, repo } = envWith([
      { id: 1, name: "Fall 2026", order: 1, isDefault: true },
      { id: 2, name: "Live", order: 2, isDefault: false },
    ]);
    const menu = await updatePosMenu(env, "2", { isDefault: true });
    assert.equal(menu.isDefault, true);
    assert.equal((await repo.get("pos_menus", 1)).isDefault, false);
  });

  it("promotes another menu when the default is deleted", async () => {
    const { env, repo } = envWith([
      { id: 1, name: "Fall 2026", order: 1, isDefault: true },
      { id: 2, name: "Live", order: 2, isDefault: false },
    ]);
    await deletePosMenu(env, "1");
    assert.equal(await repo.get("pos_menus", 1), null);
    assert.equal((await repo.get("pos_menus", 2)).isDefault, true);
  });
});
