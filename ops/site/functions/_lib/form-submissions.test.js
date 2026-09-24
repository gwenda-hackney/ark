import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { resetBaserowClientForTests } from "./baserow.js";
import { listFormSubmissions, mapFormSubmission } from "./form-submissions.js";
import { jsonResponse } from "./test-baserow-mock.js";

afterEach(() => {
  mock.restoreAll();
  resetBaserowClientForTests();
});

const env = {
  BASEROW_API_KEY: "ops-token",
  BASEROW_WEBSITE_API_KEY: "web-token",
};

describe("mapFormSubmission", () => {
  it("reads name, email, and other answers", () => {
    const mapped = mapFormSubmission({
      id: 4,
      "Form Slug": "play",
      "Form Title": "Play at Gwenda",
      "Reply To": "Alex@Example.com",
      Status: { value: "Verified" },
      Current: true,
      Submitted: "2026-09-24T12:00:00Z",
      Answers: JSON.stringify({
        entries: [
          { key: "name", label: "Name", value: "Alex" },
          { key: "email", label: "Email", value: "alex@example.com" },
          { key: "note", label: "Note", value: "Thursday" },
        ],
      }),
    });
    assert.equal(mapped.name, "Alex");
    assert.equal(mapped.email, "alex@example.com");
    assert.equal(mapped.status, "Verified");
    assert.equal(mapped.formTitle, "Play at Gwenda");
    assert.deepEqual(mapped.answers, [{ key: "note", label: "Note", value: "Thursday" }]);
  });

  it("treats a missing Current flag as current", () => {
    assert.equal(mapFormSubmission({ id: 1, Current: false }).current, false);
    assert.equal(mapFormSubmission({ id: 1 }).current, true);
  });
});

describe("listFormSubmissions", () => {
  it("uses the website token and keeps only current rows, newest first", async () => {
    const auths = [];
    mock.method(globalThis, "fetch", async (input, init) => {
      auths.push(init?.headers?.Authorization || "");
      const url = String(input);
      if (url.includes("/tables/all-tables/")) {
        return jsonResponse([
          { id: 42, name: "Form Submissions", database_id: 7 },
          { id: 9, name: "Subscribers", database_id: 7 },
        ]);
      }
      return jsonResponse({
        results: [
          {
            id: 1,
            "Form Title": "Play",
            "Reply To": "old@example.com",
            Submitted: "2026-01-01T00:00:00Z",
            Current: true,
            Answers: JSON.stringify([{ key: "name", label: "Name", value: "Old" }]),
          },
          {
            id: 2,
            "Form Title": "Play",
            "Reply To": "new@example.com",
            Submitted: "2026-09-01T00:00:00Z",
            Current: true,
            Answers: JSON.stringify([{ key: "name", label: "Name", value: "New" }]),
          },
          {
            id: 3,
            "Form Title": "Play",
            "Reply To": "gone@example.com",
            Submitted: "2026-08-01T00:00:00Z",
            Current: false,
            Answers: "[]",
          },
        ],
      });
    });

    const rows = await listFormSubmissions(env);
    assert.deepEqual(
      rows.map((row) => row.email),
      ["new@example.com", "old@example.com"],
    );
    assert.ok(auths.every((header) => header === "Token web-token"));
  });

  it("fails when the website token is missing", async () => {
    await assert.rejects(
      () => listFormSubmissions({ BASEROW_API_KEY: "ops-token" }),
      (error) => error.status === 503 && /BASEROW_WEBSITE_API_KEY/.test(error.message),
    );
  });
});
