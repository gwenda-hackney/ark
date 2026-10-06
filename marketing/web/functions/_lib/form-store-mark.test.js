import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryFormSubmissionRepository } from "../../../../shared/guests/adapters/memory-form-submissions.js";

vi.mock("../../../../shared/forms/form-alert.js", () => ({
  reportFormError: vi.fn(async () => undefined),
}));

const {
  markFormSubmissionEmailSent,
  readableUpstreamDetail,
  saveFormEditLink,
} = await import("./form-store.js");
const { reportFormError } =
  await import("../../../../shared/forms/form-alert.js");

const baserowError = (status, message) =>
  Object.assign(new Error(message), { status });

let repo;
let env;
beforeEach(async () => {
  repo = memoryFormSubmissionRepository();
  env = { formSubmissionRepository: repo };
  await repo.create({ formSlug: "play" });
});
afterEach(() => vi.clearAllMocks());

describe("markFormSubmissionEmailSent", () => {
  it("retries once when storage has a server error", async () => {
    const real = repo.update;
    const update = vi
      .spyOn(repo, "update")
      .mockRejectedValueOnce(
        baserowError(502, "Baserow 500: <!doctype html><h1>Server Error</h1>"),
      )
      .mockImplementation(real);
    const result = await markFormSubmissionEmailSent(
      env,
      "1",
      "notify",
      "2026-09-25T08:00:00Z",
    );
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
    expect((await repo.get(1)).notifySentAt).toBe("2026-09-25T08:00:00Z");
    expect(reportFormError).not.toHaveBeenCalled();
  });

  it("does not retry a client error and reports it", async () => {
    const update = vi
      .spyOn(repo, "update")
      .mockRejectedValue(baserowError(400, "Baserow 400: bad field"));
    const result = await markFormSubmissionEmailSent(env, "1", "receipt");
    expect(result.ok).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(reportFormError).toHaveBeenCalledWith(
      env,
      "form_store_failed",
      expect.objectContaining({ op: "mark_receipt_sent", status: 400 }),
    );
  });
});

describe("saveFormEditLink", () => {
  const link = "https://gwenda.co.uk/contact/edit?t=abc.def";

  it("saves the receipt's edit link on the submission for ops", async () => {
    expect((await saveFormEditLink(env, "1", link)).ok).toBe(true);
    expect((await repo.get(1)).editLink).toBe(link);
  });

  it("skips quietly while storage can't keep the link yet", async () => {
    vi.spyOn(repo, "capabilities").mockResolvedValue({ editLink: false });
    const update = vi.spyOn(repo, "update");
    const result = await saveFormEditLink(env, "1", link);
    expect(result).toMatchObject({ ok: false, skipped: true });
    expect(update).not.toHaveBeenCalled();
    expect(reportFormError).not.toHaveBeenCalled();
  });

  it("reports a failed save without throwing", async () => {
    vi.spyOn(repo, "update").mockRejectedValue(
      baserowError(400, "Baserow 400: bad field"),
    );
    const result = await saveFormEditLink(env, "1", link);
    expect(result.ok).toBe(false);
    expect(reportFormError).toHaveBeenCalledWith(
      env,
      "form_store_failed",
      expect.objectContaining({ op: "save_edit_link" }),
    );
  });
});

describe("readableUpstreamDetail", () => {
  it("replaces HTML error pages with a short line", () => {
    expect(readableUpstreamDetail(500, "<!doctype html><html>...</html>")).toBe(
      "Baserow server error (500).",
    );
    expect(readableUpstreamDetail(400, "field missing")).toBe("field missing");
  });
});
