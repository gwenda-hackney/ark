import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchFormSubmissionRow: vi.fn(),
  markFormSubmissionEmailSent: vi.fn(),
  fetchFormForSubmit: vi.fn(),
  sendFormNotificationEmail: vi.fn(),
  sendFormReceiptEmail: vi.fn(),
}));

vi.mock("../../../_lib/form-store.js", () => ({
  FORM_EMAIL_SENT_FIELDS: { notify: "Notify Sent", receipt: "Receipt Sent" },
  fetchFormSubmissionRow: mocks.fetchFormSubmissionRow,
  markFormSubmissionEmailSent: mocks.markFormSubmissionEmailSent,
  parseFormSubmissionAnswers: () => [
    { key: "email", label: "Email", value: "alex@example.com" },
  ],
}));
vi.mock("../../../_lib/form-submit.js", () => ({
  fetchFormForSubmit: mocks.fetchFormForSubmit,
}));
vi.mock("../../../_lib/form-email.js", () => ({
  sendFormNotificationEmail: mocks.sendFormNotificationEmail,
  sendFormReceiptEmail: mocks.sendFormReceiptEmail,
}));

import { onRequestPost } from "./resend.js";

const env = { FORMS_ADMIN_SECRET: "s3cret", SUBSCRIBE_SECRET: "sub" };

function post(body, secret = "s3cret") {
  return onRequestPost({
    env,
    request: new Request("http://localhost:4321/api/forms/admin/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  });
}

describe("POST /api/forms/admin/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchFormSubmissionRow.mockResolvedValue({
      ok: true,
      row: { id: 501, "Form Slug": "play", "Reply To": "alex@example.com" },
    });
    mocks.fetchFormForSubmit.mockResolvedValue({ slug: "play", title: "Play" });
    mocks.markFormSubmissionEmailSent.mockResolvedValue({
      ok: true,
      sentAt: "2026-09-24T10:00:00.000Z",
    });
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await post({ rowId: "501", kind: "notify" }, null)).status).toBe(
      401,
    );
    expect((await post({ rowId: "501", kind: "notify" }, "nope")).status).toBe(
      401,
    );
    expect(mocks.fetchFormSubmissionRow).not.toHaveBeenCalled();
  });

  it("rejects unknown kinds", async () => {
    expect((await post({ rowId: "501", kind: "verify" })).status).toBe(400);
  });

  it("resends the notify email and stamps the row", async () => {
    mocks.sendFormNotificationEmail.mockResolvedValue({ ok: true });
    const res = await post({ rowId: "501", kind: "notify" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      sentAt: "2026-09-24T10:00:00.000Z",
    });
    expect(mocks.markFormSubmissionEmailSent).toHaveBeenCalledWith(
      env,
      "501",
      "notify",
    );
  });

  it("resends the receipt to the reply-to address with an edit link", async () => {
    mocks.sendFormReceiptEmail.mockResolvedValue({ ok: true });
    await post({ rowId: "501", kind: "receipt" });
    const [, args] = mocks.sendFormReceiptEmail.mock.calls[0];
    expect(args.email).toBe("alex@example.com");
    expect(args.editUrl).toMatch(/^http:\/\/localhost:4321\/contact\/edit\?t=/);
  });

  it("does not stamp the row on a dry run or failure", async () => {
    mocks.sendFormNotificationEmail.mockResolvedValueOnce({
      ok: true,
      dryRun: true,
    });
    expect(await (await post({ rowId: "501", kind: "notify" })).json()).toEqual(
      {
        ok: true,
        dryRun: true,
      },
    );
    mocks.sendFormNotificationEmail.mockResolvedValueOnce({
      ok: false,
      error: "boom",
    });
    expect((await post({ rowId: "501", kind: "notify" })).status).toBe(502);
    expect(mocks.markFormSubmissionEmailSent).not.toHaveBeenCalled();
  });
});
