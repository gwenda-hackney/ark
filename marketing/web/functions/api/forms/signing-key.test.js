/**
 * The key that signs form links (verify, edit) stays on the server, and a
 * link only brings back the answers of the person it was sent to. Called as
 * the browser calls them: GET /api/forms and /api/subscribe for the tokens a
 * page gets, then GET /api/forms/verify and /api/forms/edit with a link.
 * Submissions live in the in-memory repository; Sanity is a fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryFormSubmissionRepository } from "../../../../../shared/guests/adapters/memory-form-submissions.js";
import {
  createFormEditToken,
  createFormVerifyToken,
} from "../../_lib/form-verify-auth.js";

vi.mock("../../_lib/form-submit.js", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchFormForSubmit: vi.fn(async () => null),
}));

const { onRequestGet: getForms } = await import("./index.js");
const { onRequestGet: getSubscribe } = await import("../subscribe.js");
const { onRequestGet: verify } = await import("./verify.js");
const { onRequestGet: edit } = await import("./edit.js");

const SITE = "https://gwenda.co.uk";
const SERVER_KEY = "server-only-signing-key";
const JANE = "jane@example.com";

let repo;
let env;
let ip = 0;

const request = (path) =>
  new Request(`${SITE}${path}`, {
    headers: { "CF-Connecting-IP": `203.0.113.${++ip % 250}` },
  });

const janesAnswers = (email = JANE) => [
  { key: "name", label: "Name", value: "Jane Victim" },
  { key: "email", label: "Email", value: email },
  { key: "phone", label: "Phone", value: "+447700900123" },
];

async function submission({ replyTo = JANE, status = "Verified" } = {}) {
  const record = await repo.create({
    formSlug: "party",
    formTitle: "Party",
    submittedAt: new Date().toISOString(),
    replyTo,
    status,
    current: true,
    answers: janesAnswers(replyTo || JANE),
  });
  return String(record.id);
}

/** Every value a page can read from these endpoints: the JSON and the cookie. */
async function whatTheBrowserSees(response) {
  const body = await response.json();
  const seen = Object.values(body).filter((value) => typeof value === "string");
  const cookie = response.headers.get("Set-Cookie") ?? "";
  const cookieValue = cookie.split(";")[0].split("=").slice(1).join("=");
  if (cookieValue) seen.push(decodeURIComponent(cookieValue));
  return { body, seen };
}

const openLink = (handler, path, token) =>
  handler({ request: request(`${path}?t=${encodeURIComponent(token)}`), env });

const expired = () => Date.now() - 1000;

beforeEach(() => {
  repo = memoryFormSubmissionRepository();
  env = {
    SITE_ENV: "dev",
    SUBSCRIBE_SECRET: SERVER_KEY,
    formSubmissionRepository: repo,
  };
});

describe("the tokens a page gets", () => {
  it.each([
    ["/api/forms", getForms],
    ["/api/subscribe", getSubscribe],
  ])(
    "GET %s gives a CSRF token and cookie, never the signing key",
    async (path, get) => {
      const response = await get({ request: request(path), env });
      expect(response.status).toBe(200);
      const { body, seen } = await whatTheBrowserSees(response);
      expect(body.csrfToken).toEqual(expect.any(String));
      expect(response.headers.get("Set-Cookie")).toMatch(
        /^gwenda_subscribe_csrf=.+HttpOnly; SameSite=Strict/,
      );
      expect(body).not.toHaveProperty("secret");
      expect(seen).not.toContain(SERVER_KEY);
    },
  );
});

describe("a link signed with anything a page can see", () => {
  it.each([
    ["/api/forms", getForms],
    ["/api/subscribe", getSubscribe],
  ])(
    "from GET %s reads no submission, and looks none up",
    async (path, get) => {
      const rowId = await submission();
      const { seen } = await whatTheBrowserSees(
        await get({ request: request(path), env }),
      );
      expect(seen.length).toBeGreaterThan(0);
      const lookups = vi.spyOn(repo, "get");

      for (const key of seen) {
        const visible = { SUBSCRIBE_SECRET: key };
        // Jane's own address: only the key is in the attacker's way.
        const claims = { rowId, email: JANE, slug: "party" };
        const links = [
          [
            verify,
            "/api/forms/verify",
            await createFormVerifyToken(visible, { ...claims, exp: 1 }),
          ],
          [
            verify,
            "/api/forms/verify",
            await createFormVerifyToken(visible, claims),
          ],
          [edit, "/api/forms/edit", await createFormEditToken(visible, claims)],
        ];
        for (const [handler, linkPath, token] of links) {
          const response = await openLink(handler, linkPath, token);
          const text = await response.text();
          expect(
            response.status,
            `${linkPath} signed with a visible value`,
          ).toBe(400);
          expect(text).not.toContain("Jane Victim");
          expect(text).not.toContain("+447700900123");
          expect(JSON.parse(text)).not.toHaveProperty("draftAnswers");
        }
      }
      expect(lookups).not.toHaveBeenCalled();
    },
  );

  it("with a bad signature, even expired, looks nothing up", async () => {
    const rowId = await submission();
    const lookups = vi.spyOn(repo, "get");
    const token = await createFormVerifyToken(
      { SUBSCRIBE_SECRET: "a-guess" },
      { rowId, email: JANE, slug: "party", exp: expired() },
    );
    const response = await openLink(verify, "/api/forms/verify", token);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "invalid",
      error: "This link isn't valid.",
    });
    expect(lookups).not.toHaveBeenCalled();
  });
});

describe("a verify link brings answers back only to whoever sent them", () => {
  it("an expired link for Jane's submission, made out to someone else, gets nothing", async () => {
    const rowId = await submission();
    const token = await createFormVerifyToken(env, {
      rowId,
      email: "someone-else@example.com",
      slug: "party",
      exp: expired(),
    });
    const response = await openLink(verify, "/api/forms/verify", token);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, reason: "expired" });
    expect(body).not.toHaveProperty("draftAnswers");
  });

  it("a live link for Jane's submission, made out to someone else, gets nothing", async () => {
    const rowId = await submission({ status: "Pending" });
    const token = await createFormVerifyToken(env, {
      rowId,
      email: "someone-else@example.com",
      slug: "party",
    });
    const response = await openLink(verify, "/api/forms/verify", token);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body).not.toHaveProperty("draftAnswers");
    expect((await repo.get(rowId)).status).toBe("Pending");
  });

  it("Jane's own expired link still fills the form in again", async () => {
    // An older record kept her address as she typed it.
    const rowId = await submission({ replyTo: "Jane@Example.com" });
    const token = await createFormVerifyToken(env, {
      rowId,
      email: JANE,
      slug: "party",
      exp: expired(),
    });
    const response = await openLink(verify, "/api/forms/verify", token);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      reason: "expired",
      formPath: "/contact/party",
      draftAnswers: { name: "Jane Victim", phone: "+447700900123" },
    });
  });

  it("Jane's own live link confirms her and fills the form in again", async () => {
    const rowId = await submission({ status: "Pending" });
    const token = await createFormVerifyToken(env, {
      rowId,
      email: JANE,
      slug: "party",
    });
    const response = await openLink(verify, "/api/forms/verify", token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      draftAnswers: { name: "Jane Victim" },
      email: JANE,
    });
    expect((await repo.get(rowId)).status).toBe("Verified");
  });
});

describe("an edit link brings answers back only to whoever sent them", () => {
  it("a submission with no reply-to address shows nothing", async () => {
    const rowId = await submission({ replyTo: "" });
    const token = await createFormEditToken(env, {
      rowId,
      email: JANE,
      slug: "party",
    });
    const response = await openLink(edit, "/api/forms/edit", token);
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty("draftAnswers");
  });

  it("a link made out to someone else shows nothing", async () => {
    const rowId = await submission();
    const token = await createFormEditToken(env, {
      rowId,
      email: "someone-else@example.com",
      slug: "party",
    });
    const response = await openLink(edit, "/api/forms/edit", token);
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty("draftAnswers");
  });

  it("Jane's own link shows her answers, whatever the case of her address", async () => {
    const rowId = await submission({ replyTo: "Jane@Example.com" });
    const token = await createFormEditToken(env, {
      rowId,
      email: JANE,
      slug: "party",
    });
    const response = await openLink(edit, "/api/forms/edit", token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      draftAnswers: { name: "Jane Victim" },
    });
  });
});
