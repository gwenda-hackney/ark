import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryFormSubmissionRepository } from "../../../../shared/guests/adapters/memory-form-submissions.js";

vi.mock("../../../../shared/forms/form-alert.js", () => ({
  reportFormError: vi.fn(async () => undefined),
}));

const {
  draftAnswersFromSubmission,
  fetchFormSubmission,
  findFormSubmissionByEmail,
  markFormSubmissionEmailSent,
  markFormSubmissionVerified,
  storeFormSubmission,
  updateFormSubmissionEmail,
  upsertFormSubmission,
} = await import("./form-store.js");
const { reportFormError } =
  await import("../../../../shared/forms/form-alert.js");

const play = {
  title: "Play",
  slug: "play",
  fields: [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
  ],
};

const answers = (name, email = "alex@example.com") => [
  { key: "name", label: "Name", value: name },
  { key: "email", label: "Email", value: email },
];

let repo;
let env;
beforeEach(() => {
  vi.clearAllMocks();
  repo = memoryFormSubmissionRepository();
  env = { formSubmissionRepository: repo };
});

describe("storeFormSubmission", () => {
  it("saves a current record with its metadata and answers", async () => {
    const result = await storeFormSubmission(env, {
      form: play,
      answers: answers("Alex", "Alex@Example.com"),
      rawAnswers: { name: "Alex", email: "Alex@Example.com" },
      submittedAt: "2026-09-17T18:00:00.000Z",
    });
    expect(result).toEqual({ ok: true, rowId: "1", updated: false });
    expect(await repo.get(1)).toMatchObject({
      formSlug: "play",
      formTitle: "Play",
      submittedAt: "2026-09-17T18:00:00.000Z",
      replyTo: "alex@example.com",
      status: "Verified",
      current: true,
      answers: {
        v: 1,
        entries: answers("Alex"),
        raw: { name: "Alex", email: "alex@example.com" },
      },
    });
  });

  it("stores Pending when asked", async () => {
    await storeFormSubmission(env, {
      form: play,
      answers: answers("Alex"),
      status: "Pending",
    });
    expect((await repo.get(1)).status).toBe("Pending");
  });

  it("says it could not save, and alerts, when storage fails", async () => {
    vi.spyOn(repo, "create").mockRejectedValue(
      Object.assign(new Error("Baserow 500: boom"), { status: 502 }),
    );
    const result = await storeFormSubmission(env, {
      form: play,
      answers: answers("Alex"),
    });
    expect(result).toEqual({ ok: false, error: "Could not save. Try again?" });
    expect(reportFormError).toHaveBeenCalledWith(
      env,
      "form_store_failed",
      expect.objectContaining({ op: "write", slug: "play", status: 502 }),
    );
  });
});

describe("findFormSubmissionByEmail", () => {
  it("prefers the current record over an older one, in any case", async () => {
    await repo.create({
      formSlug: "play",
      replyTo: "alex@example.com",
      status: "Verified",
      submittedAt: "2026-09-17T12:00:00.000Z",
    });
    const latest = await repo.create({
      formSlug: "play",
      replyTo: "alex@example.com",
      status: "Pending",
      current: true,
      submittedAt: "2026-09-17T18:00:00.000Z",
    });
    const result = await findFormSubmissionByEmail(env, {
      slug: "play",
      email: "Alex@Example.com",
    });
    expect(result.ok).toBe(true);
    expect(result.submission.id).toBe(latest.id);
    expect(result.matches).toHaveLength(2);
  });
});

describe("upsertFormSubmission", () => {
  it("changes a pending record in place on resubmit", async () => {
    await upsertFormSubmission(env, {
      form: play,
      answers: answers("Alex"),
      status: "Pending",
    });
    const result = await upsertFormSubmission(env, {
      form: play,
      answers: answers("Alexandra"),
      status: "Pending",
    });
    expect(result).toMatchObject({ ok: true, rowId: "1", updated: true });
    expect(result.changes).toEqual([
      {
        key: "name",
        label: "Name",
        from: "Alex",
        to: "Alexandra",
        kind: "text",
      },
    ]);
    expect(await repo.count()).toBe(1);
    expect((await repo.get(1)).answers).toEqual(answers("Alexandra"));
  });

  it("adds a new current record when a verified one is sent again", async () => {
    await upsertFormSubmission(env, { form: play, answers: answers("Alex") });
    const result = await upsertFormSubmission(env, {
      form: play,
      answers: answers("Alexandra"),
      rawAnswers: { name: "Alexandra", email: "alex@example.com" },
    });
    expect(result).toMatchObject({ ok: true, rowId: "2", updated: true });
    expect(result.previousAnswers).toEqual(answers("Alex"));
    expect((await repo.get(1)).current).toBe(false);
    expect(await repo.get(2)).toMatchObject({
      current: true,
      answers: { entries: answers("Alexandra") },
    });
  });
});

describe("confirming and correcting", () => {
  beforeEach(async () => {
    await storeFormSubmission(env, {
      form: play,
      answers: answers("Alex"),
      rawAnswers: { name: "Alex", email: "alex@example.com" },
      status: "Pending",
    });
  });

  it("marks a pending submission verified, once", async () => {
    const first = await markFormSubmissionVerified(
      env,
      "1",
      "alex@example.com",
    );
    expect(first).toMatchObject({ ok: true, already: false, formSlug: "play" });
    expect((await repo.get(1)).status).toBe("Verified");
    expect(await markFormSubmissionVerified(env, "1")).toMatchObject({
      ok: true,
      already: true,
    });
    expect(
      await markFormSubmissionVerified(env, "1", "someone@example.com"),
    ).toEqual({ ok: false, error: "This link isn't valid." });
  });

  it("fixes the email in the record and its answers", async () => {
    const result = await updateFormSubmissionEmail(env, "1", "Al@Example.com");
    expect(result.ok).toBe(true);
    const { submission } = await fetchFormSubmission(env, "1");
    expect(submission.replyTo).toBe("al@example.com");
    expect(draftAnswersFromSubmission(submission)).toEqual({
      name: "Alex",
      email: "al@example.com",
    });
  });

  it("says when there is no such submission", async () => {
    expect(await fetchFormSubmission(env, "99")).toEqual({
      ok: false,
      error: "Submission not found.",
    });
  });
});

describe("markFormSubmissionEmailSent", () => {
  it("stamps the matching email", async () => {
    await repo.create({ formSlug: "play" });
    const result = await markFormSubmissionEmailSent(
      env,
      "1",
      "receipt",
      "2026-09-24T10:00:00.000Z",
    );
    expect(result).toEqual({ ok: true, sentAt: "2026-09-24T10:00:00.000Z" });
    expect(await repo.get(1)).toMatchObject({
      receiptSentAt: "2026-09-24T10:00:00.000Z",
      notifySentAt: null,
    });
  });

  it("rejects unknown kinds without touching storage", async () => {
    const update = vi.spyOn(repo, "update");
    const result = await markFormSubmissionEmailSent(env, "1", "other");
    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
