import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_BODY,
  formatMessage,
  guestEmail,
  guestInstagramHandle,
  normalizeInstagramHandle,
  parseInviteChannel,
  resolveInstagramRecipientId,
} from "../src/lib";
import type { Guest } from "../src/types";

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    rowId: 1,
    taskId: "cu-1",
    name: "Alex",
    contact: null,
    channel: null,
    token: null,
    rsvpGuests: null,
    status: null,
    ...overrides,
  };
}

describe("parseInviteChannel", () => {
  it("parses email or instagram only", () => {
    expect(parseInviteChannel("Email")).toBe("email");
    expect(parseInviteChannel("Instagram")).toBe("instagram");
    expect(parseInviteChannel("Both")).toBeNull();
  });
});

describe("guest contact routing", () => {
  it("reads email from contact when channel is email", () => {
    expect(
      guestEmail(guest({ channel: "email", contact: "alex@example.com" })),
    ).toBe("alex@example.com");
    expect(
      guestEmail(guest({ channel: "instagram", contact: "alex@example.com" })),
    ).toBeNull();
  });

  it("reads instagram handle from contact when channel is instagram", () => {
    expect(
      guestInstagramHandle(guest({ channel: "instagram", contact: "@Guest" })),
    ).toBe("guest");
  });
});

describe("normalizeInstagramHandle", () => {
  it("normalises handles and URLs", () => {
    expect(normalizeInstagramHandle("@Guest")).toBe("guest");
    expect(normalizeInstagramHandle("https://www.instagram.com/Guest/")).toBe("guest");
  });
});

describe("resolveInstagramRecipientId", () => {
  it("looks up conversation map by handle", () => {
    expect(resolveInstagramRecipientId("guest", { guest: "igsid-1" })).toBe("igsid-1");
  });
});

describe("formatMessage", () => {
  it("substitutes name in templates", () => {
    expect(formatMessage(DEFAULT_EMAIL_BODY, "Alex")).toContain("Hi Alex,");
  });
});
