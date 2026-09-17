import { describe, expect, it } from "vitest";
import {
  formatFormEmail,
  replyToFromAnswers,
  validateFormAnswers,
} from "./form-submit.js";

const sampleForm = {
  title: "Play at Gwenda",
  slug: "play-at-gwenda",
  notifyEmail: "communityevent@gwenda.co.uk",
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    {
      key: "whatYouDo",
      label: "What do you do?",
      type: "multiSelect",
      required: true,
      options: [
        { label: "DJ", value: "DJ" },
        { label: "Live", value: "Live" },
      ],
    },
    {
      key: "basedWhere",
      label: "Where are you based?",
      type: "select",
      required: true,
      options: [
        { label: "Hackney", value: "Hackney" },
        { label: "London", value: "London" },
      ],
    },
    {
      key: "musicLink",
      label: "Link to your music",
      type: "url",
      required: false,
    },
  ],
};

describe("validateFormAnswers", () => {
  it("accepts a complete submission", () => {
    const result = validateFormAnswers(sampleForm, {
      name: "Alex",
      email: "alex@example.com",
      whatYouDo: ["DJ"],
      basedWhere: "Hackney",
      musicLink: "https://soundcloud.com/alex",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers.find((row) => row.key === "whatYouDo")?.value).toBe(
      "DJ",
    );
  });

  it("rejects missing required fields", () => {
    const result = validateFormAnswers(sampleForm, {
      name: "",
      email: "alex@example.com",
      whatYouDo: ["DJ"],
      basedWhere: "Hackney",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Name/);
  });

  it("rejects invalid email", () => {
    const result = validateFormAnswers(sampleForm, {
      name: "Alex",
      email: "not-an-email",
      whatYouDo: ["DJ"],
      basedWhere: "Hackney",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/email/i);
  });

  it("rejects invalid phone and accepts a handle-style instagram", () => {
    const form = {
      ...sampleForm,
      fields: [
        ...sampleForm.fields,
        { key: "phone", label: "Phone", type: "tel", required: false },
        {
          key: "instagram",
          label: "Instagram",
          type: "text",
          required: false,
        },
      ],
    };

    const badPhone = validateFormAnswers(form, {
      name: "Alex",
      email: "alex@example.com",
      whatYouDo: ["DJ"],
      basedWhere: "Hackney",
      phone: "12",
    });
    expect(badPhone.ok).toBe(false);

    const okInsta = validateFormAnswers(form, {
      name: "Alex",
      email: "alex@example.com",
      whatYouDo: ["DJ"],
      basedWhere: "Hackney",
      phone: "+44 7700 900123",
      instagram: "@disco_kid",
    });
    expect(okInsta.ok).toBe(true);
  });

  it("rejects invalid multi-select values", () => {
    const result = validateFormAnswers(sampleForm, {
      name: "Alex",
      email: "alex@example.com",
      whatYouDo: ["Orchestra"],
      basedWhere: "Hackney",
    });
    expect(result.ok).toBe(false);
  });

  it("requires a detail when Other is selected", () => {
    const formWithOther = {
      ...sampleForm,
      fields: sampleForm.fields.map((field) =>
        field.key === "whatYouDo"
          ? {
              ...field,
              options: [
                { label: "DJ", value: "DJ" },
                { label: "Other", value: "Other" },
              ],
            }
          : field,
      ),
    };
    const missing = validateFormAnswers(formWithOther, {
      name: "Alex",
      email: "alex@example.com",
      whatYouDo: ["Other"],
      basedWhere: "Hackney",
    });
    expect(missing.ok).toBe(false);

    const ok = validateFormAnswers(formWithOther, {
      name: "Alex",
      email: "alex@example.com",
      whatYouDo: ["DJ", "Other"],
      whatYouDoOther: "Percussion",
      basedWhere: "Hackney",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.answers.find((row) => row.key === "whatYouDo")?.value).toBe(
      "DJ, Percussion",
    );
  });

  it("replaces Other on single-select with the typed detail", () => {
    const formWithOther = {
      ...sampleForm,
      fields: sampleForm.fields.map((field) =>
        field.key === "basedWhere"
          ? {
              ...field,
              options: [
                { label: "Hackney", value: "Hackney" },
                { label: "Other", value: "Other" },
              ],
            }
          : field,
      ),
    };
    const result = validateFormAnswers(formWithOther, {
      name: "Alex",
      email: "alex@example.com",
      whatYouDo: ["DJ"],
      basedWhere: "Other",
      basedWhereOther: "Berlin",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers.find((row) => row.key === "basedWhere")?.value).toBe(
      "Berlin",
    );
  });
});

describe("formatFormEmail", () => {
  it("formats labelled answers", () => {
    const text = formatFormEmail({
      form: sampleForm,
      answers: [
        { key: "name", label: "Name", value: "Alex" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
      submittedAt: "2026-09-17T12:00:00.000Z",
    });
    expect(text).toContain("Play at Gwenda");
    expect(text).toContain("Name\nAlex");
  });
});

describe("replyToFromAnswers", () => {
  it("returns the email answer when present", () => {
    expect(
      replyToFromAnswers([
        { key: "name", label: "Name", value: "Alex" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ]),
    ).toBe("alex@example.com");
  });
});
