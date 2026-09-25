import { describe, expect, it } from "vitest";
import { buildFormVerifyEmailHtml } from "./form-verify-email.js";
import { LOGO_CID } from "../../../../shared/email-image.js";

describe("buildFormVerifyEmailHtml", () => {
  it("renders branded mark, CTA, and verify URL on the button only", () => {
    const html = buildFormVerifyEmailHtml({
      eyebrow: "Confirm",
      heading: "Almost there",
      lead: "Thanks for writing.",
      aside: "There's no rush. This note will keep for a couple of days.",
      verifyUrl: "https://gwenda.co.uk/contact/verify?t=abc",
      logoUrl: "https://gwenda.co.uk/brand/logo-email.png",
      year: 2026,
    });

    expect(html).toContain("#0d0d0d");
    expect(html).toContain("#c9a84c");
    expect(html).toContain("https://gwenda.co.uk/brand/logo-email.png");
    expect(html).toContain("Confirm email");
    expect(html).toContain('href="https://gwenda.co.uk/contact/verify?t=abc"');
    expect(html).not.toContain(">https://gwenda.co.uk/contact/verify?t=abc<");
    expect(html).toContain("couple of days");
    expect(html).toContain("© 2026 Gwenda");
  });

  it("embeds the mark via CID when provided", () => {
    const html = buildFormVerifyEmailHtml({
      eyebrow: "Confirm",
      heading: "Almost there",
      lead: "Thanks for writing.",
      aside: "There's no rush.",
      verifyUrl: "https://gwenda.co.uk/contact/verify?t=abc",
      logoCid: LOGO_CID,
      year: 2026,
    });

    expect(html).toContain(`cid:${LOGO_CID}`);
    expect(html).not.toContain("https://gwenda.co.uk/brand/logo-email.png");
  });
});
