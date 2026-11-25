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
  access: { owner: true, role: { id: 1, name: "Owner" }, levels: {} },
  frozen: [],
};

/** Users → People and Roles: an owner, and the two roles (#375). */
export const ROLES = [
  { id: 1, name: "Owner", owner: true, isDefault: false, areas: {}, people: 1 },
  { id: 3, name: "Marketing", owner: false, isDefault: true, areas: { "whats-on": "edit", email: "edit" }, people: 0 },
];
export const USERS = [{ id: "1", _id: "1", email: ME.email, active: true, roleId: 1 }];

/** Email → People: enough guests that the list scrolls. */
export const PEOPLE = {
  people: Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    email: `guest${index + 1}@example.com`,
    source: "Wi-Fi",
    acquiredOn: "2026-11-21",
    lastSeenOn: "2026-11-21",
    visitDays: 1,
    onListSince: null,
    unsubscribedOn: null,
    mailchimp: { status: "off", label: "Did not consent", tone: "neutral", detail: "" },
  })),
  counts: { total: 60, in: 0, waiting: 0, unsubscribed: 0, off: 60 },
};

/** Enquiries: what came through two of the website's forms. */
const enquiry = (id: string, formSlug: string, formTitle: string, name: string) => ({
  id,
  formSlug,
  formTitle,
  email: `${name.toLowerCase()}@example.com`,
  name,
  status: "",
  decision: "",
  artistName: "",
  artistLink: "",
  submitted: null,
  submittedAt: "2026-11-20T18:00:00.000Z",
  current: true,
  notifySentAt: "",
  receiptSentAt: "",
  answers: [],
});
export const ENQUIRIES = [
  enquiry("1", "play", "Play at Gwenda", "Ava"),
  enquiry("2", "party", "Christmas parties", "Ben"),
  enquiry("3", "play", "Play at Gwenda", "Cy"),
];

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
/** The Photos page's pictures and one event's, for the email's picture chooser. */
export const GALLERY = {
  photos: [
    { key: "p1", asset: "image-aaa111-1600x1200-jpg", description: "The bar at night", url: "https://cdn.sanity.io/images/test/production/aaa111-1600x1200.jpg", width: 1600, height: 1200, added: "", addedBy: "", menu: null },
    { key: "p2", asset: "image-ddd444-1600x1200-jpg", description: "The terrace", url: "https://cdn.sanity.io/images/test/production/ddd444-1600x1200.jpg", width: 1600, height: 1200, added: "", addedBy: "", menu: null },
    { key: "p3", asset: "image-eee555-1600x1200-jpg", description: "The decks", url: "https://cdn.sanity.io/images/test/production/eee555-1600x1200.jpg", width: 1600, height: 1200, added: "", addedBy: "", menu: null },
  ],
  fromEvents: [
    { id: "36", name: "Chez Pickle", photos: [{ key: "e1", url: "https://cdn.sanity.io/images/test/production/bbb222-1200x1500.jpg", width: 1200, height: 1500, added: "" }], more: 0, tooSmall: 0 },
  ],
  website: "live",
};

/** What Event cards can show: one night and one pop-up kitchen. */
export const CARDS = [
  {
    id: "night-12-2026-12-03",
    group: "Nights",
    label: "Karaoke",
    detail: "Thursday 3 December, 8pm – 11:30pm",
    card: { kind: "event", eventId: "12", date: "2026-12-03", tag: "", title: "Karaoke", when: "8pm – 11:30pm", note: "Sing your heart out.", link: "https://gwenda.example/whats-on/karaoke/", assetId: "image-aaa111-1600x1200-jpg" },
  },
  {
    id: "series-38",
    group: "Pop-up kitchens",
    label: "Pinsa A Roma",
    detail: "Mondays and Tuesdays",
    card: { kind: "event", eventId: "38", date: "", tag: "Pop-up kitchen", title: "Pinsa A Roma", when: "Mondays and Tuesdays", note: "", link: "https://gwenda.example/whats-on/pinsa-a-roma/", assetId: "" },
  },
];

export async function fakeApi(page: Page, { email }: { email: OneOffFixture }) {
  const saves: Record<string, unknown>[] = [];
  /** Each new order the Photos page put (PUT /api/venue/gallery), newest last. */
  const orders: string[][] = [];
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
    if (pathname === "/api/users") return json({ users: USERS });
    if (pathname === "/api/email/people") return json(PEOPLE);
    if (pathname === "/api/forms") return json({ submissions: ENQUIRIES });
    if (pathname === "/api/roles") return json({ roles: ROLES });
    if (pathname === "/api/venue/gallery") {
      if (request.method() === "PUT") {
        const { keys } = request.postDataJSON();
        orders.push(keys);
        const photos = keys.map((key: string) => GALLERY.photos.find((photo) => photo.key === key)).filter(Boolean);
        return json({ ...GALLERY, photos, published: true, warnings: [] });
      }
      return json(GALLERY);
    }
    if (pathname === "/api/email/cards") return json({ choices: CARDS });
    if (pathname === "/api/email/images") return json({ assetId: "image-ccc333-800x600-jpg", url: "https://cdn.sanity.io/images/test/production/ccc333-800x600.jpg" });
    return json({ ok: true });
  });
  return Object.assign(saves, { orders });
}
