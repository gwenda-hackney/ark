import { describe, expect, it } from "vitest";
import { buildFormVerifyEmailHtml } from "./form-verify-email.js";
import { LOGO_CID } from "../../../../shared/email-image.js";
import { COLOURS } from "../../../../shared/email/shell.js";

const LOGO = "https://gwenda.co.uk/brand/logo-email-social.png";

describe("buildFormVerifyEmailHtml", () => {
  it("wears the Gwenda Social look, with the link on the button only", () => {
    const html = buildFormVerifyEmailHtml({
      eyebrow: "Party enquiry",
      heading: "Nearly there",
      lead: "Thanks for filling in Party enquiry.",
      aside: "No rush. The link works for a couple of days.",
      verifyUrl: "https://gwenda.co.uk/contact/verify?t=abc",
      subject: "Confirm your email: Party enquiry",
    });

    expect(html).toContain(COLOURS.board);
    expect(html).toContain(COLOURS.mustard);
    expect(html).toContain("Protest Strike");
    expect(html).not.toContain("Cormorant");
    expect(html).toContain(LOGO);
    expect(html).toContain("<title>Confirm your email: Party enquiry</title>");
    expect(html).toContain("Confirm email");
    expect(html).toContain('href="https://gwenda.co.uk/contact/verify?t=abc"');
    expect(html).not.toContain(">https://gwenda.co.uk/contact/verify?t=abc<");
    expect(html).toContain("couple of days");
    expect(html).toContain("Gwenda Social · Unit 4003, 4 Schwartz Wharf");
    expect(html).toContain("Not you? Ignore it");
    expect(html).not.toMatch(/unsubscribe/i);
  });

  it("embeds the mark via CID when provided", () => {
    const html = buildFormVerifyEmailHtml({
      eyebrow: "Confirm",
      heading: "Nearly there",
      lead: "Thanks.",
      aside: "No rush.",
      verifyUrl: "https://gwenda.co.uk/contact/verify?t=abc",
      logoCid: LOGO_CID,
    });

    expect(html).toContain(`cid:${LOGO_CID}`);
    expect(html).not.toContain(LOGO);
  });

  it("escapes a form title someone could have typed into Studio", () => {
    const html = buildFormVerifyEmailHtml({
      eyebrow: "Tom & <Jerry>",
      heading: "Nearly there",
      lead: "x",
      aside: "y",
      verifyUrl: "javascript:alert(1)",
    });
    expect(html).toContain("Tom &amp; &lt;Jerry&gt;");
    expect(html).not.toContain("javascript:");
  });
});
