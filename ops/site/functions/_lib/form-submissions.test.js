import assert from "node:assert/strict";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import { resetBaserowClientForTests } from "./baserow.js";
import {
  approvedArtists,
  artistLink,
  listFormSubmissions,
  mapFormSubmission,
  resendFormEmail,
  setFormArtist,
  setFormDecision,
  withGuestRecords,
} from "./form-submissions.js";
import { jsonResponse, opsCatalogTables } from "./test-baserow-mock.js";

afterEach(() => {
  vi.restoreAllMocks();
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
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
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
  };
  beforeAll(async () => {
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
    vi.restoreAllMocks();
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
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      auths.push([url, init?.headers?.Authorization || ""]);
      if (url.includes("/tables/all-tables/")) {
        return jsonResponse([
          { id: 42, name: "Form Submissions", database_id: 7 },
          { id: 9, name: "Subscribers", database_id: 7 },
          // Ops' own database, with no Guest artists table yet.
          ...opsCatalogTables(90),
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
    // Submissions with the website token; only Guest artists lookups use ops'.
    const submissionReads = auths.filter(([url]) => url.includes("/rows/table/42/"));
    assert.ok(submissionReads.length);
    assert.ok(submissionReads.every(([, header]) => header === "Token web-token"));
    assert.ok(auths.every(([, header]) => header === "Token web-token" || header === "Token ops-token"));
  });

  it("fails when the website token is missing", async () => {
    await assert.rejects(
      () => listFormSubmissions({ BASEROW_API_KEY: "ops-token" }),
      (error) => error.status === 503 && /BASEROW_WEBSITE_API_KEY/.test(error.message),
    );
  });
});

describe("play applicants: ops' own record", () => {
  const play = (id, email, extra = {}) => ({
    id,
    formSlug: "play",
    email,
    name: "Real Name",
    submittedAt: "t",
    current: true,
    answers: [
      { key: "artistName", label: "Artist / DJ name", value: `DJ ${id}` },
      { key: "instagram", label: "Instagram", value: "@dj" },
    ],
    ...extra,
  });
  const record = (email, extra = {}) => ({ id: "1", email, decision: "", artistName: "", artistLink: "", ...extra });

  it("joins each play application to its record by email; other forms get none", () => {
    const records = new Map([["a@x.com", record("a@x.com", { decision: "Approved" })]]);
    const [a, b, other] = withGuestRecords(
      [play("1", "a@x.com"), play("2", "b@x.com"), { ...play("3", "a@x.com"), formSlug: "collaborate" }],
      records,
    );
    assert.equal(a.decision, "Approved");
    assert.deepEqual(a.submitted, { name: "DJ 1", link: "https://www.instagram.com/dj/" });
    assert.equal(b.decision, "");
    assert.equal(other.decision, "");
    assert.equal(other.submitted, null);
  });

  it("lists approved artists, ops' name and link over what they sent", () => {
    const records = new Map([
      ["a@x.com", record("a@x.com", { decision: "Approved" })],
      ["b@x.com", record("b@x.com", { decision: "Approved", artistName: "Bee", artistLink: "https://bee.example/" })],
      ["c@x.com", record("c@x.com", { decision: "Declined" })],
    ]);
    const rows = withGuestRecords([play("1", "a@x.com"), play("2", "b@x.com"), play("3", "c@x.com")], records);
    assert.deepEqual(approvedArtists(rows), [
      { id: "2", name: "Bee", link: "https://bee.example/" },
      { id: "1", name: "DJ 1", link: "https://www.instagram.com/dj/" },
    ]);
  });

  it("turns their answer into a link, or nothing", () => {
    assert.equal(artistLink("djsomeone.co.uk"), "https://djsomeone.co.uk/");
    assert.equal(artistLink("https://instagram.com/x"), "https://instagram.com/x");
    assert.equal(artistLink("ask me"), "");
  });
});

describe("setFormDecision / setFormArtist", () => {
  /** Website DB (Form Submissions, 42) and Ops DB (with Guest artists, 60). */
  function mockBaserow({ guestTable = true, guests = [], submission = { formSlug: "play" } } = {}) {
    const writes = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/tables/all-tables/")) {
        return jsonResponse([
          { id: 42, name: "Form Submissions", database_id: 7 },
          ...opsCatalogTables(9),
          ...(guestTable ? [{ id: 60, name: "Guest artists", database_id: 9 }] : []),
          { id: 61, name: "Events", database_id: 9 },
          { id: 62, name: "Event dates", database_id: 9 },
        ]);
      }
      // No events here: planArtistUpdate has its own tests.
      if (url.includes("/rows/table/61/") || url.includes("/rows/table/62/")) {
        return jsonResponse({ results: [], next: null });
      }
      if (url.includes("/fields/table/")) return jsonResponse([]);
      if (url.includes("/rows/table/42/5/")) {
        return jsonResponse({
          id: 5,
          "Form Slug": submission.formSlug,
          "Reply To": "Artist@X.com",
          Current: true,
          Answers: "[]",
        });
      }
      if (url.includes("/rows/table/60/")) {
        if (init?.method === "POST" || init?.method === "PATCH") {
          const body = JSON.parse(init.body);
          writes.push([init.method, url.match(/table\/60\/(\d+)\//)?.[1] || "", body]);
          return jsonResponse({ id: 77, Email: "artist@x.com", ...body, Decision: body.Decision ? { value: body.Decision } : null });
        }
        return jsonResponse({ results: guests, next: null });
      }
      throw new Error(`unexpected ${url}`);
    });
    return writes;
  }

  it("keeps the decision in Guest artists by email, never on the submission", async () => {
    const writes = mockBaserow();
    assert.deepEqual(await setFormDecision(env, "5", "Approved"), { ok: true, decision: "Approved" });
    assert.deepEqual(writes, [["POST", "", { Email: "artist@x.com", Decision: "Approved" }]]);
  });

  it("updates the existing record for that email", async () => {
    const writes = mockBaserow({ guests: [{ id: 3, Email: "artist@x.com", Decision: { value: "Approved" } }] });
    await setFormArtist(env, "5", { name: "DJ Bee", link: "@djbee" });
    assert.deepEqual(writes, [
      ["PATCH", "3", { "Artist name": "DJ Bee", "Artist link": "https://www.instagram.com/djbee/" }],
    ]);
  });

  it("says so when the Guest artists table is missing", async () => {
    mockBaserow({ guestTable: false });
    await assert.rejects(setFormDecision(env, "5", "Approved"), { status: 503 });
  });

  it("only for play applications, and only real decisions and links", async () => {
    mockBaserow({ submission: { formSlug: "collaborate" } });
    await assert.rejects(setFormDecision(env, "5", "Approved"), { status: 400 });
    await assert.rejects(setFormDecision(env, "5", "Maybe"), { status: 400 });
    await assert.rejects(setFormArtist(env, "5", { link: "not a link" }), { status: 400 });
  });
});
