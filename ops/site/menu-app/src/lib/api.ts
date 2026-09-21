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
    request<{ sections: import("./types").MenuSection[] }>("/api/menu"),
  );
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

export function previewLightspeedCsv(text: string, body: {
  apply?: boolean;
  menuName?: string;
  action?: "preview" | "save" | "add" | "archive" | "unarchive" | "link";
  items?: Array<{
    sku?: string;
    name?: string;
    sectionId?: string;
    drinkType?: string;
    price?: string;
    defaultPrice?: number | null;
    onPrintMenu?: boolean;
    onDigitalMenu?: boolean;
  }>;
  rows?: Array<{ sku?: string; name?: string }>;
  skus?: string[];
  links?: Array<{
    itemId?: string;
    sku?: string;
    name?: string;
    adoptName?: boolean;
  }>;
} = {}) {
  return request<import("./types").LightspeedPreview>("/api/inventory/lightspeed", {
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
      links: body.links,
    }),
  });
}

export function getSuppliers() {
  return coalesce("suppliers", () =>
    request<{ suppliers: import("./types").CatalogSupplier[] }>("/api/suppliers"),
  );
}

export function createSupplier(body: unknown) {
  return request<{ supplier: import("./types").CatalogSupplier }>("/api/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export function analyzeRecipeNote(body: {
	item: unknown;
	analysis: unknown;
}) {
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
