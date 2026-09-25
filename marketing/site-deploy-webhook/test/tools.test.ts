import { afterEach, describe, expect, it, vi } from "vitest";
import { handleBaserowCopy, handleCompare } from "../src/tools";

const env = {
  DEPLOY_WEBHOOK_SECRET: "test-secret",
  GITHUB_TOKEN: "gh_test",
  GITHUB_REPOSITORY: "gwenda-hackney/ark",
};
const auth = { Authorization: "Bearer test-secret" };

afterEach(() => vi.unstubAllGlobals());

describe("handleCompare", () => {
  it("rejects unauthorized and non-SHA input", async () => {
    const noAuth = await handleCompare(new Request("https://x/compare?base=abc1234&head=def5678"), env);
    expect(noAuth.status).toBe(401);
    const bad = await handleCompare(
      new Request("https://x/compare?base=main&head=def5678", { headers: auth }),
      env,
    );
    expect(bad.status).toBe(400);
  });

  it("returns commits newest first with one-line messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status: "ahead",
          ahead_by: 2,
          behind_by: 0,
          html_url: "https://github.com/c",
          files: [{ filename: "a" }],
          commits: [
            { sha: "1", html_url: "u1", commit: { message: "Old\n\nbody", author: { name: "A" } } },
            { sha: "2", html_url: "u2", commit: { message: "New", author: { name: "B" } } },
          ],
        }),
      ),
    );
    const result = await handleCompare(
      new Request("https://x/compare?base=abc1234&head=def5678", { headers: auth }),
      env,
    );
    expect(result.status).toBe(200);
    expect(result.body.aheadBy).toBe(2);
    expect((result.body.commits as { message: string }[]).map((c) => c.message)).toEqual([
      "New",
      "Old",
    ]);
  });
});

describe("handleBaserowCopy", () => {
  it("only accepts the two known targets", async () => {
    const result = await handleBaserowCopy(
      new Request("https://x/baserow-copy", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ target: "production" }),
      }),
      env,
    );
    expect(result.status).toBe(400);
  });

  it("dispatches the copy workflow on main with the target", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({ workflow_runs: [{ id: 7, status: "queued", html_url: "run7" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const pending = handleBaserowCopy(
      new Request("https://x/baserow-copy", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ target: "ops-dev" }),
      }),
      env,
    );
    await vi.advanceTimersByTimeAsync(1600);
    const result = await pending;
    vi.useRealTimers();
    expect(result.status).toBe(202);
    expect(result.body.runId).toBe(7);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/actions/workflows/baserow-copy.yml/dispatches");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main", inputs: { target: "ops-dev" } });
  });
});

describe("runOpsTick", () => {
  it("posts to the ops tick with the shared secret", async () => {
    const { runOpsTick } = await import("../src/index");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await runOpsTick({ ...env, OPS_URL: "https://ops.example/" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ops.example/api/web/tick");
    expect(init.headers.Authorization).toBe("Bearer test-secret");
  });

  it("does nothing without OPS_URL", async () => {
    const { runOpsTick } = await import("../src/index");
    expect(await runOpsTick(env)).toBeNull();
  });
});
