import { describe, expect, it, vi } from "vitest";
import {
  callerEnvironment,
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
  it("accepts preview, the old staging name, and production", () => {
    expect(parseDeployTarget({ target: "preview" })).toBe("preview");
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
      body: JSON.stringify({ target: "preview" }),
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

  it("refuses production deploys", async () => {
    const request = new Request("https://example.com/deploy", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ target: "production" }),
    });
    const result = await handleDeploy(request, env);
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toContain("Website > Release");
  });

  it("builds nothing for prod ops still asking for the old staging site", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://example.com/deploy", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ target: "staging" }),
    });
    const result = await handleDeploy(request, env);
    expect(result.status).toBe(202);
    expect(result.body.skipped).toBe("retired");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rebuilds prod's preview from main's web.yml", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 91,
                status: "in_progress",
                conclusion: null,
                html_url: "https://github.com/run/91",
                path: ".github/workflows/web.yml",
                name: "preview",
                display_title: "preview",
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://example.com/deploy", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ target: "preview" }),
    });
    const result = await handleDeploy(request, env);
    expect(result.body.target).toBe("preview");
    expect(result.body.runId).toBe(91);
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(String(init.body))).toEqual({ ref: "release", inputs: { action: "preview" } });
    vi.unstubAllGlobals();
  });
});

describe("handlePromote", () => {
  it("dispatches the live build without a preview run", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ workflow_runs: [] })),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 88,
                  status: "in_progress",
                  conclusion: null,
                  html_url: "https://github.com/run/88",
                  path: ".github/workflows/web-promote.yml",
                  name: "promote-release-to-production",
                  display_title: "promote-release-to-production",
                },
              ],
            }),
          ),
        ),
    );

    const request = new Request("https://example.com/promote", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ kind: "to-production" }),
    });
    const result = await handlePromote(request, env);
    expect(result.status).toBe(202);
    expect(result.body.runId).toBe(88);
    vi.unstubAllGlobals();
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

  it("returns previewUrl for a successful preview build", async () => {
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
            name: "preview",
            display_title: "preview",
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
    expect(result.body.previewUrl).toBe("https://preview.gwenda-blue.pages.dev");
    expect(result.body.previewRunId).toBe(55);

    vi.unstubAllGlobals();
  });
});

describe("github integration", () => {
  it("dispatches workflow for the preview", async () => {
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
                  name: "preview",
                  display_title: "preview",
                },
              ],
            }),
          ),
        ),
    );

    const { dispatchContentDeploy } = await import("../src/github");
    const run = await dispatchContentDeploy(env, "preview");

    expect(run.id).toBe(99);

    const [dispatchUrl, dispatchInit] = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [string, RequestInit];
    const headers = new Headers(dispatchInit.headers);
    expect(headers.get("User-Agent")).toBe("gwenda-site-deploy-webhook");
    expect(dispatchUrl).toContain("web.yml");
    const body = JSON.parse(String(dispatchInit.body));
    expect(body.inputs.action).toBe("preview");

    vi.unstubAllGlobals();
  });

  it("dispatches promote from release without a preview id", async () => {
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
                  name: "promote-release-to-production",
                  display_title: "promote-release-to-production",
                },
              ],
            }),
          ),
        ),
    );

    const { dispatchLivePromote } = await import("../src/github");
    const run = await dispatchLivePromote(env);
    expect(run.id).toBe(77);

    const [dispatchUrl, dispatchInit] = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [string, RequestInit];
    expect(dispatchUrl).toContain("web-promote.yml");
    const body = JSON.parse(String(dispatchInit.body));
    expect(body).toEqual({ ref: "release", inputs: { reason: "content" } });

    vi.unstubAllGlobals();
  });
});

describe("dev website builds", () => {
  function devRun(id: number, title: string) {
    return {
      id,
      status: "in_progress",
      conclusion: null,
      html_url: `https://github.com/run/${id}`,
      path: ".github/workflows/web.yml",
      name: title,
      display_title: title,
    };
  }

  it("dev ops' Update website now rebuilds the dev site from main, never promotes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [devRun(77, "dev-live")] })));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://example.com/promote", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ kind: "to-production", env: "dev" }),
    });
    const result = await handlePromote(request, env);
    expect(result.status).toBe(202);
    expect(result.body.target).toBe("dev-live");
    expect(result.body.runId).toBe(77);
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toContain("/actions/workflows/web.yml/dispatches");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main", inputs: { action: "dev-live" } });
    vi.unstubAllGlobals();
  });

  it("a dev preview rebuild joins one already running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ workflow_runs: [devRun(78, "dev-preview")] })),
      ),
    );
    const request = new Request("https://example.com/deploy", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ target: "preview", env: "dev" }),
    });
    const result = await handleDeploy(request, env);
    expect(result.body.target).toBe("dev-preview");
    expect(result.body.alreadyRunning).toBe(true);
    expect(result.body.runId).toBe(78);
    vi.unstubAllGlobals();
  });
});

describe("dev ops' own secret (#120)", () => {
  const split = { ...env, DEPLOY_WEBHOOK_SECRET_DEV: "dev-secret" };
  const devAuth = { Authorization: "Bearer dev-secret" };
  const run = (id: number, title: string, path = ".github/workflows/web.yml") => ({
    id,
    status: "in_progress",
    conclusion: null,
    html_url: `https://github.com/run/${id}`,
    path,
    name: title,
    display_title: title,
  });

  it("knows whose secret it is", () => {
    const withSecret = (secret: string) => new Request("https://x/", { headers: { Authorization: `Bearer ${secret}` } });
    expect(callerEnvironment(withSecret("test-secret"), split)).toBe("production");
    expect(callerEnvironment(withSecret("dev-secret"), split)).toBe("dev");
    expect(callerEnvironment(withSecret("dev-secret"), env)).toBeNull();
    expect(isAuthorized(withSecret("dev-secret"), split)).toBe(false);
  });

  it("can't start a live promote, even when it asks for production", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [run(78, "dev-live")] })));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://x/promote", {
      method: "POST",
      headers: devAuth,
      body: JSON.stringify({ kind: "to-production" }),
    });
    const result = await handlePromote(request, split);
    expect(result.body.target).toBe("dev-live");
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toContain("/web.yml/dispatches");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main", inputs: { action: "dev-live" } });
    vi.unstubAllGlobals();
  });

  it("can't rebuild prod's preview: it gets the dev preview", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [run(79, "dev-preview")] })));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://x/deploy", {
      method: "POST",
      headers: devAuth,
      body: JSON.stringify({ target: "preview" }),
    });
    const result = await handleDeploy(request, split);
    expect(result.body.target).toBe("dev-preview");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).inputs).toEqual({ action: "dev-preview" });
    vi.unstubAllGlobals();
  });
});
