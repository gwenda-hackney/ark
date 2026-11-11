import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCompare, handleDevCopy } from "../src/tools";

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

/** Dispatch `target` and return what was sent to GitHub. */
async function dispatched(path: string, target: string) {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      Response.json({ workflow_runs: [{ id: 7, status: "queued", html_url: "run7" }] }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const pending = handleDevCopy(
    new Request(`https://x${path}`, { method: "POST", headers: auth, body: JSON.stringify({ target }) }),
    env,
  );
  await vi.advanceTimersByTimeAsync(1600);
  const result = await pending;
  vi.useRealTimers();
  const [url, init] = fetchMock.mock.calls[0];
  return { result, url: String(url), body: JSON.parse(String(init.body)) };
}

describe("handleDevCopy", () => {
  it("only accepts the known targets", async () => {
    const result = await handleDevCopy(
      new Request("https://x/dev-copy", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ target: "production" }),
      }),
      env,
    );
    expect(result.status).toBe(400);
  });

  it("dispatches the copy workflow on release with the target", async () => {
    const { result, url, body } = await dispatched("/dev-copy", "everything");
    expect(result.status).toBe(202);
    expect(result.body.runId).toBe(7);
    expect(url).toContain("/actions/workflows/copy-prod-to-dev.yml/dispatches");
    expect(body).toEqual({ ref: "release", inputs: { target: "everything" } });
  });

  it("maps the targets older ops sends to /baserow-copy", async () => {
    const { result, body } = await dispatched("/baserow-copy", "website-dev");
    expect(result.body.target).toBe("website-data");
    expect(body.inputs).toEqual({ target: "website-data" });
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

  it("rejects when ops fails, for the cron monitor, without logging an error", async () => {
    const { runOpsTick } = await import("../src/index");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error code: 1102", { status: 503 })));
    const errors = vi.spyOn(console, "error");
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runOpsTick({ ...env, OPS_URL: "https://ops.example" })).rejects.toThrow(
      "ops tick failed for https://ops.example (503): error code: 1102",
    );
    expect(errors).not.toHaveBeenCalled();
    expect(warns).toHaveBeenCalled();
    errors.mockRestore();
    warns.mockRestore();
  });

  it("does nothing without OPS_URL", async () => {
    const { runOpsTick } = await import("../src/index");
    expect(await runOpsTick(env)).toBeNull();
  });
});

describe("dev ops' own secret (#120)", () => {
  const split = { ...env, DEPLOY_WEBHOOK_SECRET_DEV: "dev-secret" };

  it("can't start a copy to dev, which reads production", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await handleDevCopy(
      new Request("https://x/dev-copy", {
        method: "POST",
        headers: { Authorization: "Bearer dev-secret" },
        body: JSON.stringify({ target: "everything" }),
      }),
      split,
    );
    expect(result.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("may compare code, which only reads", async () => {
    const noSha = await handleCompare(
      new Request("https://x/compare?base=main&head=def5678", { headers: { Authorization: "Bearer dev-secret" } }),
      split,
    );
    expect(noSha.status).toBe(400);
  });
});
