import { describe, expect, it } from "vitest";
import { EVENTS_FROM, MAIL_SENDER, NOTIFICATIONS_FROM } from "../../../../shared/mail-from.js";

describe("mail-from", () => {
  it("sends as notifications@ and signs event mail as events@", () => {
    expect(MAIL_SENDER).toBe("notifications@gwenda.co.uk");
    expect(NOTIFICATIONS_FROM).toBe("Gwenda <notifications@gwenda.co.uk>");
    expect(EVENTS_FROM).toBe("Gwenda Events <events@gwenda.co.uk>");
  });
});
