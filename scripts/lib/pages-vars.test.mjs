import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPagesVars, pagesVarsPatch } from "./pages-vars.mjs";

describe("pages vars", () => {
  it("puts secrets and plain vars on both deployment environments", () => {
    const { body } = pagesVarsPatch({ secrets: { A: "1" }, plain: { B: "2" } });
    for (const env of ["production", "preview"]) {
      assert.deepEqual(body.deployment_configs[env].env_vars, {
        A: { type: "secret_text", value: "1" },
        B: { type: "plain_text", value: "2" },
      });
    }
  });

  it("leaves empty values alone", () => {
    const { body } = pagesVarsPatch({ secrets: { A: "", B: undefined } });
    assert.deepEqual(body.deployment_configs.production.env_vars, {});
  });

  it("removes a key only where it is a secret", () => {
    const current = {
      production: { env_vars: { OLD: { type: "secret_text" }, TOML: { type: "plain_text", value: "x" } } },
      preview: { env_vars: {} },
    };
    const { body, removed } = pagesVarsPatch({ current, remove: ["OLD", "TOML", "GONE"] });
    assert.deepEqual(body.deployment_configs.production.env_vars, { OLD: null });
    assert.deepEqual(body.deployment_configs.preview.env_vars, {});
    assert.deepEqual(removed, ["OLD (production)"]);
  });

  it("puts preview secrets on the preview only and takes them off production", () => {
    const current = {
      production: { env_vars: { SITE_PASSWORD: { type: "secret_text" } } },
      preview: { env_vars: {} },
    };
    const { body, removed } = pagesVarsPatch({
      current,
      secrets: { A: "1" },
      previewSecrets: { SITE_PASSWORD: "pw" },
    });
    assert.deepEqual(body.deployment_configs.production.env_vars, {
      SITE_PASSWORD: null,
      A: { type: "secret_text", value: "1" },
    });
    assert.deepEqual(body.deployment_configs.preview.env_vars, {
      A: { type: "secret_text", value: "1" },
      SITE_PASSWORD: { type: "secret_text", value: "pw" },
    });
    assert.deepEqual(removed, ["SITE_PASSWORD (production)"]);
  });

  it("keeps secrets off the preview when told to (prod ops previews hold no prod secrets)", () => {
    const { body } = pagesVarsPatch({ secrets: { A: "1" }, secretEnvs: ["production"] });
    assert.deepEqual(body.deployment_configs.production.env_vars, { A: { type: "secret_text", value: "1" } });
    assert.deepEqual(body.deployment_configs.preview.env_vars, {});
  });

  it("clears keys from the preview only", () => {
    const current = {
      production: { env_vars: { A: { type: "secret_text" } } },
      preview: { env_vars: { A: { type: "secret_text" }, B: { type: "secret_text" } } },
    };
    const { body, removed } = pagesVarsPatch({
      current,
      secrets: { A: "1" },
      secretEnvs: ["production"],
      previewRemove: ["A", "B", "C"],
    });
    assert.deepEqual(body.deployment_configs.production.env_vars, { A: { type: "secret_text", value: "1" } });
    assert.deepEqual(body.deployment_configs.preview.env_vars, { A: null, B: null });
    assert.deepEqual(removed, ["A (preview)", "B (preview)"]);
  });

  it("clears every secret from the preview with \"all\", leaving plain vars", () => {
    const current = {
      production: { env_vars: { A: { type: "secret_text" } } },
      preview: { env_vars: { A: { type: "secret_text" }, OLD: { type: "secret_text" }, P: { type: "plain_text" } } },
    };
    const { body } = pagesVarsPatch({ current, secretEnvs: ["production"], previewRemove: "all" });
    assert.deepEqual(body.deployment_configs.preview.env_vars, { A: null, OLD: null });
    assert.deepEqual(body.deployment_configs.production.env_vars, {});
  });

  it("sends one PATCH, and reads the project first only when removing", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push(init.method || "GET");
      return { ok: true, json: async () => ({ success: true, result: { deployment_configs: {} } }) };
    };
    const args = { accountId: "acc", token: "t", project: "p", secrets: { A: "1" }, fetchImpl };
    await applyPagesVars(args);
    assert.deepEqual(calls, ["PATCH"]);
    calls.length = 0;
    await applyPagesVars({ ...args, remove: ["X"] });
    assert.deepEqual(calls, ["GET", "PATCH"]);
  });

  it("fails loudly when Cloudflare refuses", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ message: "no" }] }) });
    await assert.rejects(
      applyPagesVars({ accountId: "acc", token: "t", project: "p", secrets: { A: "1" }, fetchImpl }),
      /Could not update p/,
    );
  });
});
