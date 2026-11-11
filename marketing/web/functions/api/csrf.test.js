/**
 * The sign-up and form POSTs take a request only from a page on this site:
 * the CSRF cookie and its X-CSRF-Token header (from GET), and an Origin (or,
 * without one, a Referer) that is the site's own. No shared secret: the old
 * X-Subscribe-Secret header is ignored, and knowing the old signing key gets
 * a request from another site nowhere. Called as the browser calls them;
 * storage is in memory, Sanity and email are fakes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryFormSubmissionRepository } from "../../../../shared/guests/adapters/memory-form-submissions.js";
import { memorySubscriberRepository } from "../../../../shared/guests/adapters/memory-subscribers.js";
import { partyFormDocument } from "../../../../migrations/2026-11-11-party-form.mjs";

vi.mock("../../../../shared/forms/form-email.js", () => ({
  sendFormNotificationEmail: vi.fn(async () => ({ ok: true, dryRun: true })),
  sendFormReceiptEmail: vi.fn(async () => ({ ok: true, dryRun: true })),
}));
vi.mock("../../../../shared/forms/form-alert.js", () => ({
  reportFormError: vi.fn(async () => undefined),
}));
vi.mock("../_lib/form-submit.js", async (importOriginal) => {
  const doc = partyFormDocument();
  return {
    ...(await importOriginal()),
    fetchFormForSubmit: vi.fn(async () => ({ ...doc, slug: doc.slug.current })),
  };
});

const subscribeApi = await import("./subscribe.js");
const formsApi = await import("./forms/index.js");

const SITE = "https://gwenda.co.uk";
const ELSEWHERE = "https://evil.example";
/** The signing key, public until this fix: knowing it must not help. */
const OLD_PUBLIC_KEY = "server-only-signing-key";

const inAMonth = () =>
  new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

const endpoints = [
  {
    path: "/api/subscribe",
    api: subscribeApi,
    body: () => ({ email: "sam@example.com", tag: "prelaunch", website: "" }),
    saved: (env) => env.subscriberRepository.listByEmail("sam@example.com"),
  },
  {
    path: "/api/forms",
    api: formsApi,
    body: () => ({
      slug: "party",
      website: "",
      answers: {
        name: "Sam Okafor",
        email: "sam@example.com",
        phone: "+44 7700 900123",
        occasion: "Birthday",
        date: inAMonth(),
        startTime: "7pm",
        people: "40",
        food: "Maybe",
        drinks: "Yes",
        music: "Don’t mind",
      },
    }),
    saved: async (env) =>
      (await env.formSubmissionRepository.exportAll()).formSubmissions,
  },
];

let ip = 0;
const nextIp = () => `198.51.100.${++ip % 250}`;

describe.each(endpoints)("POST $path", ({ path, api, body, saved }) => {
  let env;
  beforeEach(() => {
    env = {
      SITE_ENV: "dev",
      SUBSCRIBE_SECRET: OLD_PUBLIC_KEY,
      subscriberRepository: memorySubscriberRepository(),
      formSubmissionRepository: memoryFormSubmissionRepository(),
    };
  });

  /** What a page on the site gets first: the token and its cookie. */
  async function tokens() {
    const response = await api.onRequestGet({
      request: new Request(`${SITE}${path}`, {
        headers: { "CF-Connecting-IP": nextIp() },
      }),
      env,
    });
    expect(response.status).toBe(200);
    const { csrfToken } = await response.json();
    const cookie = (response.headers.get("Set-Cookie") ?? "").split(";")[0];
    return { csrfToken, cookie };
  }

  async function post(headers) {
    const sent = Object.fromEntries(
      Object.entries({
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        ...headers,
      }).filter(([, value]) => value != null),
    );
    const response = await api.onRequestPost({
      request: new Request(`${SITE}${path}`, {
        method: "POST",
        headers: sent,
        body: JSON.stringify(body()),
      }),
      env,
    });
    return { status: response.status, body: await response.json() };
  }

  /** A request from the site's own page, as the new script sends it. */
  async function fromThePage(overrides = {}) {
    const { csrfToken, cookie } = await tokens();
    return post({
      Cookie: cookie,
      "X-CSRF-Token": csrfToken,
      Origin: SITE,
      Referer: `${SITE}/contact/party`,
      ...overrides,
    });
  }

  it("takes a post from the site's page with the cookie and the header", async () => {
    const result = await fromThePage();
    expect(result).toMatchObject({ status: 200, body: { ok: true } });
    expect(await saved(env)).toHaveLength(1);
  });

  it("takes one with no Origin when the Referer is the site's", async () => {
    const result = await fromThePage({ Origin: null });
    expect(result.status).toBe(200);
    expect(await saved(env)).toHaveLength(1);
  });

  it("ignores the X-Subscribe-Secret an already open page still sends", async () => {
    const result = await fromThePage({ "X-Subscribe-Secret": "the-old-value" });
    expect(result.status).toBe(200);
    expect(await saved(env)).toHaveLength(1);
  });

  it.each([
    ["without the cookie", { Cookie: null }],
    ["without the header", { "X-CSRF-Token": null }],
    ["with a header that isn't the cookie's", { "X-CSRF-Token": "made-up" }],
    ["from another site", { Origin: ELSEWHERE, Referer: `${ELSEWHERE}/x` }],
    ["from a sandboxed page (Origin: null)", { Origin: "null" }],
    [
      "from another site that sends no Origin",
      { Origin: null, Referer: `${ELSEWHERE}/x` },
    ],
    [
      "that says where it comes from neither way",
      { Origin: null, Referer: null },
    ],
    [
      "from a look-alike host",
      { Origin: "https://gwenda.co.uk.evil.example", Referer: null },
    ],
  ])("refuses one %s, even with the old public key", async (_what, change) => {
    const result = await fromThePage({
      "X-Subscribe-Secret": OLD_PUBLIC_KEY,
      ...change,
    });
    expect(result.status).toBe(403);
    expect(await saved(env)).toHaveLength(0);
  });
});
