/**
 * POST /api/forms with a party enquiry, as the browser sends it: checked
 * against the real party form, saved, and the two emails built for real and
 * handed to a fake mailer. Nothing leaves the machine: Sanity, the store,
 * the logo fetch and Gmail are all fakes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { partyFormDocument } from "../../../../../migrations/2026-11-11-party-form.mjs";

const mocks = vi.hoisted(() => ({
  sent: [],
  upsertFormSubmission: vi.fn(),
  markFormSubmissionEmailSent: vi.fn(async () => ({ ok: true })),
  saveFormEditLink: vi.fn(async () => ({ ok: true })),
  fetchFormForSubmit: vi.fn(),
}));

vi.mock("../../../../../shared/gmail-send.js", () => ({
  isGmailConfigured: () => true,
  sendGmail: vi.fn(async (_env, message) => {
    mocks.sent.push(message);
  }),
}));
vi.mock("../../../../../shared/email-image.js", () => ({
  LOGO_CID: "gwenda-logo@gwenda",
  fetchImageBuffer: vi.fn(async () => null),
}));
vi.mock("../../../../../shared/forms/notify-to.js", () => ({
  resolveFormNotifyTo: vi.fn(async () => "venue@example.test"),
}));
vi.mock("../../_lib/form-store.js", () => ({
  FORM_STATUS_VERIFIED: "verified",
  upsertFormSubmission: mocks.upsertFormSubmission,
  markFormSubmissionEmailSent: mocks.markFormSubmissionEmailSent,
  saveFormEditLink: mocks.saveFormEditLink,
}));
vi.mock("../../_lib/form-submit.js", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchFormForSubmit: mocks.fetchFormForSubmit,
}));
vi.mock("../../_lib/subscribe-auth.js", () => ({
  issueSubscribeTokens: vi.fn(),
  validateSubscribeRequest: () => ({ ok: true }),
}));
vi.mock("../../_lib/form-rate-limit.js", () => ({
  FORM_RATE_LIMITS: { submit: {}, csrf: {} },
  checkFormRateLimit: vi.fn(async () => ({ ok: true })),
  formRateLimitResponse: vi.fn(),
}));

import { onRequestPost } from "./index.js";

const doc = partyFormDocument();
const form = { ...doc, slug: doc.slug.current };

/** A Saturday about a month from now, as a date input sends it. */
function soon(days = 30) {
  const date = new Date(Date.now() + days * 86400000);
  return date.toISOString().slice(0, 10);
}

const enquiry = () => ({
  name: "Sam Okafor",
  email: "sam@example.com",
  phone: "+44 7700 900123",
  occasion: "Birthday",
  date: soon(30),
  secondDate: soon(37),
  startTime: "7pm",
  people: "40",
  food: "Maybe",
  drinks: "Yes",
  music: "Don’t mind",
  budget: "",
  message: "A 30th <b>birthday</b>.",
});

const env = { SITE_ENV: "dev", FORM_VERIFY_SECRET: "test-secret" };

function post(answers, extra = {}) {
  return onRequestPost({
    env,
    request: new Request("http://localhost:4321/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "party", answers, website: "", ...extra }),
    }),
  });
}

beforeEach(() => {
  mocks.sent.length = 0;
  vi.clearAllMocks();
  mocks.fetchFormForSubmit.mockResolvedValue(form);
  mocks.upsertFormSubmission.mockResolvedValue({
    ok: true,
    rowId: "7",
    updated: false,
  });
});

describe("POST /api/forms: a party enquiry", () => {
  it("saves it, tells the venue and sends the sender a receipt", async () => {
    const response = await post(enquiry());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      rowId: "7",
      email: "sam@example.com",
      successTitle: "Got it",
    });

    // Saved with the answers as typed (for editing later) and as they read
    const stored = mocks.upsertFormSubmission.mock.calls[0][1];
    expect(stored.form.slug).toBe("party");
    expect(stored.rawAnswers.date).toBe(enquiry().date);
    expect(stored.answers.find((row) => row.key === "people").value).toBe("40");

    expect(mocks.sent).toHaveLength(2);
    const [venue, receipt] = mocks.sent;

    // To the venue: who, when and how many in the subject; replies go to the sender
    expect(venue.to).toBe("venue@example.test");
    expect(venue.replyTo).toBe("sam@example.com");
    expect(venue.subject).toMatch(
      /^Party enquiry: Sam Okafor, [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, 40 people$/,
    );
    for (const label of [
      "Preferred date",
      "Second choice",
      "How many people",
      "Want food?",
      "Music",
    ]) {
      expect(venue.html).toContain(`>${label}</div>`);
      expect(venue.text).toContain(`${label}\n`);
    }
    expect(venue.html).not.toContain(">Budget</div>"); // left empty: not listed
    expect(venue.html).toContain("A 30th &lt;b&gt;birthday&lt;/b&gt;.");
    expect(venue.html).toContain("/forms/7"); // the submission in ops

    // To the sender: got it, what they sent, and the way to change it
    expect(receipt.to).toBe("sam@example.com");
    expect(receipt.replyTo).toBe("hello@gwenda.co.uk");
    expect(receipt.subject).toBe("Got it: Party enquiry");
    expect(receipt.html).toContain("Thanks, Sam.");
    expect(receipt.html).toContain("Change it");
    expect(receipt.text).toContain("How many people\n40");

    expect(
      mocks.markFormSubmissionEmailSent.mock.calls.map((call) => call[2]),
    ).toEqual(["notify", "receipt"]);
  });

  it.each([
    ["no name", { name: " " }, /Name/],
    ["a bad email", { email: "sam@" }, /email/i],
    ["a date that has gone", { date: "2020-06-01" }, /Preferred date/],
    ["no date", { date: "" }, /Preferred date/],
    ["no head count", { people: "" }, /How many people/],
    ["a silly head count", { people: "100000" }, /whole number/],
  ])(
    "refuses %s with a message, and saves and sends nothing",
    async (_what, change, message) => {
      const response = await post({ ...enquiry(), ...change });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(message);
      expect(mocks.upsertFormSubmission).not.toHaveBeenCalled();
      expect(mocks.sent).toHaveLength(0);
    },
  );

  it("drops a bot that fills the hidden field, without saving or sending", async () => {
    const response = await post(enquiry(), { website: "https://spam.example" });
    expect(response.status).toBe(200);
    expect(mocks.upsertFormSubmission).not.toHaveBeenCalled();
    expect(mocks.sent).toHaveLength(0);
  });

  it("says so when the form isn't there", async () => {
    mocks.fetchFormForSubmit.mockResolvedValue(null);
    const response = await post(enquiry());
    expect(response.status).toBe(404);
    expect(mocks.sent).toHaveLength(0);
  });
});
