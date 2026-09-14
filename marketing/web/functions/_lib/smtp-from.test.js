import { describe, expect, it } from "vitest";
import { resolveSmtpFrom, SMTP_PURPOSE } from "./smtp-from.js";

describe("resolveSmtpFrom", () => {
  it("defaults event mail to events@gwenda.co.uk", () => {
    expect(resolveSmtpFrom({}, SMTP_PURPOSE.EVENTS)).toBe(
      "Gwenda Events <events@gwenda.co.uk>",
    );
  });

  it("allows overriding event from via SMTP_FROM_EVENTS", () => {
    expect(
      resolveSmtpFrom(
        { SMTP_FROM_EVENTS: "Custom <events@gwenda.co.uk>" },
        SMTP_PURPOSE.EVENTS,
      ),
    ).toBe("Custom <events@gwenda.co.uk>");
  });

  it("uses SMTP_FROM for invite mail", () => {
    expect(
      resolveSmtpFrom({ SMTP_FROM: "Gwenda <hello@gwenda.co.uk>" }, SMTP_PURPOSE.INVITES),
    ).toBe("Gwenda <hello@gwenda.co.uk>");
  });
});
