import { createCoalescer } from "./coalesce";

const coalesce = createCoalescer();

function localLocation(header: string | null) {
  if (!header) return "/gate/";
  try {
    const url = new URL(header, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}` || "/gate/";
  } catch {
    return header.startsWith("/") ? header : "/gate/";
  }
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
  if (res.type === "opaqueredirect" || res.status === 0 || res.status === 401) {
    throw new Error("auth:/gate/");
  }
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`auth:${localLocation(res.headers.get("Location"))}`);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export async function login(password: string, next = "/menu") {
  return request<{ ok: boolean; redirect?: string }>("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, next }),
  });
}

export type AuthMe = {
  email: string | null;
  mode: "google" | "password" | "misconfigured";
  siteEnv: "local" | "staging" | "production" | string;
  envLabel: string;
  databaseId: string | null;
  databaseLabel: string;
  isProductionDb: boolean;
  risk: "nonprod_on_production_db" | "production_on_nonprod_db" | null;
};

export function getMe() {
  return request<AuthMe>("/api/auth/me");
}

export function getMenu() {
  return coalesce("menu", () =>
    request<{
      sections: import("./types").MenuSection[];
      posMenus?: import("./types").PosMenu[];
    }>("/api/menu"),
  );
}

export function getPosMenus() {
  return request<{ posMenus: import("./types").PosMenu[] }>("/api/pos-menus");
}

export function createPosMenu(body: { name: string; isDefault?: boolean }) {
  return request<{ posMenu: import("./types").PosMenu }>("/api/pos-menus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updatePosMenu(
  id: string,
  body: { name?: string; isDefault?: boolean; orderRank?: number },
) {
  return request<{ posMenu: import("./types").PosMenu }>(
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
  return request<{ section: import("./types").MenuSection }>(
    "/api/menu/sections",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function updateSection(id: string, body: unknown) {
  return request<{ section: import("./types").MenuSection }>(
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
  return request<{ item: import("./types").MenuItem }>("/api/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateItem(id: string, body: unknown) {
  return request<{ item: import("./types").MenuItem }>(
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

export function publishMenu(target: string) {
  return request<{
    target?: string;
    runUrl?: string;
    sync?: {
      synced?: unknown[];
      created?: unknown[];
      unchanged?: unknown[];
      missing?: string[];
    };
    deployed?: boolean;
  }>("/api/menu/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
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
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    item?: import("./types").MenuItem;
  };
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data;
}

export async function deletePhoto(itemId: string) {
  const res = await fetch(
    `/api/menu/image?itemId=${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    item?: import("./types").MenuItem;
  };
  if (!res.ok) throw new Error(data.error || "Could not remove photo.");
  return data;
}

export function getInventory(all = false) {
  const q = all ? "?all=1" : "";
  const key = all ? "inventory:all" : "inventory";
  return coalesce(key, () =>
    request<{ items: import("./types").InventoryItem[] }>(`/api/inventory${q}`),
  );
}

export function createInventoryItem(body: unknown) {
  return request<{ item: import("./types").InventoryItem }>("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateInventoryItem(id: string, body: unknown) {
  return request<{ item: import("./types").InventoryItem }>(
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
  return request<import("./types").LightspeedPreview>(
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
    request<{ suppliers: import("./types").CatalogSupplier[] }>(
      "/api/suppliers",
    ),
  );
}

export function createSupplier(body: unknown) {
  return request<{ supplier: import("./types").CatalogSupplier }>(
    "/api/suppliers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function updateSupplier(id: string, body: unknown) {
  return request<{ supplier: import("./types").CatalogSupplier }>(
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

export function getOpsUsers() {
  return coalesce("users", () =>
    request<{ users: import("./types").OpsUser[] }>("/api/users"),
  );
}

export function createOpsUser(body: unknown) {
  return request<{ user: import("./types").OpsUser }>("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateOpsUser(id: string, body: unknown) {
  return request<{ user: import("./types").OpsUser }>(
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
      pourTargets: import("./types").PourTargetMap;
      values: Record<string, string>;
    }>("/api/config"),
  );
}

export function updateConfig(body: {
  pourTargets?: Partial<import("./types").PourTargetMap>;
  reset?: boolean;
}) {
  return request<{
    ok: boolean;
    pourTargets: import("./types").PourTargetMap;
  }>("/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type WebEnvId = "staging" | "production";

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
    toStaging: boolean;
    toProduction: boolean;
  };
};

export function getWebStatus() {
  return coalesce("web-status", () => request<WebStatus>("/api/web/status"));
}

export function promoteWebsite(target: "staging" | "production") {
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

export function promoteStagingToProduction() {
  return promoteWebsite("production");
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

export type OpsEventImage = { name: string; url: string };

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
  images: OpsEventImage[];
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

export function createEvent(body: unknown) {
  return request<{ event: OpsEvent; warnings?: string[] }>("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateEvent(id: string, body: unknown) {
  return request<{ event: OpsEvent; warnings?: string[] }>(`/api/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteEvent(id: string) {
  return request<{ ok: boolean; warnings?: string[] }>(
    `/api/events/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
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

export function publishEvent(id: string, target: "staging" | "production") {
  return request<{
    event: OpsEvent;
    warnings?: string[];
    deployed?: boolean;
  }>(`/api/events/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
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

export function uploadEventImage(
  id: string,
  file: File,
  role: "main" | "gallery",
) {
  const body = new FormData();
  body.set("file", file);
  body.set("role", role);
  return request<{ event: OpsEvent }>(
    `/api/events/${encodeURIComponent(id)}/image`,
    {
      method: "POST",
      body,
    },
  );
}

export function clearEventImage(
  id: string,
  role: "main" | "gallery",
  name = "",
) {
  const params = new URLSearchParams({ role });
  if (name) params.set("name", name);
  return request<{ event: OpsEvent }>(
    `/api/events/${encodeURIComponent(id)}/image?${params}`,
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

export function getEventDrive(id: string) {
  return request<EventDriveLibrary>(
    `/api/events/${encodeURIComponent(id)}/drive`,
  );
}

export function uploadEventDriveImage(id: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  return request<EventDriveLibrary & { ok: boolean; file: EventDriveFile }>(
    `/api/events/${encodeURIComponent(id)}/drive`,
    {
      method: "POST",
      body,
    },
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
