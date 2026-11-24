/**
 * An in-memory world for use-case tests: everything ops talks to over HTTP,
 * faked behind one global `fetch`, so tests drive the real API handlers.
 *
 * - D1: the ops, website and config databases (SQLite with the real
 *   migrations), bound as OPS_DB, WEBSITE_DB and CONFIG_DB. Set config with
 *   world.setConfig(name, value, { env, service }); read what ops kept with
 *   world.events() and world.menu() (the repositories).
 * - Sanity: documents in memory, queried with groq-js (the real GROQ engine)
 *   under the raw / published / previewDrafts perspectives.
 * - Google: service-account tokens, Drive folders, Calendar events, Gmail sends.
 * - Mailchimp: one audience and its campaigns. A world's env has no Mailchimp
 *   key, like dev; `world.mailchimp.connect(world.env)` gives it one.
 *
 * Every world gets fresh random tokens, so ops' module-level caches (keyed by
 * token) never carry one test's data into the next. Anything not faked throws
 * with the URL, so a new outside call shows up as a failing test.
 */
import { evaluate, parse } from "groq-js";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { d1UserRepository } from "../users/server/adapters/d1-users.js";
import { resetAccessCacheForTests } from "../access/server/access.js";
import { OWNER_ROLE_ID } from "../users/server/role-repository.js";
import { eventRepository } from "../events/server/event-repository.js";
import { menuRepository } from "../menu/server/menu-repository.js";

const SANITY_PROJECT_ID = "gwscpagy";
const DRIVE_EVENTS_ROOT = "drive-events-root";
const CALENDAR_ID = "events@group.calendar.google.com";

let nextId = 1000;
const newId = () => (nextId += 1);

// ----------------------------------------------------------------- Sanity

class FakeSanity {
  constructor() {
    this.docs = new Map();
    this.rev = 0;
  }

  /** Documents as a perspective sees them. */
  view(perspective) {
    const all = [...this.docs.values()];
    if (perspective === "raw") return all;
    const published = all.filter((doc) => !doc._id.startsWith("drafts."));
    if (perspective === "published") return published;
    const byId = new Map(published.map((doc) => [doc._id, doc]));
    for (const doc of all) {
      if (doc._id.startsWith("drafts.")) {
        const id = doc._id.slice("drafts.".length);
        byId.set(id, { ...doc, _id: id, _originalId: doc._id });
      }
    }
    return [...byId.values()];
  }

  /** Published docs of a type, for assertions. */
  published(type) {
    return this.view("published").filter((doc) => !type || doc._type === type);
  }

  drafts(type) {
    return [...this.docs.values()].filter((doc) => doc._id.startsWith("drafts.") && (!type || doc._type === type));
  }

  async handle(url, init) {
    const method = (init.method || "GET").toUpperCase();
    if (/\/data\/query\//.test(url.pathname) && method === "GET") {
      const params = {};
      for (const [key, value] of url.searchParams) {
        if (key.startsWith("$")) params[key.slice(1)] = JSON.parse(value);
      }
      const tree = parse(url.searchParams.get("query"), { params });
      const value = await evaluate(tree, { dataset: this.view(url.searchParams.get("perspective") || "raw"), params });
      return json({ result: await value.get() });
    }
    if (/\/data\/mutate\//.test(url.pathname) && method === "POST") {
      const { mutations } = JSON.parse(init.body);
      const results = [];
      for (const mutation of mutations) results.push(this.mutate(mutation));
      return json({ transactionId: `tx-${this.rev}`, results });
    }
    if (/\/assets\/images\//.test(url.pathname) && method === "POST") {
      // Like Sanity: the id is a hash of the bytes, so the same photo is one asset.
      const bytes = init.body == null ? new Uint8Array() : new Uint8Array(await new Response(init.body).arrayBuffer());
      const sha1 = Buffer.from(await crypto.subtle.digest("SHA-1", bytes)).toString("hex");
      const filename = url.searchParams.get("filename") || "upload.jpg";
      // 800 × 600, or the size a test names at the end of the file's name ("chez-240x240.jpg").
      const named = /-(\d+)x(\d+)\.[a-z]+$/i.exec(filename);
      const [width, height] = named ? [Number(named[1]), Number(named[2])] : [800, 600];
      const id = `image-${sha1}-${width}x${height}-jpg`;
      if (this.docs.has(id)) return json({ document: this.docs.get(id) });
      // Its size in the metadata too, as Sanity has it: the website reads it there.
      const doc = {
        _id: id,
        _type: "sanity.imageAsset",
        _createdAt: new Date().toISOString(),
        originalFilename: filename,
        url: `https://cdn.sanity.test/${id}.jpg`,
        metadata: { dimensions: { width, height, aspectRatio: width / height } },
      };
      this.docs.set(id, doc);
      return json({ document: doc });
    }
    throw new Error(`Fake Sanity: unhandled ${method} ${url.pathname}`);
  }

  stamp(doc) {
    this.rev += 1;
    const now = new Date().toISOString();
    return { _createdAt: now, ...doc, _updatedAt: now, _rev: `rev-${this.rev}` };
  }

  mutate(mutation) {
    const [kind, body] = Object.entries(mutation)[0];
    if (kind === "create" || kind === "createOrReplace" || kind === "createIfNotExists") {
      const id = body._id || `doc-${newId()}`;
      const exists = this.docs.has(id);
      if (kind === "create" && exists) throw new Error(`Fake Sanity: document ${id} already exists`);
      if (!(kind === "createIfNotExists" && exists)) this.docs.set(id, this.stamp({ ...body, _id: id }));
      return { id, operation: exists ? "update" : "create" };
    }
    if (kind === "patch") {
      const doc = this.docs.get(body.id);
      if (!doc) throw new Error(`Fake Sanity: patch on missing document ${body.id}`);
      const next = structuredClone(doc);
      for (const [path, value] of Object.entries(body.setIfMissing || {})) if (getPath(next, path) === undefined) setPath(next, path, value);
      for (const [path, value] of Object.entries(body.set || {})) setPath(next, path, value);
      for (const path of body.unset || []) setPath(next, path, undefined);
      this.docs.set(body.id, this.stamp(next));
      return { id: body.id, operation: "update" };
    }
    if (kind === "delete") {
      this.docs.delete(body.id);
      return { id: body.id, operation: "delete" };
    }
    throw new Error(`Fake Sanity: mutation ${kind} not faked`);
  }
}

function getPath(doc, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), doc);
}

function setPath(doc, path, value) {
  const keys = path.split(".");
  let node = doc;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  if (value === undefined) delete node[keys.at(-1)];
  else node[keys.at(-1)] = value;
}

// ----------------------------------------------------------------- Google

class FakeGoogle {
  constructor() {
    this.driveFiles = new Map([[DRIVE_EVENTS_ROOT, { id: DRIVE_EVENTS_ROOT, name: "Events", mimeType: "application/vnd.google-apps.folder", parents: [] }]]);
    this.calendarEvents = new Map();
    /** Mail sent through Gmail: { to, subject, text, message }. */
    this.mail = [];
  }

  /** Calendar events on the events calendar, for assertions. */
  calendar() {
    return [...this.calendarEvents.values()];
  }

  /** Drive folders directly under the events root. */
  eventFolders() {
    return [...this.driveFiles.values()].filter((file) => file.parents.includes(DRIVE_EVENTS_ROOT) && !file.trashed);
  }

  handle(url, init) {
    const method = (init.method || "GET").toUpperCase();
    if (url.host === "oauth2.googleapis.com" && url.pathname === "/token") {
      return json({ access_token: `google-token-${newId()}`, expires_in: 3600, token_type: "Bearer" });
    }
    if (url.host === "gmail.googleapis.com" && method === "POST" && url.pathname.endsWith("/messages/send")) {
      const raw = JSON.parse(init.body || "{}").raw || "";
      const message = Buffer.from(raw, "base64url").toString("utf8");
      const header = (name) => message.match(new RegExp(`^${name}: (.*)$`, "mi"))?.[1]?.trim() || "";
      // The text part, decoded when the composer encoded it.
      const [head, ...rest] = message.split(/\r?\n\r?\n/);
      const body = rest.join("\n\n");
      const text = /^Content-Transfer-Encoding: base64/im.test(head)
        ? Buffer.from(body, "base64").toString("utf8")
        : /^Content-Transfer-Encoding: quoted-printable/im.test(head)
          ? body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          : body;
      this.mail.push({ to: header("To"), subject: header("Subject"), text, message });
      return json({ id: `gmail-${newId()}` });
    }
    if (url.pathname === "/upload/drive/v3/files" && method === "POST") return this.driveUpload(init);
    if (url.pathname.startsWith("/drive/v3/files")) return this.drive(url, init, method);
    if (url.pathname.startsWith("/calendar/v3/")) return this.calendarApi(url, init, method);
    throw new Error(`Fake Google: unhandled ${method} ${url.host}${url.pathname}`);
  }

  /** A multipart upload: the JSON metadata part, then the bytes. */
  driveUpload(init) {
    const raw = new TextDecoder("latin1").decode(init.body);
    const metadata = JSON.parse(raw.split("\r\n\r\n")[1].split("\r\n--")[0]);
    const mimeType = raw.match(/--[^\r]+\r\nContent-Type: (image\/[a-z]+)/)?.[1] || "image/jpeg";
    // Uploads in order of creation, so "newest first" is testable.
    const createdTime = new Date(Date.UTC(2026, 0, 1) + newId() * 1000).toISOString();
    const file = {
      id: `drive-${newId()}`,
      name: metadata.name,
      mimeType,
      parents: metadata.parents || [],
      createdTime,
      ...(metadata.appProperties ? { appProperties: metadata.appProperties } : {}),
    };
    this.driveFiles.set(file.id, file);
    return json(file);
  }

  drive(url, init, method) {
    const id = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/)?.[1];
    if (!id && method === "GET") {
      const q = url.searchParams.get("q") || "";
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const name = q.match(/name = '([^']*)'/)?.[1];
      const folderOnly = q.includes("mimeType = 'application/vnd.google-apps.folder'");
      const files = [...this.driveFiles.values()].filter(
        (file) =>
          !file.trashed &&
          (!parent || file.parents.includes(parent)) &&
          (name == null || file.name === name) &&
          (!folderOnly || file.mimeType === "application/vnd.google-apps.folder"),
      );
      return json({ files: files.map((file) => ({ ...file, webViewLink: `https://drive.google.com/drive/folders/${file.id}` })) });
    }
    if (!id && method === "POST") {
      const body = JSON.parse(init.body || "{}");
      const file = { id: `drive-${newId()}`, name: body.name, mimeType: body.mimeType, parents: body.parents || [] };
      this.driveFiles.set(file.id, file);
      return json({ ...file, webViewLink: `https://drive.google.com/drive/folders/${file.id}` });
    }
    const file = this.driveFiles.get(id);
    if (!file) return json({ error: { message: "File not found" } }, 404);
    if (method === "GET" && url.searchParams.get("alt") === "media") {
      // Bytes of its own per file: Sanity keeps one asset for identical photos.
      const bytes = new Blob([file.id, new Uint8Array(2048).fill(9)]);
      return new Response(bytes, { headers: { "Content-Type": file.mimeType } });
    }
    if (method === "GET") return json(file);
    if (method === "PATCH") {
      const { appProperties, ...rest } = JSON.parse(init.body || "{}");
      Object.assign(file, rest);
      if (appProperties) file.appProperties = { ...(file.appProperties || {}), ...appProperties };
      const add = url.searchParams.get("addParents");
      const remove = url.searchParams.get("removeParents");
      if (add || remove) file.parents = [...file.parents.filter((parent) => parent !== remove), ...(add ? [add] : [])];
      return json(file);
    }
    if (method === "DELETE") {
      this.driveFiles.delete(id);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Fake Google Drive: unhandled ${method} ${url.pathname}`);
  }

  calendarApi(url, init, method) {
    const match = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!match) throw new Error(`Fake Google Calendar: unhandled ${url.pathname}`);
    const eventId = match[2] ? decodeURIComponent(match[2]) : "";
    if (!eventId && method === "GET") {
      const min = url.searchParams.get("timeMin") || "";
      const max = url.searchParams.get("timeMax") || "￿";
      const items = this.calendar().filter((event) => {
        const start = event.start?.dateTime || event.start?.date || "";
        return start >= min.slice(0, start.length) && start < max;
      });
      return json({ items });
    }
    if (!eventId && method === "POST") {
      const event = { id: `cal-${newId()}`, status: "confirmed", ...JSON.parse(init.body || "{}") };
      this.calendarEvents.set(event.id, event);
      return json(event);
    }
    const event = this.calendarEvents.get(eventId);
    if (!event) return json({ error: { message: "Not Found" } }, 404);
    if (method === "PATCH" || method === "PUT") {
      Object.assign(event, JSON.parse(init.body || "{}"));
      return json(event);
    }
    if (method === "DELETE") {
      this.calendarEvents.delete(eventId);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Fake Google Calendar: unhandled ${method} ${url.pathname}`);
  }
}

let serviceAccountJson;
/** A throwaway service account with a real RSA key, so ops can sign its JWT. */
async function testServiceAccount() {
  if (!serviceAccountJson) {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
    serviceAccountJson = JSON.stringify({
      type: "service_account",
      client_email: "ops-tests@gwenda-dev.iam.gserviceaccount.com",
      private_key: pem,
    });
  }
  return serviceAccountJson;
}

// -------------------------------------------------------------- Mailchimp

/**
 * Mailchimp's Marketing API with one audience, the way the real account has
 * one. Nothing leaves the process: `tests` is every test email asked for,
 * `audienceSends` every send to the whole audience, `log` every call.
 * `fail` makes a step answer badly: { create | content | test | send |
 * delete | audience | campaign: { status, detail, landed } } (`landed`: the
 * send happened but the answer was an error, as when a response is lost).
 */
class FakeMailchimp {
  constructor(suffix) {
    this.key = `mc-${suffix}-us99`;
    this.listId = "list-test";
    this.memberCount = 244;
    this.campaigns = new Map();
    this.deleted = [];
    this.tests = [];
    this.audienceSends = [];
    this.log = [];
    this.fail = {};
    this.nextCampaign = 1;
    /** Report numbers by campaign id: { uniqueOpens, uniqueClicks, unsubscribed, bounces }. */
    this.reportStats = new Map();
    /** Sent campaigns of another audience in the same account, as /reports lists them. */
    this.otherListReports = [];
  }

  /** Give an env this account's key and audience. */
  connect(env) {
    env.MAILCHIMP_API_KEY = this.key;
    env.MAILCHIMP_AUDIENCE_ID = this.listId;
  }

  /** Campaigns still in the account. */
  drafts() {
    return [...this.campaigns.values()].filter((campaign) => campaign.status === "save");
  }

  failure(step) {
    const failure = this.fail[step];
    if (!failure) return null;
    if (failure.once) delete this.fail[step];
    return failure;
  }

  refuse(failure) {
    return json({ title: "Error", status: failure.status || 500, detail: failure.detail || "It broke." }, failure.status || 500);
  }

  handle(url, init) {
    const method = (init.method || "GET").toUpperCase();
    const path = url.pathname.replace(/^\/3\.0/, "");
    this.log.push(`${method} ${path}`);
    if (url.host !== "us99.api.mailchimp.com") throw new Error(`Fake Mailchimp: wrong data centre ${url.host}`);
    if ((init.headers?.Authorization || init.headers?.authorization) !== `Basic ${btoa(`anystring:${this.key}`)}`) {
      return json({ title: "API Key Invalid", status: 401, detail: "Your API key may be invalid." }, 401);
    }
    const body = init.body ? JSON.parse(init.body) : {};
    const step = (name) => this.failure(name);

    if (method === "GET" && path === `/lists/${this.listId}`) {
      const failure = step("audience");
      if (failure) return this.refuse(failure);
      return json({
        id: this.listId,
        name: "Gwenda",
        stats: { member_count: this.memberCount },
        campaign_defaults: { from_name: "Gwenda", from_email: "hello@example.com" },
      });
    }
    if (method === "GET" && path === "/reports") {
      const failure = step("reports");
      if (failure) return this.refuse(failure);
      const ours = [...this.campaigns.values()]
        .filter((campaign) => campaign.status === "sent")
        .map((campaign) => {
          const stats = this.reportStats.get(campaign.id) || {};
          const sent = campaign.emails_sent;
          const opens = stats.uniqueOpens || 0;
          const clicks = stats.uniqueClicks || 0;
          return {
            id: campaign.id,
            list_id: this.listId,
            subject_line: campaign.settings.subject_line,
            send_time: campaign.send_time,
            emails_sent: sent,
            unsubscribed: stats.unsubscribed || 0,
            bounces: { hard_bounces: stats.bounces || 0, soft_bounces: 0, syntax_errors: 0 },
            opens: { unique_opens: opens, open_rate: sent ? opens / sent : 0 },
            clicks: { unique_subscriber_clicks: clicks, click_rate: sent ? clicks / sent : 0 },
          };
        });
      const others = this.otherListReports.map((report) => ({ list_id: "another-list", emails_sent: 1, ...report }));
      return json({ reports: [...others, ...ours], total_items: others.length + ours.length });
    }
    if (method === "POST" && path === "/campaigns") {
      const failure = step("create");
      if (failure) return this.refuse(failure);
      if (body.recipients?.list_id !== this.listId) return json({ status: 400, detail: "No such list." }, 400);
      const id = `camp${this.nextCampaign}`;
      const campaign = {
        id,
        web_id: 5000 + this.nextCampaign,
        type: body.type,
        status: "save",
        emails_sent: 0,
        send_time: "",
        recipients: { list_id: this.listId, recipient_count: this.memberCount },
        settings: { ...body.settings },
        content: null,
      };
      this.nextCampaign += 1;
      this.campaigns.set(id, campaign);
      return json(campaign);
    }
    const match = path.match(/^\/campaigns\/([^/]+)(\/content|\/actions\/test|\/actions\/send)?$/);
    if (!match) throw new Error(`Fake Mailchimp: unhandled ${method} ${path}`);
    const campaign = this.campaigns.get(match[1]);
    const missing = () => json({ title: "Resource Not Found", status: 404, detail: "The requested resource could not be found." }, 404);
    const action = match[2] || "";
    if (!action && method === "GET") {
      const failure = step("campaign");
      if (failure) return this.refuse(failure);
      return campaign ? json(campaign) : missing();
    }
    if (!action && method === "PATCH") {
      if (!campaign) return missing();
      Object.assign(campaign.settings, body.settings || {});
      return json(campaign);
    }
    if (!action && method === "DELETE") {
      const failure = step("delete");
      if (failure) return this.refuse(failure);
      if (!campaign) return missing();
      if (campaign.status !== "save") return json({ status: 400, detail: "A sent campaign can't be deleted this way." }, 400);
      this.campaigns.delete(campaign.id);
      this.deleted.push(campaign);
      return new Response(null, { status: 204 });
    }
    if (action === "/content" && method === "PUT") {
      const failure = step("content");
      if (failure) return this.refuse(failure);
      if (!campaign) return missing();
      campaign.content = { html: body.html, plain_text: body.plain_text };
      return json(campaign.content);
    }
    if (action === "/actions/test" && method === "POST") {
      const failure = step("test");
      if (failure) return this.refuse(failure);
      if (!campaign) return missing();
      if (!campaign.content?.html) return json({ status: 400, detail: "The campaign has no content." }, 400);
      this.tests.push({
        campaignId: campaign.id,
        to: body.test_emails,
        subject: campaign.settings.subject_line,
        html: campaign.content.html,
      });
      return new Response(null, { status: 204 });
    }
    if (action === "/actions/send" && method === "POST") {
      const failure = step("send");
      if (failure && !failure.landed) return this.refuse(failure);
      if (!campaign) return missing();
      // Like Mailchimp: a campaign goes out once.
      if (campaign.status !== "save") return json({ status: 400, detail: "This campaign has already been sent." }, 400);
      if (!campaign.content?.html) return json({ status: 400, detail: "The campaign has no content." }, 400);
      campaign.status = "sent";
      campaign.emails_sent = this.memberCount;
      campaign.send_time = new Date().toISOString();
      this.audienceSends.push({
        campaignId: campaign.id,
        subject: campaign.settings.subject_line,
        html: campaign.content.html,
        recipients: this.memberCount,
      });
      if (failure) return this.refuse(failure);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Fake Mailchimp: unhandled ${method} ${path}`);
  }
}

// ------------------------------------------------------------------ world

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * A fresh world with its own tokens and data. `install()` replaces global
 * fetch; `restore()` puts it back (call it in afterEach).
 */
export async function createFakeWorld() {
  const sanity = new FakeSanity();
  const google = new FakeGoogle();
  const suffix = crypto.randomUUID();
  const mailchimp = new FakeMailchimp(suffix);
  // The D1 databases, each SQLite with the real migrations.
  const opsDb = createTestD1("ops");
  const websiteDb = createTestD1("website");
  const configDb = createTestD1("config");
  /**
   * Set a config value, as an admin would in Developer tools (dev, ops unless
   * given). Synchronous, so a test can set one anywhere.
   */
  function setConfig(name, value, { env: envName = "dev", service = "ops" } = {}) {
    const sql = (text) => `'${String(text).replaceAll("'", "''")}'`;
    configDb.exec(
      `INSERT INTO config_values (name, value, env, service) VALUES (${sql(name)}, ${sql(value)}, ${sql(envName)}, ${sql(service)})
       ON CONFLICT (name, env, service) DO UPDATE SET value = excluded.value`,
    );
    resetConfigCacheForTests();
    resetAccessCacheForTests();
  }
  setConfig("google.drive_events_folder_id", DRIVE_EVENTS_ROOT);
  setConfig("google.calendar_id", CALENDAR_ID);
  setConfig("sanity.project_id", SANITY_PROJECT_ID, { service: "all" });
  await d1UserRepository(opsDb).create({ name: "Editor", email: "editor@gwenda.co.uk", active: true });

  const serviceAccount = await testServiceAccount();
  const env = {
    SITE_ENV: "dev",
    SANITY_PROJECT_ID,
    SANITY_API_TOKEN: `sanity-${suffix}`,
    OPS_DB: opsDb,
    WEBSITE_DB: websiteDb,
    CONFIG_DB: configDb,
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: serviceAccount,
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    OPS_SESSION_SECRET: `session-${suffix}`,
    DEPLOY_WEBHOOK_SECRET: `deploy-${suffix}`,
  };

  const calls = [];
  const realFetch = globalThis.fetch;
  async function fakeFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const merged = request
      ? { method: request.method, headers: Object.fromEntries(request.headers), body: await request.text(), ...init }
      : { ...init, headers: init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers || {} };
    calls.push(`${(merged.method || "GET").toUpperCase()} ${url.host}${url.pathname}`);
    if (url.host.endsWith(".api.sanity.io") || url.host.endsWith(".apicdn.sanity.io")) return sanity.handle(url, merged);
    if (url.host.endsWith("googleapis.com")) return google.handle(url, merged);
    if (url.host.endsWith(".api.mailchimp.com")) return mailchimp.handle(url, merged);
    // The Sanity image CDN: the bytes of any asset, by its address.
    if (url.host === "cdn.sanity.io") {
      return new Response(new Blob([url.pathname, new Uint8Array(1024).fill(5)]), { headers: { "Content-Type": "image/jpeg" } });
    }
    throw new Error(`Fake world: nothing fakes ${merged.method || "GET"} ${url}`);
  }

  return {
    env,
    setConfig,
    /** What ops keeps of events and nights, through the repository. */
    events: () => eventRepository(env),
    /** What ops keeps of the menu and inventory, through the repository. */
    menu: () => menuRepository(env),
    sanity,
    google,
    mailchimp,
    calls,
    /**
     * Make someone an owner (#375): on the ops users list with the Owner
     * role, in whatever ops database the world has now. Synchronous.
     */
    makeOwner(email) {
      const sql = (text) => `'${String(text).replaceAll("'", "''")}'`;
      env.OPS_DB.exec(
        `INSERT INTO users (name, email, active, role_id) VALUES ('', ${sql(email)}, 1, ${OWNER_ROLE_ID})
         ON CONFLICT (email) DO UPDATE SET role_id = excluded.role_id, active = 1`,
      );
      resetAccessCacheForTests();
    },
    install() {
      globalThis.fetch = fakeFetch;
      resetAccessCacheForTests();
    },
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

/**
 * Call an ops Pages Function the way Cloudflare does. `path` is the URL path,
 * `params` the route params, `body` JSON for POST/PATCH/PUT.
 */
export async function callApi(world, handler, { method = "GET", path = "/", params = {}, body, headers = {} } = {}) {
  // FormData (file uploads) goes as multipart; anything else as JSON.
  const multipart = body instanceof FormData;
  const request = new Request(`https://gwenda-ops-dev.pages.dev${path}`, {
    method,
    headers: { ...(body === undefined || multipart ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const response = await handler({ request, env: { ...world.env }, params, data: {}, waitUntil() {} });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}
