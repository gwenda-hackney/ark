import { describe, expect, it } from "vitest";
import { diffFormAnswers, validateFormAnswers } from "./form-submit.js";
import {
  formatFormEmail,
  formatFormNotifyHtml,
  formatFormNotifySubject,
  formatFormReceiptSubject,
  replyToFromAnswers,
} from "../../../../shared/forms/format.js";

const sampleForm = {
  title: "Play at Gwenda",
  slug: "play",
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
  it("formats labelled answers in sections without ops meta", () => {
    const text = formatFormEmail({
      form: {
        ...sampleForm,
        fields: [
          {
            key: "name",
            label: "Name",
            type: "text",
            section: "About you",
            required: true,
          },
          {
            key: "email",
            label: "Email",
            type: "email",
            section: "About you",
            required: true,
          },
        ],
      },
      answers: [
        { key: "name", label: "Name", value: "Alex" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
    });
    expect(text).toContain("Play at Gwenda");
    expect(text).toContain("About you");
    expect(text).toContain("Name\nAlex");
    expect(text).toContain("Email\nalex@example.com");
    expect(text).not.toContain("/contact/play");
    expect(text).not.toContain("Awaiting email confirmation");
  });
});

describe("diffFormAnswers", () => {
  it("lists only fields that changed", () => {
    const changes = diffFormAnswers(
      [
        { key: "name", label: "Name", value: "Alex" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
      [
        { key: "name", label: "Name", value: "Alexandra" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
      sampleForm,
    );
    expect(changes).toEqual([
      {
        key: "name",
        label: "Name",
        from: "Alex",
        to: "Alexandra",
        kind: "text",
      },
    ]);
  });

  it("diffs multiSelect as sets (add/remove, ignore reorder)", () => {
    const form = {
      ...sampleForm,
      fields: [
        ...sampleForm.fields,
        {
          key: "roles",
          label: "Roles",
          type: "multiSelect",
          options: [
            { label: "DJ", value: "DJ" },
            { label: "Selector", value: "Selector" },
            { label: "Live", value: "Live" },
            { label: "Band", value: "Band" },
          ],
        },
      ],
    };

    expect(
      diffFormAnswers(
        [{ key: "roles", label: "Roles", value: "DJ, Selector" }],
        [{ key: "roles", label: "Roles", value: "Selector, DJ" }],
        form,
      ),
    ).toEqual([]);

    expect(
      diffFormAnswers(
        [{ key: "roles", label: "Roles", value: "DJ, Selector" }],
        [{ key: "roles", label: "Roles", value: "Selector, Live" }],
        form,
      ),
    ).toEqual([
      {
        key: "roles",
        label: "Roles",
        from: "DJ, Selector",
        to: "Selector, Live",
        kind: "multi",
        removed: ["DJ"],
        added: ["Live"],
      },
    ]);
  });

  it("marks cleared text fields", () => {
    expect(
      diffFormAnswers(
        [{ key: "musicLink", label: "Link", value: "https://x.test" }],
        [{ key: "musicLink", label: "Link", value: "" }],
        sampleForm,
      ),
    ).toEqual([
      {
        key: "musicLink",
        label: "Link to your music",
        from: "https://x.test",
        to: "",
        kind: "text",
      },
    ]);
  });
});

describe("formatFormNotifyHtml", () => {
  it("renders branded dark HTML with every filled answer", () => {
    const html = formatFormNotifyHtml({
      form: {
        ...sampleForm,
        fields: [
          {
            key: "artistName",
            label: "Artist / DJ name",
            type: "text",
            section: "About you",
          },
          {
            key: "email",
            label: "Email",
            type: "email",
            section: "About you",
          },
          {
            key: "phone",
            label: "Phone",
            type: "tel",
            section: "About you",
          },
          {
            key: "musicLink",
            label: "Link to your music",
            type: "url",
            section: "Your music",
          },
        ],
      },
      answers: [
        { key: "artistName", label: "Artist / DJ name", value: "DJ Alex" },
        { key: "email", label: "Email", value: "alex@example.com" },
        { key: "phone", label: "Phone", value: "" },
        {
          key: "musicLink",
          label: "Link to your music",
          value: "https://soundcloud.com/alex",
        },
      ],
      year: 2026,
    });

    expect(html).toContain("#0d0d0d");
    expect(html).toContain("#c9a84c");
    expect(html).toContain("Cormorant Garamond");
    expect(html).toContain("DJ Alex");
    expect(html).toContain("About you");
    expect(html).toContain("Your music");
    expect(html).toContain('mailto:alex@example.com');
    expect(html).toContain("https://soundcloud.com/alex");
    expect(html).not.toContain(">Phone<");
    expect(html).not.toContain("/contact/play");
    expect(html).toContain("© 2026 Gwenda");
    expect(html).toContain("Reply to write back");
  });

  it("shows what changed on updates", () => {
    const html = formatFormNotifyHtml({
      form: sampleForm,
      answers: [
        { key: "name", label: "Name", value: "Alexandra" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
      changes: [
        {
          key: "name",
          label: "Name",
          from: "Alex",
          to: "Alexandra",
          kind: "text",
        },
      ],
      year: 2026,
    });
    expect(html).toContain("Update");
    expect(html).toContain("What changed");
    expect(html).toContain("<s ");
    expect(html).toContain("Alex");
    expect(html).toContain("Alexandra");
    expect(html).not.toContain("→");
  });

  it("renders multiSelect removals with strikethrough", () => {
    const html = formatFormNotifyHtml({
      form: sampleForm,
      answers: [
        { key: "whatYouDo", label: "What do you do?", value: "Selector, Live" },
      ],
      changes: [
        {
          key: "whatYouDo",
          label: "What do you do?",
          from: "DJ, Selector",
          to: "Selector, Live",
          kind: "multi",
          removed: ["DJ"],
          added: ["Live"],
        },
      ],
      year: 2026,
    });
    expect(html).toContain("<s ");
    expect(html).toContain("DJ");
    expect(html).toContain("Selector, Live");
  });

  it("renders an applicant receipt with edit link", () => {
    const html = formatFormNotifyHtml({
      form: sampleForm,
      answers: [
        { key: "name", label: "Name", value: "Alex" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
      variant: "applicant",
      editUrl: "https://gwenda.co.uk/contact/edit?t=token",
      year: 2026,
    });
    expect(html).toContain("Hi Alex,");
    expect(html).toContain("Thank you for writing");
    expect(html).toContain("Change your application");
    expect(html).toContain("https://gwenda.co.uk/contact/edit?t=token");
    expect(html).not.toContain("What changed");
    expect(html).not.toContain("Reply to write back");
    expect(html).not.toContain(">Received<");
    expect(html).not.toContain(">Updated<");
  });
});

describe("formatFormNotifySubject", () => {
  it("prefers artist name in the subject", () => {
    expect(
      formatFormNotifySubject(sampleForm, [
        { key: "name", label: "Name", value: "Alex" },
        { key: "artistName", label: "Artist", value: "DJ Alex" },
      ]),
    ).toBe("DJ Alex applied · Play at Gwenda");
  });

  it("uses update wording when resubmitted", () => {
    expect(
      formatFormNotifySubject(
        sampleForm,
        [{ key: "name", label: "Name", value: "Dan" }],
        { updated: true },
      ),
    ).toBe("Dan updated their application · Play at Gwenda");
  });
});

describe("formatFormReceiptSubject", () => {
  it("uses thank-you and update subjects", () => {
    expect(formatFormReceiptSubject(sampleForm)).toBe(
      "Play at Gwenda | Thank you",
    );
    expect(formatFormReceiptSubject(sampleForm, { updated: true })).toBe(
      "Play at Gwenda | We received your update",
    );
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
