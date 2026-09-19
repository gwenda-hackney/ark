import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCloudflareDevToken } from "./cloudflare-tokens.mjs";

describe("cloudflare tokens", () => {
  it("prefers CLOUDFLARE_DEV_API_TOKEN over the legacy alias", () => {
    assert.equal(
      resolveCloudflareDevToken({
        CLOUDFLARE_DEV_API_TOKEN: "dev",
        CLOUDFLARE_API_TOKEN: "legacy",
      }),
      "dev",
    );
  });

  it("falls back to CLOUDFLARE_API_TOKEN for existing .env files", () => {
    assert.equal(
      resolveCloudflareDevToken({ CLOUDFLARE_API_TOKEN: "legacy" }),
      "legacy",
    );
  });
});
