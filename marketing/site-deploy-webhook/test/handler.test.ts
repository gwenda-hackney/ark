import { describe, expect, it, vi } from "vitest";
import {
  handleDeploy,
  handlePromote,
  handleStatus,
  isAuthorized,
  parseDeployTarget,
  parsePreviewRunId,
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

describe("parsePreviewRunId", () => {
  it("accepts numeric and string ids", () => {
    expect(parsePreviewRunId({ previewRunId: 42 })).toBe(42);
    expect(parsePreviewRunId({ previewRunId: "99" })).toBe(99);
  });

  it("rejects missing or invalid ids", () => {
    expect(parsePreviewRunId(null)).toBeNull();
    expect(parsePreviewRunId({ previewRunId: 0 })).toBeNull();
    expect(parsePreviewRunId({ previewRunId: "nope" })).toBeNull();
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

describe("handlePromote", () => {
  it("returns 400 without previewRunId", async () => {
    const request = new Request("https://example.com/promote", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({}),
    });

    const result = await handlePromote(request, env);
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

  it("returns previewUrl for successful production content preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 55,
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/run/55",
            path: ".github/workflows/web.yml",
            name: "production-content",
            display_title: "production-content",
          }),
        ),
      ),
    );

    const request = new Request("https://example.com/status?run_id=55", {
      headers: { Authorization: "Bearer test-secret" },
    });
    const result = await handleStatus(request, env);
    expect(result.status).toBe(200);
    expect(result.body.phase).toBe("preview");
    expect(result.body.previewUrl).toBe(
      "https://release-preview.gwenda-blue.pages.dev",
    );
    expect(result.body.previewRunId).toBe(55);

    vi.unstubAllGlobals();
  });
});

describe("github integration", () => {
  it("dispatches workflow for staging", async () => {
    vi.resetModules();
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
                  status: "in_progress",
                  conclusion: null,
                  html_url: "https://github.com/run/99",
                  path: ".github/workflows/web.yml",
                  name: "staging-content",
                  display_title: "staging-content",
                },
              ],
            }),
          ),
        ),
    );

    const { dispatchContentDeploy } = await import("../src/github");
    const run = await dispatchContentDeploy(env, "staging");

    expect(run.id).toBe(99);

    const [dispatchUrl, dispatchInit] = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [string, RequestInit];
    const headers = new Headers(dispatchInit.headers);
    expect(headers.get("User-Agent")).toBe("gwenda-site-deploy-webhook");
    expect(dispatchUrl).toContain("web.yml");
    const body = JSON.parse(String(dispatchInit.body));
    expect(body.inputs.action).toBe("staging-content");

    vi.unstubAllGlobals();
  });

  it("dispatches promote with kind=content and preview_run_id", async () => {
    vi.resetModules();
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
                  id: 77,
                  status: "in_progress",
                  conclusion: null,
                  html_url: "https://github.com/run/77",
                  path: ".github/workflows/web-promote.yml",
                  name: "promote-content",
                  display_title: "promote-content",
                },
              ],
            }),
          ),
        ),
    );

    const { dispatchContentPromote } = await import("../src/github");
    const run = await dispatchContentPromote(env, 55);
    expect(run.id).toBe(77);

    const [dispatchUrl, dispatchInit] = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [string, RequestInit];
    expect(dispatchUrl).toContain("web-promote.yml");
    const body = JSON.parse(String(dispatchInit.body));
    expect(body.inputs.kind).toBe("content");
    expect(body.inputs.preview_run_id).toBe("55");

    vi.unstubAllGlobals();
  });
});
