import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  fetchFormSubmission: vi.fn(async () => ({ ok: true, submission: { id: 7 } })),
  deleteFormSubmission: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./form-submit.js", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchFormForSubmit: mocks.fetchFormForSubmit,
}));

import { SMOKE_FORMS, runFormSmoke, smokeAnswers } from "./form-smoke.js";
import { deleteFormSubmission, upsertFormSubmission } from "./form-store.js";
import { validateFormAnswers } from "./form-submit.js";
import {
  FORM_SMOKE_ANSWER,
  isSmokeFormSubmission,
} from "../../../../shared/smoke-test.js";

/**
 * The party form as the website reads it (migrations/2026-11-11-party-form.mjs
 * made it): what it requires, and some of what it doesn't.
 */
const PARTY_SLUG = "party";
const party = {
  title: "Party enquiry",
  slug: PARTY_SLUG,
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone / WhatsApp", type: "tel" },
    {
      key: "occasion",
      label: "What’s the occasion?",
      type: "select",
      options: [{ label: "Birthday", value: "Birthday" }],
    },
    { key: "date", label: "Preferred date", type: "date", required: true },
    { key: "secondDate", label: "Second choice", type: "date" },
    { key: "people", label: "How many people", type: "number", required: true },
    { key: "message", label: "Tell us more", type: "textarea" },
  ],
};

beforeEach(() => vi.clearAllMocks());

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

  it("answers the party form: a date ahead of the day it runs, and a head count", () => {
    const required = ["name", "email", "date", "people"];
    for (const now of ["2026-11-11T12:00:00Z", "2027-12-31T23:30:00Z"]) {
      const today = now.slice(0, 10);
      const answers = smokeAnswers(party, "alerts@gwenda.co.uk", {
        now: new Date(now),
      });
      expect(Object.keys(answers).sort()).toEqual([...required].sort());
      expect(answers.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(answers.date > today).toBe(true);
      expect(answers.people).toBe("2");
      const validated = validateFormAnswers(party, answers, { today });
      expect(validated.ok).toBe(true);
      // What a copy of the data leaves behind as a test row.
      expect(
        isSmokeFormSubmission({
          replyTo: "alerts@gwenda.co.uk",
          answers: validated.answers,
        }),
      ).toBe(true);
    }
  });

  it("says it is a test even when no text question is required", () => {
    const form = {
      fields: [
        { key: "email", type: "email", required: true },
        { key: "date", type: "date", required: true },
        { key: "notes", type: "textarea" },
      ],
    };
    expect(smokeAnswers(form, "alerts@gwenda.co.uk").notes).toBe(
      FORM_SMOKE_ANSWER,
    );
  });
});

describe("SMOKE_FORMS", () => {
  it("tests the play form and the party form", () => {
    expect(SMOKE_FORMS.map((form) => form.slug)).toEqual(["play", PARTY_SLUG]);
  });

  it("waits only for a migration that is still there to run", () => {
    for (const { slug, createdBy } of SMOKE_FORMS) {
      if (!createdBy) continue;
      const file = new URL(
        `../../../../migrations/${createdBy}`,
        import.meta.url,
      );
      expect(
        existsSync(file),
        `${createdBy} is gone, so "${slug}" exists everywhere: take createdBy off it in SMOKE_FORMS`,
      ).toBe(true);
    }
  });
});

describe("runFormSmoke", () => {
  it("marks both emails Smoke test: so mail filters can file them", async () => {
    mocks.fetchFormForSubmit.mockResolvedValue({ ...play, slug: "play" });
    await runFormSmoke(
      { ALERT_EMAIL: "alerts@gwenda.co.uk" },
      { slug: "play" },
    );
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

  it("sends the party form's emails to alerts@, never to enquiries@", async () => {
    mocks.fetchFormForSubmit.mockResolvedValue({
      ...party,
      notifyEmail: "enquiries@gwenda.co.uk",
      fromEmail: "enquiries@gwenda.co.uk",
      replyToEmail: "enquiries@gwenda.co.uk",
    });
    const detail = await runFormSmoke({}, { slug: PARTY_SLUG });
    expect(mocks.fetchFormForSubmit).toHaveBeenCalledWith({}, PARTY_SLUG);
    expect(mocks.sendFormNotificationEmail.mock.calls[0][1]).toMatchObject({
      to: "alerts@gwenda.co.uk",
      subjectPrefix: "Smoke test: ",
    });
    expect(mocks.sendFormReceiptEmail.mock.calls[0][1]).toMatchObject({
      email: "alerts@gwenda.co.uk",
      editUrl: "https://gwenda.co.uk/contact/party",
      subjectPrefix: "Smoke test: ",
    });
    expect(deleteFormSubmission).toHaveBeenCalledWith(expect.anything(), 7);
    expect(detail).toBe(
      '"Party enquiry" saved, both emails sent to alerts@gwenda.co.uk, test row deleted',
    );
  });

  it("fails for a form that is missing or switched off", async () => {
    mocks.fetchFormForSubmit.mockResolvedValue(null);
    await expect(runFormSmoke({}, { slug: "play" })).rejects.toThrow(
      'Form "play" not found or disabled.',
    );
  });

  it("waits, without saving or sending, for a form its migration has yet to make", async () => {
    mocks.fetchFormForSubmit.mockResolvedValue(null);
    const result = await runFormSmoke(
      {},
      { slug: PARTY_SLUG, createdBy: "2026-11-11-party-form.mjs" },
    );
    expect(result).toMatchObject({ pending: true, form: PARTY_SLUG });
    expect(result.detail).toContain("2026-11-11-party-form.mjs");
    expect(upsertFormSubmission).not.toHaveBeenCalled();
    expect(mocks.sendFormNotificationEmail).not.toHaveBeenCalled();
  });
});
