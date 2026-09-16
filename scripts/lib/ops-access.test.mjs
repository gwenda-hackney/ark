import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accessAppBody,
  allowAuthenticatedPolicyBody,
  findAppForDomain,
  googleCallbackUrl,
  googleIdpBody,
  isAccessChallenge,
  parseEmailList,
} from "./ops-access.mjs";

describe("ops Access helpers", () => {
  it("parses allowlists", () => {
    assert.deepEqual(parseEmailList("a@x.com, B@Y.com"), [
      "a@x.com",
      "b@y.com",
    ]);
    assert.deepEqual(parseEmailList(""), []);
  });

  it("builds the Google callback from the team domain", () => {
    assert.equal(
      googleCallbackUrl("https://gwenda.cloudflareaccess.com/"),
      "https://gwenda.cloudflareaccess.com/cdn-cgi/access/callback",
    );
  });

  it("pins a self-hosted app to Google when an IdP id is known", () => {
    const body = accessAppBody({
      name: "Gwenda ops",
      domain: "gwenda-ops.pages.dev",
      googleIdpId: "idp-1",
    });
    assert.equal(body.type, "self_hosted");
    assert.deepEqual(body.allowed_idps, ["idp-1"]);
    assert.equal(body.auto_redirect_to_identity, true);
    assert.deepEqual(body.destinations, [
      { type: "public", uri: "gwenda-ops.pages.dev" },
    ]);
  });

  it("builds an allow policy for anyone who authenticates at Google", () => {
    const policy = allowAuthenticatedPolicyBody();
    assert.equal(policy.decision, "allow");
    assert.equal(policy.name, "Allow Google");
    assert.deepEqual(policy.include, [{ everyone: {} }]);
  });

  it("detects an Access login redirect", () => {
    assert.equal(
      isAccessChallenge(
        302,
        "https://gwenda.cloudflareaccess.com/cdn-cgi/access/login",
      ),
      true,
    );
    assert.equal(isAccessChallenge(302, "/cdn-cgi/access/login"), true);
    assert.equal(isAccessChallenge(200, "https://gwenda-ops.pages.dev/"), false);
    assert.equal(isAccessChallenge(302, "https://example.com/"), false);
  });

  it("matches existing apps by domain", () => {
    const apps = [
      { name: "Other", domain: "other.pages.dev" },
      {
        name: "Previews",
        destinations: [{ type: "public", uri: "*.gwenda-ops.pages.dev" }],
      },
    ];
    assert.equal(
      findAppForDomain(apps, "*.gwenda-ops.pages.dev")?.name,
      "Previews",
    );
  });

  it("shapes the Google IdP payload", () => {
    assert.deepEqual(googleIdpBody({ clientId: "id", clientSecret: "sec" }), {
      name: "Google",
      type: "google",
      config: { client_id: "id", client_secret: "sec" },
    });
  });
});
