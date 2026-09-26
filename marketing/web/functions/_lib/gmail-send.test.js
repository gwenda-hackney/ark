import { describe, expect, it } from "vitest";
import {
  buildRawMessage,
  isGmailConfigured,
  parseGmailServiceAccount,
} from "../../../../shared/gmail-send.js";

const account = JSON.stringify({
  type: "service_account",
  client_email: "mailer@gwenda.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
});

describe("gmail config", () => {
  it("needs a service account and a sending mailbox", () => {
    expect(isGmailConfigured({})).toBe(false);
    expect(isGmailConfigured({ GMAIL_SERVICE_ACCOUNT_JSON: account })).toBe(false);
    expect(
      isGmailConfigured({
        GMAIL_SERVICE_ACCOUNT_JSON: account,
        SMTP_USER: "notifications@gwenda.co.uk",
      }),
    ).toBe(true);
  });

  it("rejects JSON that is not a service account", () => {
    expect(parseGmailServiceAccount({ GMAIL_SERVICE_ACCOUNT_JSON: "{}" })).toBe(null);
    expect(parseGmailServiceAccount({ GMAIL_SERVICE_ACCOUNT_JSON: "nope" })).toBe(null);
  });
});

describe("buildRawMessage", () => {
  it("keeps headers, reply-to, and an inline logo", async () => {
    const raw = (
      await buildRawMessage({
        from: "Gwenda <play@gwenda.co.uk>",
        to: "applicant@example.com",
        replyTo: "play@gwenda.co.uk",
        subject: "Play at Gwenda | We received your note",
        text: "Hello",
        html: '<img src="cid:gwenda-logo">',
        attachments: [
          { filename: "gwenda-logo.png", content: Buffer.from("png"), cid: "gwenda-logo" },
        ],
      })
    ).toString("utf8");
    expect(raw).toMatch(/^From: Gwenda <play@gwenda\.co\.uk>/m);
    expect(raw).toMatch(/^To: applicant@example\.com/m);
    expect(raw).toMatch(/^Reply-To: play@gwenda\.co\.uk/m);
    expect(raw).toMatch(/Content-ID: <gwenda-logo>/);
  });
});
