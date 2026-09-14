async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("Location") || "/gate/";
    throw new Error(`auth:${location}`);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export async function login(password: string, next = "/menu/") {
  return request<{ ok: boolean; redirect?: string }>("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, next }),
  });
}

export function getMenu() {
  return request<{ sections: import("./types").MenuSection[] }>("/api/menu");
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
    sync?: { synced?: unknown[]; missing?: string[] };
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
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data;
}
