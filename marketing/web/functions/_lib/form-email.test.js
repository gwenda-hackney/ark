import { describe, expect, it } from "vitest";
import {
  formatFormFromAddress,
  resolveFormFrom,
  resolveFormReplyTo,
} from "./form-email.js";

describe("form email identity", () => {
  it("formats bare from addresses", () => {
    expect(formatFormFromAddress("play@gwenda.co.uk")).toBe(
      "Gwenda <play@gwenda.co.uk>",
    );
  });

  it("keeps an already-formatted from address", () => {
    expect(formatFormFromAddress("Play <play@gwenda.co.uk>")).toBe(
      "Play <play@gwenda.co.uk>",
    );
  });

  it("prefers Sanity fromEmail over env", () => {
    expect(
      resolveFormFrom(
        { SMTP_FROM: "Gwenda <hello@gwenda.co.uk>" },
        { fromEmail: "play@gwenda.co.uk" },
      ),
    ).toBe("Gwenda <play@gwenda.co.uk>");
  });

  it("uses replyToEmail, then fromEmail", () => {
    expect(
      resolveFormReplyTo({
        fromEmail: "play@gwenda.co.uk",
        replyToEmail: "play@gwenda.co.uk",
      }),
    ).toBe("play@gwenda.co.uk");
    expect(resolveFormReplyTo({ fromEmail: "play@gwenda.co.uk" })).toBe(
      "play@gwenda.co.uk",
    );
  });
});
