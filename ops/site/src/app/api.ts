import { createCoalescer } from "../ui/coalesce";
import { NOT_OPS_USER, bootAction, goToGate, pending, showForbidden } from "./boot";

const coalesce = createCoalescer();

/**
 * The one place a signed-out or removed user is caught, for every request.
 * True when the page is leaving for the gate (or blocked): callers then wait
 * on `pending()`, so no page paints an error on the way out.
 */
export async function handleAuthFailure(res: Response): Promise<boolean> {
  const action = bootAction(res);
  if (action === "gate") {
    goToGate();
    return true;
  }
  if (action === "forbidden") {
    const data = (await res.clone().json().catch(() => ({}))) as { code?: string };
    if (data.code !== NOT_OPS_USER) return false;
    showForbidden();
    return true;
  }
  return false;
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    redirect: "manual",
    credentials: "same-origin",
  });
  if (await handleAuthFailure(res)) return pending<T>();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export type AuthMe = {
  email: string | null;
  mode: "google" | "password" | "misconfigured";
  siteEnv: "local" | "preview" | "production" | string;
  envLabel: string;
  databaseId: string | null;
  databaseLabel: string;
  isProductionDb: boolean;
  risk: "nonprod_on_production_db" | "production_on_nonprod_db" | null;
  /** Sees developer tools. Always true in dev. */
  isAdmin?: boolean;
};

export function getMe() {
  return request<AuthMe>("/api/auth/me");
}

export function getMenu() {
  return coalesce("menu", () =>
    request<{
      sections: import("../menu/types").MenuSection[];
      posMenus?: import("../menu/types").PosMenu[];
    }>("/api/menu"),
  );
}

export function getPosMenus() {
  return request<{ posMenus: import("../menu/types").PosMenu[] }>("/api/pos-menus");
}

export function createPosMenu(body: { name: string; isDefault?: boolean }) {
  return request<{ posMenu: import("../menu/types").PosMenu }>("/api/pos-menus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updatePosMenu(
  id: string,
  body: { name?: string; isDefault?: boolean; orderRank?: number },
) {
  return request<{ posMenu: import("../menu/types").PosMenu }>(
    `/api/pos-menus/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function deletePosMenu(id: string) {
  return request(`/api/pos-menus/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export function createSection(body: unknown) {
  return request<{ section: import("../menu/types").MenuSection }>(
    "/api/menu/sections",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function updateSection(id: string, body: unknown) {
  return request<{ section: import("../menu/types").MenuSection }>(
    `/api/menu/sections/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function deleteSection(id: string) {
  return request(`/api/menu/sections/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export function createItem(body: unknown) {
  return request<{ item: import("../menu/types").MenuItem }>("/api/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateItem(id: string, body: unknown) {
  return request<{ item: import("../menu/types").MenuItem }>(
    `/api/menu/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function deleteItem(id: string) {
  return request(`/api/menu/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

/** The menu's Update website: every menu change goes on gwenda.co.uk (#42). */
export function publishMenu() {
  return request<{
    sync?: { missing?: string[] };
    /** Menu documents published. */
    published: number;
    /** The /menu build started. */
    building: boolean;
    warnings: string[];
  }>("/api/menu/publish", { method: "POST" });
}

export function importRecipes(text: string) {
  return request<{ matched?: unknown[]; unmatched?: string[] }>(
    "/api/menu/import",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
  );
}

export async function uploadPhoto(form: FormData) {
  const res = await fetch("/api/menu/image", { method: "POST", body: form });
  if (await handleAuthFailure(res)) return pending<never>();
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    item?: import("../menu/types").MenuItem;
  };
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data;
}

export async function deletePhoto(itemId: string) {
  const res = await fetch(
    `/api/menu/image?itemId=${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
  if (await handleAuthFailure(res)) return pending<never>();
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    item?: import("../menu/types").MenuItem;
  };
  if (!res.ok) throw new Error(data.error || "Could not remove photo.");
  return data;
}

export function getInventory(all = false) {
  const q = all ? "?all=1" : "";
  const key = all ? "inventory:all" : "inventory";
  return coalesce(key, () =>
    request<{ items: import("../inventory/types").InventoryItem[] }>(`/api/inventory${q}`),
  );
}

export function createInventoryItem(body: unknown) {
  return request<{ item: import("../inventory/types").InventoryItem }>("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateInventoryItem(id: string, body: unknown) {
  return request<{ item: import("../inventory/types").InventoryItem }>(
    `/api/inventory/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function deleteInventoryItem(id: string) {
  return request(`/api/inventory/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export function previewLightspeedCsv(
  text: string,
  body: {
    apply?: boolean;
    menuName?: string;
    action?:
      | "preview"
      | "save"
      | "add"
      | "add-stock"
      | "archive"
      | "unarchive"
      | "link"
      | "stamp-skus";
    items?: Array<{
      sku?: string;
      name?: string;
      sectionId?: string;
      drinkType?: string;
      price?: string;
      defaultPrice?: number | null;
      quantity?: number | null;
      unit?: string;
      onPrintMenu?: boolean;
      onDigitalMenu?: boolean;
      posMenuIds?: string[];
      menuScreen?: string;
      priceAlt?: string;
    }>;
    rows?: Array<{ sku?: string; name?: string }>;
    skus?: string[];
    patches?: Array<{ id?: string; lightspeedSku?: string }>;
    links?: Array<{
      itemId?: string;
      sku?: string;
      name?: string;
      adoptName?: boolean;
    }>;
  } = {},
) {
  return request<import("../inventory/types").LightspeedPreview>(
    "/api/inventory/lightspeed",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        apply: Boolean(body.apply) || body.action === "save",
        menuName: body.menuName || "",
        action: body.action || (body.apply ? "save" : "preview"),
        items: body.items,
        rows: body.rows,
        skus: body.skus,
        patches: body.patches,
        links: body.links,
      }),
    },
  );
}

export function getSuppliers() {
  return coalesce("suppliers", () =>
    request<{ suppliers: import("../inventory/types").CatalogSupplier[] }>(
      "/api/suppliers",
    ),
  );
}

export function createSupplier(body: unknown) {
  return request<{ supplier: import("../inventory/types").CatalogSupplier }>(
    "/api/suppliers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function updateSupplier(id: string, body: unknown) {
  return request<{ supplier: import("../inventory/types").CatalogSupplier }>(
    `/api/suppliers/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function deleteSupplier(id: string) {
  return request(`/api/suppliers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export type FormAnswer = {
  key: string;
  label: string;
  value: string;
};

export type FormSubmission = {
  id: string;
  formSlug: string;
  formTitle: string;
  email: string;
  name: string;
  status: string;
  /** Ops' answer to a play application: "Approved", "Declined" or "". */
  decision: FormDecision;
  /** Ops' own artist name and link for a play applicant; "" means use what they sent. */
  artistName: string;
  artistLink: string;
  /** What a play applicant sent (artist name, Instagram or website); null for other forms. */
  submitted: { name: string; link: string } | null;
  submittedAt: string;
  current: boolean;
  /** ISO time the ops notification went out, or "" if never. */
  notifySentAt: string;
  /** ISO time the applicant receipt went out, or "" if never. */
  receiptSentAt: string;
  answers: FormAnswer[];
};

export type FormEmailKind = "notify" | "receipt";

export type FormDecision = "Approved" | "Declined" | "";

export function setFormDecision(id: string, decision: FormDecision) {
  return request<{ ok: boolean; decision: FormDecision }>(
    `/api/forms/${encodeURIComponent(id)}/decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    },
  );
}

export function setFormArtist(id: string, artist: { name: string; link: string }) {
  return request<{ ok: boolean; artistName: string; artistLink: string; eventsUpdated: number }>(
    `/api/forms/${encodeURIComponent(id)}/artist`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(artist),
    },
  );
}

/** An approved play applicant: pickable as a guest artist, with their link. */
export type ApprovedArtist = { id: string; name: string; link: string };

export function getApprovedArtists() {
  return request<{ artists: ApprovedArtist[] }>("/api/forms/artists");
}

export function getFormSubmissions() {
  return request<{ submissions: FormSubmission[] }>("/api/forms");
}

export function resendFormEmail(id: string, kind: FormEmailKind) {
  return request<{ ok: true; sentAt?: string | null; dryRun?: boolean; warning?: string }>(
    `/api/forms/${encodeURIComponent(id)}/resend`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    },
  );
}

export function getOpsUsers() {
  return coalesce("users", () =>
    request<{ users: import("../users/types").OpsUser[] }>("/api/users"),
  );
}

export function createOpsUser(body: unknown) {
  return request<{ user: import("../users/types").OpsUser }>("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateOpsUser(id: string, body: unknown) {
  return request<{ user: import("../users/types").OpsUser }>(
    `/api/users/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function deleteOpsUser(id: string) {
  return request(`/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export function analyzeRecipeNote(body: { item: unknown; analysis: unknown }) {
  return request<{ ok: boolean; text: string; model?: string }>(
    "/api/menu/analyze",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function getConfig() {
  return coalesce("config", () =>
    request<{
      pourTargets: import("../menu/types").PourTargetMap;
      values: Record<string, string>;
    }>("/api/config"),
  );
}

export function updateConfig(body: {
  pourTargets?: Partial<import("../menu/types").PourTargetMap>;
  reset?: boolean;
}) {
  return request<{
    ok: boolean;
    pourTargets: import("../menu/types").PourTargetMap;
  }>("/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type WebEnvId = "preview" | "production";

export type WebEnvStatus = {
  id: WebEnvId;
  label: string;
  hosted: boolean;
  siteUrl: string | null;
  dataset: string;
  git: string;
  code: {
    commit: string | null;
    env: string | null;
    dataset: string | null;
    error: string | null;
  };
  content: {
    hash: string | null;
    count: number;
    updatedAt: string | null;
    error: string | null;
  };
  health: {
    ok: boolean | null;
    down: boolean;
    lastError: string | null;
    lastCheckedAt: number | null;
    consecutiveFails?: number;
  };
};

export type WebStatus = {
  environments: Record<WebEnvId, WebEnvStatus>;
  drift: {
    inSync: boolean;
    codeAhead: boolean;
    contentAhead: boolean;
    unknown: boolean;
  };
  driftLabel: string;
  lastError: string | null;
  promote: {
    toPreview: boolean;
    toProduction: boolean;
  };
};

export function getWebStatus() {
  return coalesce("web-status", () => request<WebStatus>("/api/web/status"));
}

/** Rebuild the preview site. The live site is published from Website > Preview → live. */
export function promoteWebsite(target: "preview") {
  return request<{
    ok: boolean;
    kind?: string;
    runId?: number;
    runUrl?: string;
    alreadyRunning?: boolean;
    error?: string;
  }>("/api/web/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: target }),
  });
}

export type ReleaseField = {
  key: string;
  label: string;
  preview: string;
  production: string;
  detailOnly: boolean;
};

export type ReleaseEntry = {
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  change: "added" | "changed" | "removed";
  fields: ReleaseField[];
  refs: string[];
};

export type ReleaseDiff = {
  ok: boolean;
  /** Local ops can look but never publish. */
  local: boolean;
  entries: ReleaseEntry[];
  counts: { added: number; changed: number; removed: number };
};

export function getReleaseDiff() {
  return request<ReleaseDiff>("/api/web/release");
}

export type CodeDiff = {
  ok: boolean;
  preview: string | null;
  live: string | null;
  /** null when a site's version is unknown. */
  same: boolean | null;
  aheadBy?: number;
  behindBy?: number;
  url?: string;
  files?: number;
  commits: { sha: string; url: string; message: string; author: string; date: string }[];
  error?: string;
};

export type SitePendingItem = {
  kind: "document" | "artist";
  id: string;
  change: "added" | "changed" | "removed";
  label: string;
  type: string;
};

/** One site's "waiting to show on the website" state. */
export type SiteStatus = {
  site: "production" | "preview";
  /** False until the first build after this feature records a snapshot. */
  known: boolean;
  builtAt: string | null;
  items: SitePendingItem[];
  updating: boolean;
  runUrl: string;
  failed: boolean;
  needsHelp: boolean;
  lastError: string;
  autoUpdateAt: string | null;
};

export function getSitePending() {
  return coalesce("site-pending", () =>
    request<{
      ok: boolean;
      local: boolean;
      /** This environment's website and preview (dev ops: the dev website). */
      urls?: { live: string; preview: string };
      production: SiteStatus;
      preview: SiteStatus;
    }>(
      "/api/web/pending",
    ),
  );
}

export function updateSiteNow(site: "production" | "preview" = "production") {
  return request<{ ok: boolean; status: SiteStatus }>("/api/web/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ site }),
  });
}

export type SettingValue = { value: string | null; from: string };

/** One setting across environments (shared/config.js describeSettings). */
export type SettingRow = {
  key: string;
  service: string;
  about: string;
  values: Record<string, SettingValue>;
  machine: SettingValue;
  local: { env: string; required: boolean; hint: string; value: string | null } | null;
};

export type SettingsOverview = {
  environments: string[];
  current: string;
  onMachine: boolean;
  settings: SettingRow[];
  unknown: { key: string; env: string; service: string; value: string }[];
  state: { key: string; env: string; service: string; size: number }[];
};

export function getSettingsOverview() {
  return request<SettingsOverview & { ok: boolean }>("/api/web/settings");
}

export function getCodeDiff() {
  return request<CodeDiff>("/api/web/code");
}

export type DbTableDiff = {
  name: string;
  status: "same" | "different" | "missing" | "extra";
  sourceRows: number;
  targetRows: number;
  sourceOnly: number;
  targetOnly: number;
  missingColumns: string[];
  extraColumns: string[];
};

export type DbPairDiff = {
  ok: boolean;
  id: "ops" | "website";
  label: string;
  copyLabel: string;
  source: { label: string; databaseId: string };
  target: { label: string; databaseId: string };
  inSync: boolean;
  tables: DbTableDiff[];
  checkedAt: string;
};

export function getDbPairDiff(pair: "ops" | "website") {
  return request<DbPairDiff>(`/api/web/databases?pair=${pair}`);
}

/** What a copy of production over dev covers (copy-prod-to-dev.yml). */
export type DevCopyTarget = "everything" | "content" | "ops-data" | "website-data";

export function startDevCopy(target: DevCopyTarget) {
  return request<{ ok: boolean; runId?: number | null; runUrl?: string; status?: string }>(
    "/api/web/dev-copy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, confirm: target }),
    },
  );
}

export function publishRelease(
  ids: string[] | null,
  direction: "to-production" | "discard" = "to-production",
) {
  return request<{
    ok: boolean;
    written: string[];
    deleted: string[];
    discarded?: string[];
    included: string[];
    warnings: string[];
    deploy: { runId?: number; runUrl?: string; alreadyRunning?: boolean } | null;
  }>("/api/web/release", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirm: direction === "discard" ? "preview" : "production",
      direction,
      ...(ids ? { ids } : {}),
    }),
  });
}

export type DeployStatus = {
  ok: boolean;
  runId: number;
  runUrl?: string;
  status: string;
  conclusion: string | null;
  completed: boolean;
  phase?: string;
};

export function getDeployStatus(runId: number) {
  return request<DeployStatus>(
    `/api/web/deploy-status?run_id=${encodeURIComponent(String(runId))}`,
  );
}

/**
 * An event photo. Since #183 it lives in Sanity: `asset` is its id and `url`
 * its cdn.sanity.io address. Older ones are Baserow files (name and url only).
 */
export type OpsEventImage = {
  name: string;
  url: string;
  asset?: string;
  width?: number;
  height?: number;
};

/** What happened to preview after a save. Saving never fails because of it. */
export type EventPreview = {
  ok: boolean;
  /** Local ops staged a draft for the local site only. */
  local: boolean;
  error?: string;
  warnings: string[];
  deployed?: boolean;
};

export type OpsNightScheduleSlot = {
  label: string;
  startTime: string;
  endTime: string;
};

export type OpsEventOccurrence = {
  id: string;
  date: string;
  slug: string;
  sanityId: string;
  clickupTaskId: string;
  isSpecialEdition: boolean;
  overrides: {
    name: string;
    artist: string;
    offer: string;
    pageUrl?: string;
    description: string;
    shortDescription: string;
    time: string;
    startTime: string;
    endTime: string;
    nightSchedule: OpsNightScheduleSlot[] | null;
    operationsNotes: string;
    imageLinks: string[];
    image: OpsEventImage | null;
    heroCrops: Record<string, unknown> | null;
  };
};

export type OpsEvent = {
  id: string;
  name: string;
  artist: string;
  offer: string;
  /** Listed on the website's Play at Gwenda form (#41). */
  takingApplications?: boolean;
  pageUrl: string;
  description: string;
  shortDescription: string;
  nightSchedule: OpsNightScheduleSlot[];
  operationsNotes: string;
  imageLinks: string[];
  startsOn: string;
  time: string;
  startTime: string;
  endTime: string;
  repeatEvery: number;
  repeatUnit: "none" | "once" | "day" | "week" | "month";
  weekdays: string[];
  monthDay: number;
  endsOn: string;
  skippedDates: string[];
  extraDates: string[];
  slug: string;
  replacesSeries: string;
  driveFolderId: string;
  driveFolderUrl: string;
  mainImage: OpsEventImage | null;
  heroCrops: Record<string, unknown> | null;
  /** Newest first; null while the series' gallery is still in Drive (#183). */
  gallery: OpsGalleryPhoto[] | null;
  dates: OpsEventOccurrence[];
  publish: {
    preview: "unpublished" | "stale" | "current";
    live: "unpublished" | "stale" | "current";
    nextDate: string;
    previewDates: string[];
  };
};

export function getEvents() {
  return request<{ events: OpsEvent[] }>("/api/events");
}

/** Deleted in ops, still on the website until Update website (#23). */
export type DeletedEvent = OpsEvent & { deletedAt: string; documentIds: string[] };

export function getDeletedEvents() {
  return request<{ events: DeletedEvent[] }>("/api/events?deleted=1");
}

/** Undo a delete that hasn't reached the website yet. */
export function restoreEvent(id: string) {
  return request<{ ok: boolean; event: OpsEvent; warnings: string[] }>(
    `/api/events/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

export function createEvent(body: unknown) {
  return request<{ event: OpsEvent; warnings?: string[]; preview?: EventPreview }>("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateEvent(id: string, body: unknown) {
  return request<{ event: OpsEvent; warnings?: string[]; preview?: EventPreview }>(`/api/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Deleting takes the event off the preview now. `pending`: it is still on the
 * website until Update website (Website page, with Restore until then).
 */
export function deleteEvent(id: string) {
  return request<{ ok: boolean; pending: boolean; warnings?: string[] }>(
    `/api/events/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function deleteEventOccurrence(
  id: string,
  date: string,
  scope: "this" | "following" | "all",
) {
  return request<{
    ok: boolean;
    deleted: boolean;
    event: OpsEvent | null;
    scope: "this" | "following" | "all";
    removed: number;
    pending: boolean;
    warnings?: string[];
  }>(
    `/api/events/${encodeURIComponent(id)}/dates/${encodeURIComponent(date)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    },
  );
}

export function syncEventCalendar(id: string) {
  return request<{ event: OpsEvent; warnings?: string[] }>(
    `/api/events/${encodeURIComponent(id)}/calendar-sync`,
    { method: "POST" },
  );
}

/** What "Update website" would change for this event. */
export function getEventWebsitePreview(id: string) {
  return request<{ ok: boolean; entries: ReleaseEntry[]; included: string[] }>(
    `/api/events/${encodeURIComponent(id)}/publish`,
  );
}

/** Put this event (and only this event) on the website. */
export function putEventOnWebsite(id: string) {
  return request<{
    ok: boolean;
    event: OpsEvent;
    written: string[];
    deleted: string[];
    warnings: string[];
  }>(`/api/events/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "production", confirm: "production" }),
  });
}

/** Stage again without editing. Saving already stages. */
export function restageEvent(id: string) {
  return request<{
    event: OpsEvent;
    warnings?: string[];
    deployed?: boolean;
  }>(`/api/events/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "preview" }),
  });
}

/** A saved event still being got ready for the website (calendar + preview copy). */
export type WebsiteJob = {
  eventId: string;
  name: string;
  state: "waiting" | "failed";
  error: string;
  failedAt: string | null;
};

export function getWebsiteJobs() {
  return request<{ ok: boolean; jobs: WebsiteJob[] }>("/api/web/jobs");
}

/** One step of that work: for `eventId`, or the next waiting event. */
export function runWebsiteJob(eventId = "", { retry = false }: { retry?: boolean } = {}) {
  return request<{
    ok: boolean;
    idle?: boolean;
    eventId?: string;
    done?: boolean;
    failed?: string;
    warnings?: string[];
    event?: OpsEvent;
  }>("/api/web/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, retry }),
  });
}

export function publishAllEventsPreview() {
  return request<{
    ok: boolean;
    events: OpsEvent[];
    published: Array<{ id: string; name: string; warnings: string[] }>;
    failed: Array<{ id: string; name: string; error: string }>;
    skipped?: Array<{ id: string; name: string }>;
    warnings: string[];
    deployed: boolean;
  }>("/api/events/publish-all", {
    method: "POST",
  });
}

export function uploadEventImage(id: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  return request<{ event: OpsEvent; preview?: EventPreview }>(
    `/api/events/${encodeURIComponent(id)}/image`,
    {
      method: "POST",
      body,
    },
  );
}

export function clearEventImage(id: string) {
  return request<{ event: OpsEvent }>(
    `/api/events/${encodeURIComponent(id)}/image`,
    { method: "DELETE" },
  );
}

/** A gallery photo kept in ops (#183): a Sanity asset, shown from cdn.sanity.io. */
export type OpsGalleryPhoto = {
  key: string;
  asset: string;
  url: string;
  width: number;
  height: number;
  /** A night's photo, or "" for the series. */
  date: string;
  added: string;
  source: string;
};

/** Add a photo to the series' gallery, or (`date`) one night's. */
export function uploadGalleryPhoto(id: string, file: File, date = "") {
  const body = new FormData();
  body.set("file", file);
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<{ event: OpsEvent }>(`/api/events/${encodeURIComponent(id)}/gallery${query}`, {
    method: "POST",
    body,
  });
}

/** Take a photo off the gallery; it leaves the website on Update website. */
export function deleteGalleryPhoto(id: string, key: string) {
  return request<{ event: OpsEvent }>(
    `/api/events/${encodeURIComponent(id)}/gallery/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}

export type EventDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  modifiedTime: string;
};

export type EventDriveLibrary = {
  folder: { id: string; url: string };
  gallery: { id: string; url: string };
  outsideGallery?: number;
  files: EventDriveFile[];
};

/** `date`: one night's photos (its subfolder of the gallery) instead of the series'. */
function eventDrivePath(id: string, date = "") {
  return `/api/events/${encodeURIComponent(id)}/drive${date ? `?date=${encodeURIComponent(date)}` : ""}`;
}

export function getEventDrive(id: string, date = "") {
  return request<EventDriveLibrary>(eventDrivePath(id, date));
}

export function uploadEventDriveImage(id: string, file: File, date = "") {
  const body = new FormData();
  body.set("file", file);
  return request<EventDriveLibrary & { ok: boolean; file: EventDriveFile }>(eventDrivePath(id, date), {
    method: "POST",
    body,
  });
}

/** Remove a gallery photo (to the Drive bin). */
export function deleteEventDriveImage(id: string, fileId: string) {
  return request<{ ok: boolean }>(
    `/api/events/${encodeURIComponent(id)}/drive/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
  );
}

export function eventDriveFileUrl(
  eventId: string,
  fileId: string,
  variant: "thumb" | "full" = "thumb",
) {
  const params = new URLSearchParams({ variant });
  if (variant === "thumb") params.set("size", "400");
  return `/api/events/${encodeURIComponent(eventId)}/drive/${encodeURIComponent(fileId)}?${params}`;
}

export function updateEventOccurrence(
  id: string,
  date: string,
  body: {
    scope: "this" | "following" | "all";
    date?: string;
    seriesId?: string;
    name: string;
    artist: string;
    offer: string;
    pageUrl?: string;
    description: string;
    time: string;
    startTime: string;
    endTime: string;
    operationsNotes: string;
    imageLinks: string[];
  },
) {
  return request<{
    event: OpsEvent;
    preview?: EventPreview;
    occurrence: OpsEventOccurrence;
    updated: number;
    scope: "this" | "following" | "all";
    movedFrom?: string;
    movedTo?: string;
    assignedTo?: string;
    sourceDeleted?: boolean;
    warnings?: string[];
  }>(
    `/api/events/${encodeURIComponent(id)}/dates/${encodeURIComponent(date)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function ensureEventOccurrence(
  id: string,
  date: string,
  body: Record<string, unknown> = {},
) {
  return request<{
    event: OpsEvent;
    preview?: EventPreview;
    occurrence: OpsEventOccurrence;
    created: boolean;
    warnings?: string[];
  }>(
    `/api/events/${encodeURIComponent(id)}/dates/${encodeURIComponent(date)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function uploadEventOccurrenceImage(
  id: string,
  date: string,
  file: File,
) {
  const body = new FormData();
  body.set("file", file);
  return request<{ event: OpsEvent; occurrence: OpsEventOccurrence }>(
    `/api/events/${encodeURIComponent(id)}/dates/${encodeURIComponent(date)}/image`,
    { method: "POST", body },
  );
}

export function clearEventOccurrenceImage(id: string, date: string) {
  return request<{ event: OpsEvent; occurrence: OpsEventOccurrence | null }>(
    `/api/events/${encodeURIComponent(id)}/dates/${encodeURIComponent(date)}/image`,
    { method: "DELETE" },
  );
}

export function getOpsConfig() {
  return request<{
    settings: { taskRoleSocial: string; clickupEventsListId: string };
  }>("/api/config");
}

export type ArtistSlot = "current" | "next" | "previous";

export type ArtistImage = {
  name: string;
  label: string;
  url: string;
  thumb: string;
};

export type WallArtist = {
  id: string;
  slot: ArtistSlot;
  name: string;
  artistName: string;
  website: string;
  profile: string;
  bio: string;
  startMonth: string;
  endMonth: string;
  portrait: ArtistImage | null;
  art: ArtistImage[];
  gwenda: ArtistImage[];
};

export type ArtistInput = {
  name: string;
  artistName: string;
  website: string;
  profile: string;
  bio: string;
  slot: ArtistSlot;
  startMonth: string;
  endMonth: string;
};

export function getArtists() {
  return request<{ artists: WallArtist[] }>("/api/artists");
}

export function getArtist(id: string) {
  return request<{ artist: WallArtist }>(
    `/api/artists/${encodeURIComponent(id)}`,
  );
}

export function createArtist(body: ArtistInput) {
  return request<{ artist: WallArtist }>("/api/artists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateArtist(id: string, body: ArtistInput) {
  return request<{ artist: WallArtist }>(
    `/api/artists/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function deleteArtist(id: string) {
  return request<{ ok: boolean; id: string }>(
    `/api/artists/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function uploadArtistImage(
  id: string,
  file: File,
  kind: "portrait" | "art" | "gwenda",
) {
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);
  return request<{ artist: WallArtist }>(
    `/api/artists/${encodeURIComponent(id)}/images`,
    { method: "POST", body },
  );
}

export function clearArtistImage(
  id: string,
  kind: "portrait" | "art" | "gwenda",
  name = "",
) {
  const params = new URLSearchParams({ kind });
  if (name) params.set("name", name);
  return request<{ artist: WallArtist }>(
    `/api/artists/${encodeURIComponent(id)}/images?${params}`,
    { method: "DELETE" },
  );
}

export function saveEventTaskSettings(events: {
  socialEmail: string;
  clickupListId: string;
}) {
  return request<{
    settings: { taskRoleSocial: string; clickupEventsListId: string };
  }>("/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

export function getDashboard() {
  return request<import("../home/dashboard-data").DashboardData>("/api/dashboard");
}

/** Unresolved Sentry issues, read and cached by ops (never from the browser). */
export function getWebsiteErrors() {
  return request<import("../home/dashboard-data").WebsiteErrors>("/api/health/errors");
}
