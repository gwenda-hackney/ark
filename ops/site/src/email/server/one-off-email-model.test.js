import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { draftChange, isEditable, notReadyReason, oneOffEmail, ONE_OFF_STATUSES } from "./one-off-email-model.js";

describe("a one-off email's rules (#348)", () => {
  it("fills every field, in its type, and keeps a status it knows", () => {
    const email = oneOffEmail({ id: "7", subject: " Hi\n there ", status: "nonsense", recipients: "-3", createdBy: " A@B.com " });
    assert.equal(email.id, 7);
    assert.equal(email.subject, "Hi there");
    assert.equal(email.status, "draft");
    assert.equal(email.recipients, 0);
    assert.equal(email.createdBy, "a@b.com");
    assert.deepEqual(email.sections, []);
    assert.equal(email.sentAt, null);
    assert.deepEqual(ONE_OFF_STATUSES, ["draft", "scheduled", "sending", "sent", "failed"]);
  });

  it("lets the editor change the subject, the preview line and the sections only", () => {
    assert.deepEqual(draftChange({ subject: "x".repeat(300), status: "sent", campaignId: "c", sections: [{ kind: "raw" }] }), {
      subject: "x".repeat(150),
      sections: [],
    });
    assert.deepEqual(draftChange({}), {});
  });

  it("can change only a draft", () => {
    assert.equal(isEditable(oneOffEmail({ status: "draft" })), true);
    for (const status of ["scheduled", "sending", "sent", "failed"]) assert.equal(isEditable(oneOffEmail({ status })), false);
  });

  it("is ready to send with a subject and one section with something in it", () => {
    assert.equal(notReadyReason(oneOffEmail({ sections: [{ kind: "heading", text: "Hi" }] })), "Give it a subject first.");
    assert.equal(notReadyReason(oneOffEmail({ subject: "Hi", sections: [{ kind: "image", assetId: "" }] })), "Add something to it first.");
    assert.equal(notReadyReason(oneOffEmail({ subject: "Hi", sections: [{ kind: "heading", text: "Hi" }] })), "");
  });
});
