import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyFingerprint,
  applyLiveHealth,
  collectWebStatus,
  driftBetween,
  driftLabel,
  emptyEnvStatus,
  fingerprintFromDocs,
  lastErrorFromChecks,
  parseSiteHealthPayload,
} from "./web-status.js";

describe("parseSiteHealthPayload", () => {
  it("reads env, dataset, and commit from the public health JSON", () => {
    assert.deepEqual(
      parseSiteHealthPayload({
        ok: true,
        service: "gwenda",
        env: "preview",
        dataset: "preview",
        commit: "abc1234",
      }),
      {
        ok: true,
        service: "gwenda",
        env: "preview",
        dataset: "preview",
        commit: "abc1234",
      },
    );
    assert.equal(parseSiteHealthPayload({ ok: true, service: "other" }), null);
  });
});

describe("fingerprintFromDocs", () => {
  it("hashes published id:rev pairs so matching datasets compare equal", () => {
    const docs = [
      { _id: "b", _rev: "2", _updatedAt: "2026-01-02T00:00:00Z" },
      { _id: "a", _rev: "1", _updatedAt: "2026-01-01T00:00:00Z" },
    ];
    const shuffled = [
      { _id: "a", _rev: "1", _updatedAt: "2026-01-01T00:00:00Z" },
      { _id: "b", _rev: "2", _updatedAt: "2026-01-02T00:00:00Z" },
    ];
    const left = fingerprintFromDocs(docs);
    const right = fingerprintFromDocs(shuffled);
    assert.equal(left.hash, right.hash);
    assert.equal(left.count, 2);
    assert.equal(left.updatedAt, "2026-01-02T00:00:00Z");
    assert.notEqual(
      fingerprintFromDocs([{ _id: "a", _rev: "9" }]).hash,
      left.hash,
    );
  });
});

describe("driftBetween", () => {
  it("reports in sync, code ahead, and content ahead", () => {
    const same = {
      code: { commit: "aaa" },
      content: { hash: "111" },
    };
    assert.deepEqual(driftBetween(same, same), {
      inSync: true,
      codeAhead: false,
      contentAhead: false,
      unknown: false,
    });
    assert.equal(
      driftBetween(
        { code: { commit: "bbb" }, content: { hash: "111" } },
        same,
      ).codeAhead,
      true,
    );
    assert.equal(
      driftBetween(
        { code: { commit: "aaa" }, content: { hash: "222" } },
        same,
      ).contentAhead,
      true,
    );
    assert.equal(driftLabel({ inSync: true }), "Preview matches production");
    assert.equal(
      driftLabel({ codeAhead: true, contentAhead: true }),
      "Preview is code ahead and content ahead",
    );
  });
});

describe("lastErrorFromChecks", () => {
  it("uses the first failed probe check", () => {
    assert.equal(
      lastErrorFromChecks([
        { name: "health", ok: true },
        { name: "home", ok: false, error: "HTTP 302" },
      ]),
      "home: HTTP 302",
    );
  });
});

describe("collectWebStatus", () => {
  it("aggregates live health, monitor state, and Sanity fingerprints", async () => {
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.includes("preview.gwenda-blue") && href.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "gwenda",
            env: "preview",
            dataset: "preview",
            commit: "stage1",
          }),
        );
      }
      if (href.includes("gwenda.co.uk") && href.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "gwenda",
            env: "production",
            dataset: "production",
            commit: "prod1",
          }),
        );
      }
      if (href.endsWith("/status")) {
        return new Response(
          JSON.stringify({
            ok: true,
            sites: {
              preview: { down: false, ok: true, lastCheckedAt: 100 },
              production: {
                down: true,
                ok: false,
                lastError: "health: HTTP 502",
                lastCheckedAt: 100,
              },
            },
          }),
        );
      }
      return new Response(JSON.stringify({ error: "nope" }), { status: 404 });
    };

    async function sanityQuery(_env, view) {
      if (view === "preview") {
        return [{ _id: "a", _rev: "1", _updatedAt: "2026-01-02T00:00:00Z" }];
      }
      if (view === "production") {
        return [{ _id: "a", _rev: "0", _updatedAt: "2026-01-01T00:00:00Z" }];
      }
      return [];
    }

    const status = await collectWebStatus({}, { fetchImpl, sanityQuery });
    assert.equal(status.environments.preview.code.commit, "stage1");
    assert.equal(status.environments.production.code.commit, "prod1");
    assert.equal(status.environments.preview.dataset, "preview");
    assert.equal(status.environments.development, undefined);
    assert.equal(status.drift.codeAhead, true);
    assert.equal(status.drift.contentAhead, true);
    assert.equal(status.devDrift, undefined);
    assert.equal(status.promote.toPreview, true);
    assert.equal(status.promote.toProduction, true);
    assert.equal(status.environments.production.health.down, true);
    assert.equal(status.lastError, "health: HTTP 502");
  });
});

describe("empty env helpers", () => {
  it("fills live health onto an empty status", () => {
    const next = applyLiveHealth(emptyEnvStatus("preview"), {
      commit: "abc",
      env: "preview",
      dataset: "preview",
    });
    assert.equal(emptyEnvStatus("preview").dataset, "preview");
    assert.equal(next.code.commit, "abc");
    const fingerprinted = applyFingerprint(next, {
      hash: "deadbeef",
      count: 3,
      updatedAt: "2026-01-01T00:00:00Z",
    });
    assert.equal(fingerprinted.content.count, 3);
  });
});
