import { describe, expect, it, vi } from "vitest";
import {
  handleDeploy,
  handleStatus,
  isAuthorized,
  parseDeployTarget,
} from "../src/handler";

const env = {
  DEPLOY_WEBHOOK_SECRET: "test-secret",
  GITHUB_TOKEN: "gh_test",
  GITHUB_REPOSITORY: "gwenda-hackney/ark",
};

describe("parseDeployTarget", () => {
  it("accepts staging and production", () => {
    expect(parseDeployTarget({ target: "staging" })).toBe("staging");
    expect(parseDeployTarget({ target: "production" })).toBe("production");
  });

  it("rejects invalid targets", () => {
    expect(parseDeployTarget({ target: "live" } as never)).toBeNull();
    expect(parseDeployTarget(null)).toBeNull();
  });
});

describe("isAuthorized", () => {
  it("accepts bearer token", () => {
    const request = new Request("https://example.com/deploy", {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(isAuthorized(request, env)).toBe(true);
  });

  it("rejects missing or wrong secret", () => {
    const request = new Request("https://example.com/deploy");
    expect(isAuthorized(request, env)).toBe(false);
  });
});

describe("handleDeploy", () => {
  it("returns 401 when unauthorized", async () => {
    const request = new Request("https://example.com/deploy", {
      method: "POST",
      body: JSON.stringify({ target: "staging" }),
    });

    const result = await handleDeploy(request, env);
    expect(result.status).toBe(401);
  });

  it("returns 400 for invalid target", async () => {
    const request = new Request("https://example.com/deploy", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ target: "qa" }),
    });

    const result = await handleDeploy(request, env);
    expect(result.status).toBe(400);
  });
});

describe("handleStatus", () => {
  it("requires run_id", async () => {
    const request = new Request("https://example.com/status", {
      headers: { Authorization: "Bearer test-secret" },
    });

    const result = await handleStatus(request, env);
    expect(result.status).toBe(400);
  });
});

describe("github integration", () => {
  it("dispatches workflow for staging", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 99,
                  status: "queued",
                  conclusion: null,
                  html_url: "https://github.com/run/99",
                },
              ],
            }),
          ),
        ),
    );

    const { dispatchContentDeploy } = await import("../src/github");
    const run = await dispatchContentDeploy(env, "staging");

    expect(run.id).toBe(99);
    vi.unstubAllGlobals();
  });
});
