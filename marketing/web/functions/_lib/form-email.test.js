import { describe, expect, it } from "vitest";
import {
  formatFormFromAddress,
  resolveFormFrom,
  resolveFormNotifyFrom,
  resolveFormReplyTo,
} from "../../../../shared/forms/form-email.js";

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

  it("uses Sanity fromEmail, else the events address", () => {
    expect(resolveFormFrom({}, { fromEmail: "play@gwenda.co.uk" })).toBe(
      "Gwenda <play@gwenda.co.uk>",
    );
    expect(resolveFormFrom({}, {})).toBe("Gwenda Events <events@gwenda.co.uk>");
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

  it("notifies from the sending mailbox, not play@ → play@", () => {
    expect(resolveFormNotifyFrom()).toBe("Gwenda <notifications@gwenda.co.uk>");
  });
});
