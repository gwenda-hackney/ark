/**
 * Access by area (#375): every API route belongs to an area (or is open to
 * all staff), so a new endpoint can't slip past the checks; and what each
 * level lets through.
 */
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { AREA_IDS, areaForApiPath, levelsFor, refusalFor } from "./areas.js";

const API_DIR = fileURLToPath(new URL("../../functions/api", import.meta.url));

/** Every route file under functions/api as a request path: [id] becomes 1. */
function apiPaths(dir = API_DIR) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return apiPaths(full);
    if (!name.endsWith(".js") || name.endsWith(".test.js") || name.startsWith("_")) return [];
    const route = relative(API_DIR, full).replace(/\.js$/, "").replace(/(^|\/)index$/, "").replace(/\[[^\]]+\]/g, "1");
    return [`/api/${route}`.replace(/\/$/, "")];
  });
}

const everyone = (value) => Object.fromEntries(AREA_IDS.map((id) => [id, value]));

describe("areas own the API", () => {
  it("every API route is open to staff or belongs to an area", () => {
    const paths = apiPaths();
    assert.ok(paths.length > 50, "found the routes");
    const unowned = paths.filter((path) => !areaForApiPath(path));
    assert.deepEqual(unowned, [], "give each of these an area in areas.js");
  });

  it("a narrow area wins over a broad one", () => {
    assert.equal(areaForApiPath("/api/email/one-off/12/send"), "email-send");
    assert.equal(areaForApiPath("/api/email/one-off/12"), "email");
    assert.equal(areaForApiPath("/api/email/people"), "email-people");
    assert.equal(areaForApiPath("/api/venue/gallery/abc"), "photos");
    assert.equal(areaForApiPath("/api/venue/hours"), "venue");
    assert.equal(areaForApiPath("/api/web/code"), "devtools");
    assert.equal(areaForApiPath("/api/web/release"), "website");
    assert.equal(areaForApiPath("/api/web/tick"), "open");
  });
});

describe("what a level lets through", () => {
  const bar = levelsFor({ areas: { stock: "edit", menus: "view" } });

  it("edit changes, view only looks, none can't change", () => {
    assert.equal(refusalFor(bar, "/api/inventory/3", "PATCH"), null);
    assert.equal(refusalFor(bar, "/api/menus", "GET"), null);
    assert.equal(refusalFor(bar, "/api/menus/3", "PATCH"), "You can view Menus and items but not change it. Ask an owner.");
    assert.equal(refusalFor(bar, "/api/events", "POST"), "You don't have access to What's on. Ask an owner.");
  });

  it("reads stay open where pages share data, but not in a guarded area", () => {
    assert.equal(refusalFor(bar, "/api/events", "GET"), null);
    assert.match(refusalFor(bar, "/api/users", "GET"), /access to Users/);
    assert.match(refusalFor(bar, "/api/email/people", "GET"), /access to Email: People/);
    assert.match(refusalFor(bar, "/api/web/databases", "GET"), /access to Developer tools/);
  });

  it("open paths are for everyone, and a path no area owns is refused", () => {
    assert.equal(refusalFor(everyone("none"), "/api/auth/me", "GET"), null);
    assert.equal(refusalFor(everyone("none"), "/api/web/tick", "POST"), null);
    assert.match(refusalFor(everyone("edit"), "/api/nothing-here", "GET"), /isn't part of any area/);
  });

  it("an owner has edit on everything; extras raise a role, never lower it", () => {
    assert.deepEqual(levelsFor({ owner: true, areas: {} }), everyone("edit"));
    const promoter = levelsFor({ areas: { "whats-on": "edit", email: "view" } }, { email: "edit", "whats-on": "none" });
    assert.equal(promoter.email, "edit");
    assert.equal(promoter["whats-on"], "edit");
    assert.equal(promoter.users, "none");
    assert.equal(levelsFor(null).stock, "none");
  });
});
