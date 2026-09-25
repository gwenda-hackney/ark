import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import { resetBaserowClientForTests } from "./baserow.js";
import {
  listFormSubmissions,
  mapFormSubmission,
  resendFormEmail,
} from "./form-submissions.js";
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

  it("exposes the email sent stamps", () => {
    const mapped = mapFormSubmission({
      id: 1,
      "Notify Sent": "2026-09-24T10:00:00Z",
      "Receipt Sent": null,
    });
    assert.equal(mapped.notifySentAt, "2026-09-24T10:00:00Z");
    assert.equal(mapped.receiptSentAt, "");
  });
});

/** A throwaway service account, so the real Gmail send path runs against mocked fetch. */
async function serviceAccountJson() {
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign"],
  );
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
  return JSON.stringify({
    type: "service_account",
    client_email: "mailer@example.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----\n`,
  });
}

const PLAY_FORM = {
  title: "Play at Gwenda",
  slug: "play",
  notifyEmail: "play@gwenda.co.uk",
  fromEmail: "play@gwenda.co.uk",
  fields: [{ key: "name", label: "Name", type: "text" }],
};

/**
 * Website Baserow + Sanity + Gmail, all mocked. Returns what was sent and
 * which rows were patched.
 */
function mockResend({ row, form = PLAY_FORM }) {
  const sent = [];
  const patches = [];
  const sanityUrls = [];
  mock.method(globalThis, "fetch", async (input, init) => {
    const url = String(input);
    if (url.includes("/tables/all-tables/")) {
      return jsonResponse([{ id: 42, name: "Form Submissions", database_id: 7 }]);
    }
    if (url.includes("/rows/table/42/")) {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(init.body));
        return jsonResponse({ id: row?.id });
      }
      return row ? jsonResponse(row) : jsonResponse({ error: "ERROR_ROW_DOES_NOT_EXIST" }, 404);
    }
    if (url.includes(".api.sanity.io/")) {
      sanityUrls.push(new URL(url));
      return jsonResponse({ result: form });
    }
    if (url === "https://oauth2.googleapis.com/token") {
      return jsonResponse({ access_token: "t", expires_in: 3600 });
    }
    if (url.startsWith("https://gmail.googleapis.com/")) {
      const { raw } = JSON.parse(init.body);
      sent.push(Buffer.from(raw, "base64url").toString("utf8"));
      return jsonResponse({ id: "m1" });
    }
    // The email logo: not an image here, so the email goes without it.
    return new Response("", { status: 404 });
  });
  return { sent, patches, sanityUrls };
}

const playRow = (extra = {}) => ({
  id: 501,
  "Form Slug": "play",
  "Reply To": "alex@example.com",
  Answers: JSON.stringify({
    entries: [
      { key: "name", label: "Name", value: "Alex" },
      { key: "email", label: "Email", value: "alex@example.com" },
    ],
  }),
  ...extra,
});

describe("resendFormEmail", () => {
  let resendEnv;
  const baseEnv = {
    BASEROW_WEBSITE_API_KEY: "web-token",
    SANITY_API_TOKEN: "sanity",
    SANITY_PROJECT_ID: "gwscpagy",
    SITE_ENV: "local",
    FORMS_NOTIFY_EMAIL: "dev@example.com",
    SMTP_USER: "notifications@gwenda.co.uk",
  };
  before(async () => {
    resendEnv = { ...baseEnv, GMAIL_SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
  });

  it("sends the receipt with the edit link the website saved, then stamps the row", async () => {
    const editLink = "https://gwenda-web-dev.pages.dev/contact/edit?t=abc.def";
    const { sent, patches, sanityUrls } = mockResend({ row: playRow({ "Edit Link": editLink }) });

    const result = await resendFormEmail(resendEnv, "501", "receipt");

    assert.equal(result.ok, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /^To: alex@example\.com/m);
    assert.ok(sent[0].replace(/=\r\n/g, "").includes("contact/edit?t=3Dabc.def"));
    assert.deepEqual(Object.keys(patches[0]), ["Receipt Sent"]);
    assert.equal(result.sentAt, patches[0]["Receipt Sent"]);
    // The live site's form: production dataset, no drafts.
    assert.match(sanityUrls[0].pathname, /\/data\/query\/production$/);
    assert.equal(sanityUrls[0].searchParams.get("perspective"), "published");
    assert.equal(sanityUrls[0].searchParams.get("$slug"), '"play"');
  });

  it("links an older row with no saved edit link to the form's page", async () => {
    const { sent } = mockResend({ row: playRow() });
    await resendFormEmail(resendEnv, "501", "receipt");
    assert.ok(sent[0].replace(/=\r\n/g, "").includes("https://gwenda.co.uk/contact/play"));
  });

  it("sends the notification to this environment's notify address", async () => {
    const { sent, patches } = mockResend({ row: playRow() });
    await resendFormEmail(resendEnv, "501", "notify");
    assert.match(sent[0], /^To: dev@example\.com/m);
    assert.deepEqual(Object.keys(patches[0]), ["Notify Sent"]);
  });

  it("does not stamp the row when mail is not set up (dry run)", async () => {
    const { sent, patches } = mockResend({ row: playRow() });
    const result = await resendFormEmail(baseEnv, "501", "notify");
    assert.deepEqual(result, { ok: true, dryRun: true });
    assert.equal(sent.length, 0);
    assert.equal(patches.length, 0);
  });

  it("rejects unknown kinds, missing rows and forms", async () => {
    mockResend({ row: null });
    await assert.rejects(resendFormEmail(baseEnv, "1", "verify"), { status: 400 });
    await assert.rejects(resendFormEmail(baseEnv, "1", "notify"), { status: 404 });
    mock.restoreAll();
    mockResend({ row: playRow(), form: null });
    await assert.rejects(resendFormEmail(baseEnv, "501", "notify"), {
      status: 404,
      message: 'Form "play" is not in Sanity.',
    });
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
