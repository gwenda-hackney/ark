/**
 * The /api ops' pages call, answered by the test (playwright.config.ts): just
 * enough of each for a page to open, with what a test needs changed per test.
 * Anything not answered here gets `{ ok: true }`, so a page that asks for more
 * still opens; pictures from Sanity and the website come back as a pixel.
 */
import type { Page, Request } from "@playwright/test";

export const ME = {
  email: "owner@example.com",
  mode: "local",
  siteEnv: "dev",
  envLabel: "Test",
  databaseId: "test",
  databaseLabel: "Test database",
  isProductionDb: false,
  risk: null,
  isAdmin: true,
  frozen: [],
};

export const FRAME = {
  site: {
    origin: "https://gwenda.example",
    name: "Gwenda",
    social: "Social",
    instagram: "https://www.instagram.com/gwendahackney",
    whatsOn: "https://gwenda.example/whats-on",
    mapsUrl: "https://maps.example",
    address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
  },
  images: { projectId: "test", dataset: "production" },
  logoUrl: "https://gwenda.example/brand/logo-email-social.png",
};

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export type OneOffFixture = {
  id: number;
  name?: string;
  subject?: string;
  previewText?: string;
  status?: string;
  sections: unknown[];
};

function emailRecord(email: OneOffFixture) {
  return {
    name: "",
    subject: "",
    previewText: "",
    status: "draft",
    campaignId: "",
    campaignWebId: "",
    recipients: null,
    reason: "",
    createdBy: ME.email,
    updatedBy: ME.email,
    createdAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    scheduledFor: null,
    sentAt: null,
    ...email,
  };
}

/**
 * Answers ops' /api for a page with one one-off email in it. Returns the
 * drafts the page saved (each PATCH's body), newest last.
 */
export async function fakeApi(page: Page, { email }: { email: OneOffFixture }) {
  const saves: Record<string, unknown>[] = [];
  let current = emailRecord(email);
  await page.route(/^https:\/\/(cdn\.sanity\.io|gwenda\.example)\//, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
  );
  await page.route("**/api/**", async (route) => {
    const request: Request = route.request();
    const { pathname } = new URL(request.url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/auth/me") return json(ME);
    if (pathname === "/api/config") return json({ pourTargets: {}, values: {}, settings: {} });
    if (pathname === "/api/email/one-off") return json({ emails: [current] });
    if (pathname === `/api/email/one-off/${email.id}`) {
      if (request.method() === "PATCH") {
        const draft = request.postDataJSON();
        saves.push(draft);
        current = { ...current, ...draft, updatedAt: new Date().toISOString() };
      }
      return json({ email: current, frame: FRAME, access: { mailchimp: false, audience: false } });
    }
    if (pathname === "/api/email/status") {
      return json({
        ok: true,
        access: { mailchimp: false, audience: false },
        settings: { sending: false, mode: "auto", day: "tue", time: "11:00", notify: [] },
        schedule: { month: "2026-11-01", state: "off", scheduled: null, next: { date: "2026-12-01", time: "11:00" } },
        current: null,
        stuck: false,
        history: [],
        historyProblem: "",
        me: { email: ME.email, isAdmin: true },
      });
    }
    if (pathname === "/api/web/jobs") return json({ ok: true, jobs: [] });
    return json({ ok: true });
  });
  return saves;
}
