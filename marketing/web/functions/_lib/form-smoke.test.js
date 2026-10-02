import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendFormNotificationEmail: vi.fn(async () => ({ ok: true })),
  sendFormReceiptEmail: vi.fn(async () => ({ ok: true })),
  fetchFormForSubmit: vi.fn(),
}));
vi.mock("../../../../shared/forms/form-email.js", () => ({
  sendFormNotificationEmail: mocks.sendFormNotificationEmail,
  sendFormReceiptEmail: mocks.sendFormReceiptEmail,
}));
vi.mock("./form-store.js", () => ({
  FORM_STATUS_VERIFIED: "verified",
  upsertFormSubmission: vi.fn(async () => ({ ok: true, rowId: 7 })),
  markFormSubmissionEmailSent: vi.fn(async () => ({ ok: true })),
  fetchFormSubmissionRow: vi.fn(async () => ({ id: 7 })),
  deleteFormSubmission: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./form-submit.js", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchFormForSubmit: mocks.fetchFormForSubmit,
}));

import { runFormSmoke, smokeAnswers } from "./form-smoke.js";
import { deleteFormSubmission } from "./form-store.js";
import { validateFormAnswers } from "./form-submit.js";

const play = {
  title: "Play at Gwenda",
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel" },
    {
      key: "whatYouDo",
      label: "What",
      type: "multiSelect",
      required: true,
      options: [
        { label: "Other", value: "other" },
        { label: "DJ", value: "dj" },
      ],
    },
    { key: "musicLink", label: "Link", type: "url", required: true },
    {
      key: "basedWhere",
      label: "Where",
      type: "select",
      required: true,
      options: [{ label: "London" }],
    },
    { key: "description", label: "About", type: "textarea", required: true },
  ],
};

describe("smokeAnswers", () => {
  it("fills every required field with values the real validator accepts", () => {
    const answers = smokeAnswers(play, "alerts@gwenda.co.uk");
    expect(answers.email).toBe("alerts@gwenda.co.uk");
    expect(answers.whatYouDo).toEqual(["dj"]);
    expect(answers.basedWhere).toBe("London");
    expect(answers.phone).toBeUndefined();
    expect(validateFormAnswers(play, answers).ok).toBe(true);
  });
});

describe("runFormSmoke", () => {
  it("marks both emails Smoke test: so mail filters can file them", async () => {
    mocks.fetchFormForSubmit.mockResolvedValue({ ...play, slug: "play" });
    await runFormSmoke({ ALERT_EMAIL: "alerts@gwenda.co.uk" });
    expect(mocks.sendFormNotificationEmail.mock.calls[0][1]).toMatchObject({
      to: "alerts@gwenda.co.uk",
      subjectPrefix: "Smoke test: ",
    });
    expect(mocks.sendFormReceiptEmail.mock.calls[0][1]).toMatchObject({
      email: "alerts@gwenda.co.uk",
      subjectPrefix: "Smoke test: ",
    });
    expect(deleteFormSubmission).toHaveBeenCalledWith(expect.anything(), 7);
  });
});
