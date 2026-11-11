import { describe, expect, it } from "vitest";
import { diffFormAnswers, validateFormAnswers } from "./form-submit.js";
import {
  formatFormEmail,
  formatFormNotifyHtml,
  formatFormNotifySubject,
  formatFormReceiptSubject,
  replyToFromAnswers,
} from "../../../../shared/forms/format.js";
import { COLOURS } from "../../../../shared/email/shell.js";

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
    });

    // The Gwenda Social look (shared/email/shell.js), not the old gold serif
    expect(html).toContain(COLOURS.board);
    expect(html).toContain(COLOURS.mustard);
    expect(html).toContain("Protest Strike");
    expect(html).not.toContain("Cormorant");
    expect(html).not.toContain("#c9a84c");
    expect(html).toContain("https://gwenda.co.uk/brand/logo-email-social.png");
    expect(html).toContain("<title>Play at Gwenda: DJ Alex</title>");
    expect(html).toContain("DJ Alex");
    expect(html).toContain("About you");
    expect(html).toContain("Your music");
    expect(html).toContain("mailto:alex@example.com");
    expect(html).toContain("https://soundcloud.com/alex");
    expect(html).not.toContain(">Phone<");
    expect(html).not.toContain("/contact/play");
    expect(html).toContain("Gwenda Social · Unit 4003, 4 Schwartz Wharf");
    expect(html).toContain("Reply to this email to write back");
    // A transactional email: no mailing-list tags
    expect(html).not.toContain("*|");
    expect(html).not.toMatch(/unsubscribe/i);
  });

  it("links the submission in ops when it has one", () => {
    const answers = [{ key: "name", label: "Name", value: "Alex" }];
    const opsUrl = "https://gwenda-ops.pages.dev/forms/12";
    expect(
      formatFormNotifyHtml({ form: sampleForm, answers, opsUrl }),
    ).toContain(`href="${opsUrl}"`);
    expect(formatFormEmail({ form: sampleForm, answers, opsUrl })).toContain(
      `In ops: ${opsUrl}`,
    );
    expect(formatFormNotifyHtml({ form: sampleForm, answers })).not.toContain(
      "Open in ops",
    );
  });

  it("escapes what people type, and survives long or missing answers", () => {
    const long = "word ".repeat(400).trim();
    const html = formatFormNotifyHtml({
      form: sampleForm,
      answers: [
        { key: "name", label: "Name", value: '<script>alert("x")</script>' },
        { key: "email", label: "Email", value: "alex@example.com" },
        { key: "musicLink", label: "Link", value: 'https://a.example/"><b>' },
        { key: "extra", label: "Not on the form <b>", value: long },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain(long);
    for (const variant of ["ops", "applicant"]) {
      expect(() =>
        formatFormNotifyHtml({ form: undefined, answers: undefined, variant }),
      ).not.toThrow();
      expect(() =>
        formatFormEmail({ form: undefined, answers: undefined, variant }),
      ).not.toThrow();
    }
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
    });
    expect(html).toContain("Play at Gwenda · updated");
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
    });
    expect(html).toContain("Got it");
    expect(html).toContain("Thanks, Alex.");
    expect(html).toContain("Change it");
    expect(html).toContain('href="https://gwenda.co.uk/contact/edit?t=token"');
    expect(html).toContain(
      "You’re getting this because you filled in Play at Gwenda on gwenda.co.uk.",
    );
    expect(html).not.toContain("What changed");
    expect(html).not.toContain("Reply to this email");
    expect(html).not.toContain("Open in ops");
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
    ).toBe("Play at Gwenda: DJ Alex");
  });

  it("uses update wording when resubmitted", () => {
    expect(
      formatFormNotifySubject(
        sampleForm,
        [{ key: "name", label: "Name", value: "Dan" }],
        { updated: true },
      ),
    ).toBe("Play at Gwenda updated: Dan");
  });
});

describe("formatFormReceiptSubject", () => {
  it("says got it, or got your changes", () => {
    expect(formatFormReceiptSubject(sampleForm)).toBe("Got it: Play at Gwenda");
    expect(formatFormReceiptSubject(sampleForm, { updated: true })).toBe(
      "Got your changes: Play at Gwenda",
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
