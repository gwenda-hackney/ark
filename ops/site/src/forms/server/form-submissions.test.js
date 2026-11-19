import assert from "node:assert/strict";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import { d1ArtistRepository } from "../../../../../shared/artists/d1-artists.js";
import { d1FormSubmissionRepository } from "../../../../../shared/guests/adapters/d1-form-submissions.js";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
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
import { EMPTY_FORM_SUBMISSION } from "../../../../../shared/guests/form-submissions.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A dev env with fresh ops and website databases. */
function databases(extra = {}) {
  return { SITE_ENV: "dev", OPS_DB: createTestD1("ops"), WEBSITE_DB: createTestD1("website"), ...extra };
}

/** Save a form submission in the env's website database. */
function submit(env, fields) {
  return d1FormSubmissionRepository(env.WEBSITE_DB).create({ ...EMPTY_FORM_SUBMISSION, ...fields });
}

describe("mapFormSubmission", () => {
  const record = (fields) => ({ ...EMPTY_FORM_SUBMISSION, id: 4, ...fields });

  it("reads name, email, and other answers", () => {
    const mapped = mapFormSubmission(
      record({
        formSlug: "play",
        formTitle: "Play at Gwenda",
        replyTo: "Alex@Example.com",
        status: "Verified",
        current: true,
        submittedAt: "2026-09-24T12:00:00Z",
        answers: {
          entries: [
            { key: "name", label: "Name", value: "Alex" },
            { key: "email", label: "Email", value: "alex@example.com" },
            { key: "note", label: "Note", value: "Thursday" },
          ],
        },
      }),
    );
    assert.equal(mapped.id, "4");
    assert.equal(mapped.name, "Alex");
    assert.equal(mapped.email, "alex@example.com");
    assert.equal(mapped.status, "Verified");
    assert.equal(mapped.formTitle, "Play at Gwenda");
    assert.deepEqual(mapped.answers, [{ key: "note", label: "Note", value: "Thursday" }]);
  });

  it("exposes the email sent stamps", () => {
    const mapped = mapFormSubmission(record({ notifySentAt: "2026-09-24T10:00:00Z" }));
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

/** Sanity and Gmail, mocked. Returns what was sent and where Sanity was asked. */
function mockResend({ form = PLAY_FORM } = {}) {
  const sent = [];
  const sanityUrls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
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
  return { sent, sanityUrls };
}

const playSubmission = (extra = {}) => ({
  formSlug: "play",
  replyTo: "alex@example.com",
  current: true,
  answers: {
    entries: [
      { key: "name", label: "Name", value: "Alex" },
      { key: "email", label: "Email", value: "alex@example.com" },
    ],
  },
  ...extra,
});

describe("resendFormEmail", () => {
  let resendEnv;
  const baseEnv = {
    SANITY_API_TOKEN: "sanity",
    SANITY_PROJECT_ID: "gwscpagy",
    SITE_ENV: "local",
    FORMS_NOTIFY_EMAIL: "dev@example.com",
  };
  beforeAll(async () => {
    resendEnv = { ...baseEnv, GMAIL_SERVICE_ACCOUNT_JSON: await serviceAccountJson() };
  });

  it("asks this environment's website to send the receipt, and stamps nothing itself", async () => {
    const calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ ok: true, sentAt: "2026-11-11T12:00:00.000Z" });
    });

    const result = await resendFormEmail({ ...resendEnv, FORMS_ADMIN_SECRET: "admin" }, "501", "receipt");

    assert.deepEqual(result, { ok: true, sentAt: "2026-11-11T12:00:00.000Z" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gwenda-web-dev.pages.dev/api/forms/admin/resend");
    assert.equal(calls[0].init.headers.Authorization, "Bearer admin");
    assert.deepEqual(JSON.parse(calls[0].init.body), { rowId: "501", kind: "receipt" });
  });

  it("sends the notification to this environment's notify address", async () => {
    const env = databases(resendEnv);
    const row = await submit(env, playSubmission());
    const { sent, sanityUrls } = mockResend();
    const result = await resendFormEmail(env, String(row.id), "notify");
    assert.match(sent[0], /^To: dev@example\.com/m);
    const saved = await d1FormSubmissionRepository(env.WEBSITE_DB).get(row.id);
    assert.ok(result.sentAt);
    assert.equal(saved.notifySentAt, result.sentAt);
    // The live site's form: production dataset, no drafts.
    assert.match(sanityUrls[0].pathname, /\/data\/query\/production$/);
    assert.equal(sanityUrls[0].searchParams.get("perspective"), "published");
    assert.equal(sanityUrls[0].searchParams.get("$slug"), '"play"');
  });

  it("does not stamp the row when mail is not set up (dry run)", async () => {
    const env = databases(baseEnv);
    const row = await submit(env, playSubmission());
    const { sent } = mockResend();
    const result = await resendFormEmail(env, String(row.id), "notify");
    assert.deepEqual(result, { ok: true, dryRun: true });
    assert.equal(sent.length, 0);
    assert.equal((await d1FormSubmissionRepository(env.WEBSITE_DB).get(row.id)).notifySentAt, null);
  });

  it("rejects unknown kinds, missing rows and forms", async () => {
    const env = databases(baseEnv);
    mockResend();
    await assert.rejects(resendFormEmail(env, "1", "verify"), { status: 400 });
    await assert.rejects(resendFormEmail(env, "1", "notify"), { status: 404 });
    vi.restoreAllMocks();
    const row = await submit(env, playSubmission());
    mockResend({ form: null });
    await assert.rejects(resendFormEmail(env, String(row.id), "notify"), {
      status: 404,
      message: 'Form "play" is not in Sanity.',
    });
  });
});

describe("listFormSubmissions", () => {
  it("keeps only current submissions, newest first", async () => {
    const env = databases();
    const answers = (name) => [{ key: "name", label: "Name", value: name }];
    await submit(env, { formTitle: "Play", replyTo: "old@example.com", submittedAt: "2026-01-01T00:00:00Z", current: true, answers: answers("Old") });
    await submit(env, { formTitle: "Play", replyTo: "new@example.com", submittedAt: "2026-09-01T00:00:00Z", current: true, answers: answers("New") });
    await submit(env, { formTitle: "Play", replyTo: "gone@example.com", submittedAt: "2026-08-01T00:00:00Z", current: false, answers: [] });

    const rows = await listFormSubmissions(env);
    assert.deepEqual(
      rows.map((row) => row.email),
      ["new@example.com", "old@example.com"],
    );
  });

  it("fails when the website database can't be reached", async () => {
    await assert.rejects(() => listFormSubmissions({ SITE_ENV: "dev" }), /WEBSITE_DB/);
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
  /** A play application (id returned) from artist@x.com, and ops' guest artists. */
  async function application({ guests = [], formSlug = "play" } = {}) {
    const env = databases();
    if (guests.length) await d1ArtistRepository(env.OPS_DB).importAll({ artists: [], guestArtists: guests });
    const row = await submit(env, { formSlug, replyTo: "Artist@X.com", current: true, answers: [] });
    return { env, id: String(row.id), guests: () => d1ArtistRepository(env.OPS_DB).listGuestArtists() };
  }

  it("keeps the decision in Guest artists by email, never on the submission", async () => {
    const { env, id, guests } = await application();
    assert.deepEqual(await setFormDecision(env, id, "Approved"), { ok: true, decision: "Approved" });
    const [guest] = await guests();
    assert.deepEqual([guest.email, guest.decision], ["artist@x.com", "Approved"]);
    const submission = await d1FormSubmissionRepository(env.WEBSITE_DB).get(Number(id));
    assert.equal("decision" in submission, false);
  });

  it("updates the existing record for that email", async () => {
    const { env, id, guests } = await application({
      guests: [{ id: 3, email: "artist@x.com", decision: "Approved", artistName: "", artistLink: "" }],
    });
    await setFormArtist(env, id, { name: "DJ Bee", link: "@djbee" });
    assert.deepEqual(await guests(), [
      { id: 3, email: "artist@x.com", decision: "Approved", artistName: "DJ Bee", artistLink: "https://www.instagram.com/djbee/" },
    ]);
  });

  it("only for play applications, and only real decisions and links", async () => {
    const { env, id } = await application({ formSlug: "collaborate" });
    await assert.rejects(setFormDecision(env, id, "Approved"), { status: 400 });
    await assert.rejects(setFormDecision(env, id, "Maybe"), { status: 400 });
    await assert.rejects(setFormArtist(env, id, { link: "not a link" }), { status: 400 });
  });
});
