/**
 * Use case: staff press Resend receipt on the Forms page, and the person's
 * "Change it" link in that email opens their answers on the website. Ops
 * asks this environment's website to send it; here that website is its real
 * handlers (marketing/web/functions/api/forms/admin/resend.js, and edit.js
 * for opening the link) with the key it holds now. Submissions live in the
 * in-memory repository both apps share; Sanity, the settings and Gmail are
 * faked (testing/fake-world.js), so no email leaves the process.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { memoryFormSubmissionRepository } from "../../../../shared/guests/adapters/memory-form-submissions.js";
import { onRequestPost as websiteResend } from "../../../../marketing/web/functions/api/forms/admin/resend.js";
import { onRequestGet as websiteEdit } from "../../../../marketing/web/functions/api/forms/edit.js";
import { createFormEditToken } from "../../../../marketing/web/functions/_lib/form-verify-auth.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { onRequestPost as resend } from "../../functions/api/forms/[id]/resend.js";

const JANE = "jane@example.com";
const DEV_WEBSITE = "https://gwenda-web-dev.pages.dev";
const ADMIN_SECRET = "forms-admin-secret";
const KEY_BEFORE = "website-key-before-the-change";
const KEY_NOW = "website-key-now";

const PARTY_FORM = {
  _id: "form-party",
  _type: "form",
  enabled: true,
  title: "Have a party",
  slug: { current: "party" },
  fromEmail: "events@gwenda.co.uk",
  fields: [
    { _key: "n", key: "name", label: "Name", type: "text" },
    { _key: "e", key: "email", label: "Email", type: "email" },
    { _key: "g", key: "guests", label: "Guests", type: "text" },
  ],
};

let world;
let submissions;
/** The dev website: its env, and whether it answers at all. */
let website;

beforeEach(async () => {
  world = await createFakeWorld();
  world.install();
  world.sanity.docs.set(PARTY_FORM._id, PARTY_FORM);
  // Outside production every email goes to the safe inbox instead.
  world.baserow.insert("Config", {
    Name: "forms.notify_email",
    Value: "safe-inbox@example.com",
    Env: "dev",
    Service: "web",
  });
  submissions = memoryFormSubmissionRepository();
  const gmail = world.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  Object.assign(world.env, {
    FORMS_ADMIN_SECRET: ADMIN_SECRET,
    GMAIL_SERVICE_ACCOUNT_JSON: gmail,
    formSubmissionRepository: submissions,
  });
  website = {
    online: true,
    env: {
      SITE_ENV: "dev",
      SANITY_PROJECT_ID: world.env.SANITY_PROJECT_ID,
      SANITY_API_TOKEN: world.env.SANITY_API_TOKEN,
      BASEROW_CONFIG_API_KEY: world.env.BASEROW_CONFIG_API_KEY,
      GMAIL_SERVICE_ACCOUNT_JSON: gmail,
      FORMS_ADMIN_SECRET: ADMIN_SECRET,
      SUBSCRIBE_SECRET: KEY_NOW,
      formSubmissionRepository: submissions,
    },
  };
  const worldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== DEV_WEBSITE) return worldFetch(input, init);
    if (!website.online) throw new TypeError("fetch failed");
    if (url.pathname !== "/api/forms/admin/resend") throw new Error(`The website has no ${url.pathname} here`);
    return websiteResend({ request: new Request(url, init), env: website.env });
  };
});
afterEach(() => world.restore());

/** Jane's party enquiry, with the link the website saved when she sent it. */
async function janesEnquiry({ savedLinkKey = KEY_BEFORE } = {}) {
  const record = await submissions.create({
    formSlug: "party",
    formTitle: "Have a party",
    submittedAt: "2026-11-01T18:00:00Z",
    replyTo: JANE,
    status: "Verified",
    current: true,
    answers: [
      { key: "name", label: "Name", value: "Jane" },
      { key: "email", label: "Email", value: JANE },
      { key: "guests", label: "Guests", value: "30" },
    ],
  });
  const token = await createFormEditToken(
    { SUBSCRIBE_SECRET: savedLinkKey },
    { rowId: record.id, email: JANE, slug: "party" },
  );
  await submissions.update(record.id, { editLink: `${DEV_WEBSITE}/contact/edit?t=${token}` });
  return String(record.id);
}

const resendReceipt = (id) =>
  callApi(world, resend, {
    method: "POST",
    path: `/api/forms/${id}/resend`,
    params: { id },
    body: { kind: "receipt" },
  });

/** The "Change it" address in a sent email, as the reader's mail app shows it. */
function changeItLink(mail) {
  const decoded = mail.message
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const links = [...decoded.matchAll(/https:\/\/[^\s"<>]+\/contact\/edit\?t=[\w.-]+/g)].map((m) => m[0]);
  assert.ok(links.length, "the receipt has a Change it link");
  assert.equal(new Set(links).size, 1, "every Change it link in the email is the same");
  return links[0];
}

/** Jane opens the link: the website's edit endpoint, with the website's key now. */
async function openOnWebsite(link) {
  const request = new Request(link.replace("/contact/edit", "/api/forms/edit"), {
    headers: { "CF-Connecting-IP": "203.0.113.7" },
  });
  const response = await websiteEdit({ request, env: website.env });
  return { status: response.status, body: await response.json() };
}

describe("Resend receipt", () => {
  it("the receipt's link works after the website's key changes", async () => {
    const id = await janesEnquiry({ savedLinkKey: KEY_BEFORE });

    const { status, data } = await resendReceipt(id);

    assert.equal(status, 200, JSON.stringify(data));
    assert.equal(data.ok, true);
    assert.equal(world.google.mail.length, 1);
    const link = changeItLink(world.google.mail[0]);
    assert.equal(new URL(link).origin, DEV_WEBSITE);
    const opened = await openOnWebsite(link);
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.deepEqual(opened.body.draftAnswers, { name: "Jane", email: JANE, guests: "30" });
    // The page shows it sent, as stamped on the submission.
    assert.equal((await submissions.get(Number(id))).receiptSentAt, data.sentAt);
  });

  it("shows why when the website won't send it", async () => {
    const id = await janesEnquiry();
    world.sanity.docs.delete(PARTY_FORM._id);

    const { status, data } = await resendReceipt(id);

    assert.equal(status, 424);
    assert.equal(data.error, `The website didn't send the receipt: Form "party" is not in Sanity.`);
    assert.equal(world.google.mail.length, 0);
    assert.equal((await submissions.get(Number(id))).receiptSentAt, null);
  });

  it("shows why when the website refuses ops", async () => {
    const id = await janesEnquiry();
    website.env.FORMS_ADMIN_SECRET = "a-different-secret";

    const { status, data } = await resendReceipt(id);

    assert.equal(status, 424);
    assert.equal(data.error, "The website refused ops: its FORMS_ADMIN_SECRET is not the same as ops'.");
    assert.equal(world.google.mail.length, 0);
  });

  it("shows why when the website can't be reached", async () => {
    const id = await janesEnquiry();
    website.online = false;

    const { status, data } = await resendReceipt(id);

    assert.equal(status, 424);
    assert.equal(data.error, `Couldn't reach the website (${DEV_WEBSITE}): fetch failed`);
    assert.equal(world.google.mail.length, 0);
    assert.equal((await submissions.get(Number(id))).receiptSentAt, null);
  });
});
