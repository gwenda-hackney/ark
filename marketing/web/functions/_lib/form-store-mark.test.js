import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./baserow.js", () => ({
  baserowFormSubmissionRowsUrl: async () => ({
    ok: true,
    apiKey: "k",
    rowUrl: (id) => `https://baserow.test/rows/${id}/`,
  }),
}));
vi.mock("./form-alert.js", () => ({ reportFormError: vi.fn(async () => undefined) }));

const { markFormSubmissionEmailSent, readableUpstreamDetail } = await import("./form-store.js");
const { reportFormError } = await import("./form-alert.js");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("markFormSubmissionEmailSent", () => {
  it("retries once when Baserow has a server error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<!doctype html><h1>Server Error (500)</h1>", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await markFormSubmissionEmailSent({}, "7", "notify", "2026-09-25T08:00:00Z");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reportFormError).not.toHaveBeenCalled();
  });

  it("does not retry a client error and reports it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad field", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await markFormSubmissionEmailSent({}, "7", "receipt");
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("readableUpstreamDetail", () => {
  it("replaces HTML error pages with a short line", () => {
    expect(readableUpstreamDetail(500, "<!doctype html><html>...</html>")).toBe("Baserow server error (500).");
    expect(readableUpstreamDetail(400, "field missing")).toBe("field missing");
  });
});
