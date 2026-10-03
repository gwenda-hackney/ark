import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { bootAction, gatePath } from "./boot.ts";

function stubLocation(pathname: string, search = "") {
  const replace = vi.fn();
  vi.stubGlobal("location", { pathname, search, replace });
  return replace;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("bootAction", () => {
  it("mounts on a good /api/auth/me", () => {
    assert.equal(bootAction({ status: 200 }), "mount");
  });

  it("goes to the gate when signed out or redirected", () => {
    assert.equal(bootAction({ status: 401 }), "gate");
    assert.equal(bootAction({ status: 0, type: "opaqueredirect" }), "gate");
    assert.equal(bootAction({ status: 302 }), "gate");
  });

  it("shows the not-on-the-list message on 403", () => {
    assert.equal(bootAction({ status: 403 }), "forbidden");
  });

  it("offers a retry on server errors", () => {
    assert.equal(bootAction({ status: 500 }), "retry");
    assert.equal(bootAction({ status: 503 }), "retry");
  });
});

describe("gatePath", () => {
  it("matches the server's gate redirect", () => {
    assert.equal(gatePath("/"), "/gate/");
    assert.equal(gatePath("/events/"), "/gate/?next=%2Fevents");
    assert.equal(gatePath("/menu", "?q=gin"), "/gate/?next=%2Fmenu%3Fq%3Dgin");
  });
});

describe("api requests when the session is gone", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a 401 to the gate once, and never settles", async () => {
    const replace = stubLocation("/inventory");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: "Sign in required." })));
    const api = await import("./api.ts");
    let settled = false;
    void api.getSuppliers().then(
      () => (settled = true),
      () => (settled = true),
    );
    void api.getPosMenus().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(settled, false);
    assert.equal(replace.mock.calls.length, 1);
    assert.deepEqual(replace.mock.calls[0], ["/gate/?next=%2Finventory"]);
  });

  it("holds the page on a 403 for someone off the users list", async () => {
    const replace = stubLocation("/menu");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(403, { error: "That Google account is not on the ops users list.", code: "not_ops_user" }),
      ),
    );
    const api = await import("./api.ts");
    const res = await fetch("/api/menu");
    assert.equal(await api.handleAuthFailure(res), true);
    assert.equal(replace.mock.calls.length, 0);
  });

  it("leaves other 403s to the page as ordinary errors", async () => {
    stubLocation("/web/dev");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(403, { error: "Admins only." })));
    const api = await import("./api.ts");
    await assert.rejects(api.getSuppliers(), /Admins only\./);
  });
});

describe("splash markup", () => {
  const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../../public/gate/index.html", import.meta.url), "utf8");

  it("paints the dark splash before any script", () => {
    assert.ok(index.indexOf('id="boot"') < index.indexOf("/src/app/main.ts"));
    assert.match(index, /background: #0b0b0c/);
    assert.match(index, /prefers-reduced-motion/);
  });

  it("loads no webfont on the splash or the gate, so nothing swaps", () => {
    for (const html of [index, gate]) {
      assert.doesNotMatch(html, /fonts\.googleapis|@font-face/);
    }
  });

  it("goes straight to Google from the gate when it is the only way in", () => {
    assert.match(gate, /location\.replace\(googleHref\)/);
    assert.match(gate, /id="gate-panel" hidden/);
  });
});
