import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  parseArgs,
  postLightspeedPreview,
  totpCode,
} from "./lightspeed-item-export.mjs";
import { assertLightspeedFormattedExport } from "../functions/_lib/lightspeed-stock.js";

const libraryCsv = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../functions/_lib/fixtures/lightspeed-item-library.csv",
  ),
  "utf8",
);

describe("lightspeed-item-export CLI", () => {
  it("parses probe, headed, repeat, and preview flags", () => {
    const opts = parseArgs([
      "--probe",
      "--headed",
      "--repeat",
      "2",
      "--preview",
      "--out",
      "out.csv",
    ]);
    assert.equal(opts.probe, true);
    assert.equal(opts.headed, true);
    assert.equal(opts.repeat, 2);
    assert.equal(opts.preview, true);
    assert.equal(opts.out, "out.csv");
  });

  it("rejects unknown flags", () => {
    assert.throws(() => parseArgs(["--stamp"]), /Unknown argument/);
  });

  it("computes RFC 6238 SHA-1 TOTP at T=59", () => {
    assert.equal(
      totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", {
        now: 59_000,
        digits: 8,
      }),
      "94287082",
    );
  });

  it("posts preview only (never stamp) with a session cookie", async () => {
    const calls = [];
    const json = await postLightspeedPreview({
      previewUrl: "https://gwenda-ops.pages.dev",
      sessionSecret: "test-secret-please-change",
      email: "ops@gwenda.co.uk",
      text: libraryCsv,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ ok: true, matched: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    assert.equal(json.ok, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/inventory\/lightspeed$/);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.action, "preview");
    assert.equal(body.apply, undefined);
    assert.match(calls[0].init.headers.Cookie, /gwenda_ops_access=/);
  });

  it("validates the checked-in formatted fixture", () => {
    const rows = assertLightspeedFormattedExport(libraryCsv);
    assert.ok(rows.length > 0);
  });
});
