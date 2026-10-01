import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRawMessage,
  isGmailConfigured,
  parseGmailServiceAccount,
  safeMail,
  sendGmail,
} from "../../../../shared/gmail-send.js";

const account = JSON.stringify({
  type: "service_account",
  client_email: "mailer@gwenda.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
});

describe("gmail config", () => {
  it("needs only the service account (the mailbox is fixed)", () => {
    expect(isGmailConfigured({})).toBe(false);
    expect(isGmailConfigured({ GMAIL_SERVICE_ACCOUNT_JSON: account })).toBe(
      true,
    );
  });

  it("rejects JSON that is not a service account", () => {
    expect(parseGmailServiceAccount({ GMAIL_SERVICE_ACCOUNT_JSON: "{}" })).toBe(
      null,
    );
    expect(
      parseGmailServiceAccount({ GMAIL_SERVICE_ACCOUNT_JSON: "nope" }),
    ).toBe(null);
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
          {
            filename: "gwenda-logo.png",
            content: Buffer.from("png"),
            cid: "gwenda-logo",
          },
        ],
      })
    ).toString("utf8");
    expect(raw).toMatch(/^From: Gwenda <play@gwenda\.co\.uk>/m);
    expect(raw).toMatch(/^To: applicant@example\.com/m);
    expect(raw).toMatch(/^Reply-To: play@gwenda\.co\.uk/m);
    expect(raw).toMatch(/Content-ID: <gwenda-logo>/);
  });
});

describe("safe recipients outside production (#15)", () => {
  const rsvp = {
    from: "Gwenda <events@gwenda.co.uk>",
    to: "Guest <guest@example.com>",
    cc: ["friend@example.com"],
    bcc: "boss@example.com",
    subject: "You're on the list",
    text: "See you there",
  };
  const safe = { safeAddress: async () => "alerts@gwenda.co.uk" };

  afterEach(() => vi.unstubAllGlobals());

  it("leaves production mail alone", async () => {
    expect(await safeMail({ SITE_ENV: "production" }, rsvp, safe)).toBe(rsvp);
  });

  it("sends dev and local mail to the safe inbox, naming who it was for", async () => {
    for (const SITE_ENV of ["dev", "local"]) {
      const mail = await safeMail({ SITE_ENV }, rsvp, safe);
      expect(mail.to).toBe("alerts@gwenda.co.uk");
      expect(mail.cc).toBeUndefined();
      expect(mail.bcc).toBeUndefined();
      expect(mail.subject).toBe(
        "[dev, for guest@example.com, friend@example.com, boss@example.com] You're on the list",
      );
      expect(mail.headers["X-Gwenda-Original-To"]).toBe(
        "guest@example.com, friend@example.com, boss@example.com",
      );
      expect(mail.text).toBe("See you there");
    }
  });

  it("leaves mail already addressed to the safe inbox unchanged", async () => {
    const alert = {
      ...rsvp,
      to: "alerts@gwenda.co.uk",
      cc: undefined,
      bcc: undefined,
    };
    expect(await safeMail({ SITE_ENV: "dev" }, alert, safe)).toBe(alert);
  });

  it("refuses to send outside production without a safe address", async () => {
    await expect(
      safeMail({ SITE_ENV: "dev" }, rsvp, { safeAddress: async () => "" }),
    ).rejects.toThrow(/not sending outside production/);
  });

  it("never reaches Gmail when it refuses", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    // No config database in this env, so there is no safe address to find.
    await expect(
      sendGmail({ SITE_ENV: "dev", GMAIL_SERVICE_ACCOUNT_JSON: account }, rsvp),
    ).rejects.toThrow(/outside production/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
