/**
 * The party enquiry form ("Book your party", /contact/party), end to end as
 * the submit function sees it: the real form definition (the one the
 * migration creates in Sanity), an enquiry checked against it, and the two
 * emails it produces. Nothing here sends anything.
 */
import { describe, expect, it } from "vitest";
import {
  FIELDS,
  FORM_SLUG,
  partyFormDocument,
} from "../../../../migrations/2026-11-11-party-form.mjs";
import {
  formatFormEmail,
  formatFormNotifyHtml,
  formatFormNotifySubject,
  formatFormReceiptSubject,
  replyToFromAnswers,
} from "../../../../shared/forms/format.js";
import { PARTY_FORM_SLUG, formPublicPath } from "./form-paths.js";
import { validateFormAnswers } from "./form-submit.js";

/** The document as the website's query returns it. */
const doc = partyFormDocument();
const form = { ...doc, slug: doc.slug.current };
const TODAY = "2026-11-11";

const enquiry = {
  name: "Sam Okafor",
  email: "Sam@Example.com",
  phone: "+44 7700 900123",
  occasion: "Birthday",
  date: "2026-12-12",
  secondDate: "2026-12-19",
  startTime: "7pm",
  people: "40",
  food: "Maybe",
  drinks: "Yes",
  music: "Bringing a DJ or a playlist",
  budget: "About £800",
  message: "It's a 30th. A few of us are veggie.",
};

const check = (answers) => validateFormAnswers(form, answers, { today: TODAY });

describe("the party form's definition", () => {
  it("lives at /contact/party", () => {
    expect(FORM_SLUG).toBe(PARTY_FORM_SLUG);
    expect(formPublicPath(form.slug)).toBe("/contact/party");
  });

  it("only asks for what the venue needs: name, email, a date, how many", () => {
    expect(
      form.fields.filter((field) => field.required).map((field) => field.key),
    ).toEqual(["name", "email", "date", "people"]);
  });

  it("uses field types the form page can draw, with unique keys", () => {
    const known = [
      "text",
      "email",
      "tel",
      "url",
      "date",
      "number",
      "textarea",
      "select",
      "multiSelect",
    ];
    for (const field of form.fields) expect(known).toContain(field.type);
    expect(new Set(FIELDS.map((field) => field.key)).size).toBe(FIELDS.length);
    for (const field of form.fields.filter((row) => row.type === "select")) {
      expect(field.options.length).toBeGreaterThan(1);
    }
  });
});

describe("a party enquiry", () => {
  it("is accepted, with the date as a day and the answers in the form's order", () => {
    const result = check(enquiry);
    expect(result.ok).toBe(true);
    const byKey = Object.fromEntries(
      result.answers.map((row) => [row.key, row.value]),
    );
    expect(result.answers.map((row) => row.key)).toEqual(
      FIELDS.map((field) => field.key),
    );
    expect(byKey.date).toBe("Saturday 12 December 2026");
    expect(byKey.secondDate).toBe("Saturday 19 December 2026");
    expect(byKey.people).toBe("40");
    expect(replyToFromAnswers(result.answers)).toBe("sam@example.com");
  });

  it("is accepted with only the four required answers", () => {
    const result = check({
      name: "Sam",
      email: "sam@example.com",
      date: TODAY,
      people: "8",
    });
    expect(result.ok).toBe(true);
  });

  it("names its own occasion under Something else", () => {
    const result = check({
      ...enquiry,
      occasion: "Other",
      occasionOther: "Wake",
    });
    expect(
      result.ok && result.answers.find((row) => row.key === "occasion").value,
    ).toBe("Wake");
    expect(check({ ...enquiry, occasion: "Other" })).toMatchObject({
      ok: false,
    });
  });

  it.each([
    ["no name", { name: "" }, /Name/],
    ["no email", { email: "" }, /Email/],
    ["a bad email", { email: "sam@nowhere" }, /email address/i],
    ["a bad phone", { phone: "12" }, /phone/i],
    ["no date", { date: "" }, /Preferred date/],
    [
      "a date that has gone",
      { date: "2026-11-10" },
      /Preferred date: that day has gone/,
    ],
    [
      "a date that isn't one",
      { date: "2026-02-31" },
      /Preferred date: pick a date/,
    ],
    [
      "a date typed as words",
      { date: "next Friday" },
      /Preferred date: pick a date/,
    ],
    ["a date years off", { date: "2031-01-01" }, /next two years/],
    [
      "a second choice that has gone",
      { secondDate: "2020-01-01" },
      /Second choice/,
    ],
    ["nobody coming", { people: "0" }, /How many people: enter a whole number/],
    ["no head count", { people: "" }, /How many people/],
    ["a head count in words", { people: "loads" }, /whole number/],
    ["half a person", { people: "12.5" }, /whole number/],
    ["a silly head count", { people: "5000" }, /from 1 to 1000/],
    [
      "an answer that isn't a choice",
      { food: "Lots" },
      /Invalid choice for Want food\?/,
    ],
  ])("is refused with %s", (_what, change, message) => {
    const result = check({ ...enquiry, ...change });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(message);
  });
});

describe("the party enquiry's emails", () => {
  const { answers } = check(enquiry);

  it("tells the venue who, when and how many in the subject", () => {
    expect(formatFormNotifySubject(form, answers)).toBe(
      "Party enquiry: Sam Okafor, Sat 12 Dec, 40 people",
    );
    expect(formatFormNotifySubject(form, answers, { updated: true })).toBe(
      "Party enquiry updated: Sam Okafor, Sat 12 Dec, 40 people",
    );
    expect(formatFormReceiptSubject(form)).toBe("Got it: Party enquiry");
  });

  it("lays every answer out for the venue, in the form's order", () => {
    const html = formatFormNotifyHtml({
      form,
      answers,
      opsUrl: "https://gwenda-ops.pages.dev/forms/7",
    });
    const text = formatFormEmail({ form, answers });
    let at = -1;
    for (const field of FIELDS) {
      const next = html.indexOf(`>${field.label}</div>`, at + 1);
      expect(next, field.label).toBeGreaterThan(at);
      at = next;
      expect(text).toContain(`${field.label}\n`);
    }
    expect(html).toContain("Saturday 12 December 2026 · 40 people");
    expect(html).toContain("It's a 30th. A few of us are veggie.");
    expect(html).toContain('href="mailto:Sam@Example.com"');
    expect(html).toContain('href="https://gwenda-ops.pages.dev/forms/7"');
    expect(html).toContain("https://gwenda.co.uk/brand/logo-email-social.png");
    expect(text).toContain("Saturday 12 December 2026 · 40 people");
    // Every link and picture is a full address: email has no "this site"
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
      expect(url).toMatch(/^(https:\/\/|mailto:)/);
    }
  });

  it("tells the sender we've got it, with what they sent and a way to change it", () => {
    const editUrl = "https://gwenda.co.uk/contact/edit?t=token";
    const html = formatFormNotifyHtml({
      form,
      answers,
      variant: "applicant",
      editUrl,
    });
    const text = formatFormEmail({
      form,
      answers,
      variant: "applicant",
      editUrl,
    });
    expect(html).toContain("Got it");
    expect(html).toContain("Thanks, Sam.");
    expect(html).toContain("Saturday 12 December 2026");
    expect(html).toContain(`href="${editUrl}"`);
    expect(html).toContain("you filled in Party enquiry on gwenda.co.uk");
    expect(text).toContain("Thanks, Sam.");
    expect(text).toContain(editUrl);
    expect(text).toContain("Preferred date\nSaturday 12 December 2026");
  });

  it("says one person, not one people", () => {
    const one = check({ ...enquiry, people: "1" }).answers;
    expect(formatFormNotifySubject(form, one)).toBe(
      "Party enquiry: Sam Okafor, Sat 12 Dec, 1 person",
    );
  });
});
