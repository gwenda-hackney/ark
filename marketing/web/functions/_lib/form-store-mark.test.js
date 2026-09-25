import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./baserow.js", () => ({
  baserowFormSubmissionRowsUrl: async () => ({
    ok: true,
    apiKey: "k",
    fieldsUrl: "https://baserow.test/fields/",
    rowUrl: (id) => `https://baserow.test/rows/${id}/`,
  }),
}));
vi.mock("../../../../shared/forms/form-alert.js", () => ({ reportFormError: vi.fn(async () => undefined) }));

const { markFormSubmissionEmailSent, readableUpstreamDetail, resetEditLinkColumnForTests, saveFormEditLink } =
  await import("./form-store.js");
const { reportFormError } = await import("../../../../shared/forms/form-alert.js");

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

describe("saveFormEditLink", () => {
  const link = "https://gwenda.co.uk/contact/edit?t=abc.def";
  const columns = (names) =>
    new Response(JSON.stringify(names.map((name, id) => ({ id, name }))), { status: 200 });

  afterEach(() => resetEditLinkColumnForTests());

  it("saves the receipt's edit link on the row for ops", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(columns(["Form Slug", "Edit Link"]))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await saveFormEditLink({}, "7", link)).ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://baserow.test/rows/7/");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ "Edit Link": link });

    // The column is remembered: the next save goes straight to the row.
    await saveFormEditLink({}, "8", link);
    expect(fetchMock.mock.calls[2][0]).toBe("https://baserow.test/rows/8/");
  });

  it("skips quietly until the migration has added the column", async () => {
    const fetchMock = vi.fn().mockResolvedValue(columns(["Form Slug"]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await saveFormEditLink({}, "7", link);
    expect(result).toMatchObject({ ok: false, skipped: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reportFormError).not.toHaveBeenCalled();
  });

  it("reports a failed save without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(columns(["Edit Link"]))
        .mockResolvedValue(new Response("bad field", { status: 400 })),
    );
    const result = await saveFormEditLink({}, "7", link);
    expect(result.ok).toBe(false);
    expect(reportFormError).toHaveBeenCalledWith({}, "form_store_failed", expect.objectContaining({ op: "save_edit_link" }));
  });
});

describe("readableUpstreamDetail", () => {
  it("replaces HTML error pages with a short line", () => {
    expect(readableUpstreamDetail(500, "<!doctype html><html>...</html>")).toBe("Baserow server error (500).");
    expect(readableUpstreamDetail(400, "field missing")).toBe("field missing");
  });
});
