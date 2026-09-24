/**
 * Google Drive client for ops series folders (Shared Drive).
 * Gallery photos live in a gallery folder. A copy of the hero sits in
 * the series folder itself.
 * Auth: service account JSON in GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.
 */
import { OPS_CONFIG_KEYS, getConfigString } from "./config-store.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Child folder under each series folder. Gallery photos live here. */
export const GALLERY_FOLDER_NAME = "gallery";

const HERO_EXT = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** File extension for a hero copy. jpeg is stored as jpg. */
export function heroFileExtension(filename, contentType = "") {
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(String(filename || "").trim());
  const named = fromName?.[1]?.toLowerCase() || "";
  if (named === "jpeg" || named === "jpg") return "jpg";
  if (HERO_EXT[named] && named !== "jpeg") return named;
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

/** Series flyer in the series Drive folder: hero.jpg */
export function seriesHeroDriveName(filename, contentType = "") {
  return `hero.${heroFileExtension(filename, contentType)}`;
}

/** Night flyer in the series Drive folder: hero-YYYY-MM-DD.jpg */
export function occurrenceHeroDriveName(date, filename, contentType = "") {
  const day = String(date || "").slice(0, 10);
  return `hero-${day}.${heroFileExtension(filename, contentType)}`;
}

export function isSeriesHeroDriveName(name) {
  return /^hero\.(jpg|png|webp|gif)$/i.test(String(name || "").trim());
}

export function isOccurrenceHeroDriveName(name, date = "") {
  const match = /^hero-(\d{4}-\d{2}-\d{2})\.(jpg|png|webp|gif)$/i.exec(
    String(name || "").trim(),
  );
  if (!match) return false;
  const day = String(date || "").slice(0, 10);
  return day ? match[1] === day : true;
}

/** Series or night hero copy. These sit beside the gallery folder. */
export function isHeroDriveFileName(name) {
  return isSeriesHeroDriveName(name) || isOccurrenceHeroDriveName(name);
}

/** @type {Map<string, { id: string, name: string, url: string }>} */
const namedChildFolders = new Map();

/** @type {{ token: string, exp: number, key: string } | null} */
let cachedToken = null;

function bufferToBase64Url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(text) {
  return bufferToBase64Url(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem) {
  const b64 = String(pem || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!b64) throw new Error("Service account private key is empty.");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes || []);
}

export function parseDriveServiceAccount(env = {}) {
  const raw = String(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.type !== "service_account" ||
      !parsed.client_email ||
      !parsed.private_key
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function driveEventsRootFolderId(env = {}) {
  return getConfigString(env, OPS_CONFIG_KEYS.googleDriveEventsFolderId);
}

async function mintAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textToBase64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${bufferToBase64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(
      payload.error_description ||
        payload.error ||
        `Google token failed (${response.status}).`,
    );
    error.status = 502;
    throw error;
  }
  return {
    token: String(payload.access_token),
    exp: now + Math.max(60, Number(payload.expires_in) || 3600) - 60,
  };
}

export async function driveAccessToken(env = {}) {
  const account = parseDriveServiceAccount(env);
  if (!account) {
    const error = new Error(
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not configured.",
    );
    error.status = 503;
    throw error;
  }
  const cacheKey = account.client_email;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.key === cacheKey && cachedToken.exp > now) {
    return cachedToken.token;
  }
  const minted = await mintAccessToken(account);
  cachedToken = { ...minted, key: cacheKey };
  return minted.token;
}

async function driveFetch(env, path, { method = "GET", body, query } = {}) {
  const token = await driveAccessToken(env);
  const url = new URL(`${DRIVE_API}${path}`);
  url.searchParams.set("supportsAllDrives", "true");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error?.message ||
        payload.error_description ||
        `Google Drive failed (${response.status}).`,
    );
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return payload;
}

export function driveFolderWebUrl(folderId) {
  const id = String(folderId || "").trim();
  return id ? `https://drive.google.com/drive/folders/${id}` : "";
}

export function isDriveImage(file) {
  return String(file?.mimeType || "")
    .trim()
    .toLowerCase()
    .startsWith("image/");
}

export function mapDriveImage(file) {
  return {
    id: String(file?.id || ""),
    name: String(file?.name || "image"),
    mimeType: String(file?.mimeType || ""),
    url: String(file?.webViewLink || ""),
    modifiedTime: String(file?.modifiedTime || ""),
  };
}

/** List immediate children of a folder (files and folders). */
export async function listDriveChildren(env, parentId) {
  const id = String(parentId || "").trim();
  if (!id) return [];
  const q = `'${id.replace(/'/g, "\\'")}' in parents and trashed = false`;
  const files = [];
  let pageToken = "";
  for (;;) {
    const payload = await driveFetch(env, "/files", {
      query: {
        q,
        includeItemsFromAllDrives: "true",
        fields:
          "nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime)",
        pageSize: "200",
        orderBy: "folder,name_natural",
        pageToken,
      },
    });
    if (Array.isArray(payload.files)) files.push(...payload.files);
    pageToken = String(payload.nextPageToken || "");
    if (!pageToken || files.length > 5000) break;
  }
  return files;
}

export async function listDriveImages(env, parentId) {
  const children = await listDriveChildren(env, parentId);
  return children.filter(isDriveImage).map(mapDriveImage);
}

/** First immediate child folder with this name, or null. */
export function findNamedFolder(children, name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return null;
  for (const file of children || []) {
    if (String(file?.mimeType || "") !== FOLDER_MIME) continue;
    if (String(file?.name || "").trim().toLowerCase() !== wanted) continue;
    return file;
  }
  return null;
}

/**
 * An unreferenced folder with this name, newest first.
 * `takenIds` are folders already stored on an event.
 */
export function pickReusableDriveFolder(children, name, takenIds = []) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return null;
  const taken = new Set((takenIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const matches = (children || []).filter((file) => {
    if (String(file?.mimeType || "") !== FOLDER_MIME) return false;
    if (String(file?.name || "").trim().toLowerCase() !== wanted) return false;
    return !taken.has(String(file?.id || ""));
  });
  matches.sort((a, b) =>
    String(b?.modifiedTime || "").localeCompare(String(a?.modifiedTime || "")),
  );
  return matches[0] || null;
}

/**
 * Find or create a named child folder. Cached for this isolate so thumbnail
 * requests do not list the parent on every image.
 */
export async function ensureNamedChildFolder(env, parentId, name) {
  const parent = String(parentId || "").trim();
  const folderName = String(name || "").trim();
  if (!parent || !folderName) {
    const error = new Error("Drive parent folder and name are required.");
    error.status = 400;
    throw error;
  }
  const cacheKey = `${parent}\n${folderName.toLowerCase()}`;
  const cached = namedChildFolders.get(cacheKey);
  if (cached) return cached;
  const children = await listDriveChildren(env, parent);
  const existing = findNamedFolder(children, folderName);
  const folder = existing?.id
    ? {
        id: String(existing.id),
        name: String(existing.name || folderName),
        url:
          String(existing.webViewLink || "") || driveFolderWebUrl(existing.id),
      }
    : await createDriveFolder(env, { name: folderName, parentId: parent });
  namedChildFolders.set(cacheKey, folder);
  return folder;
}

export async function getDriveFile(env, fileId) {
  const id = String(fileId || "").trim();
  if (!id) return null;
  return driveFetch(env, `/files/${encodeURIComponent(id)}`, {
    query: {
      fields: "id,name,mimeType,webViewLink,thumbnailLink,parents",
    },
  });
}

export async function downloadDriveFile(env, fileId) {
  const id = String(fileId || "").trim();
  if (!id) {
    const error = new Error("Drive file id is required.");
    error.status = 400;
    throw error;
  }
  const token = await driveAccessToken(env);
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(id)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error(
      `Google Drive download failed (${response.status}).`,
    );
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType:
      response.headers.get("content-type") || "application/octet-stream",
    name: "",
  };
}

/** Prefer Google's thumbnail (small). Falls back to the full file if missing. */
export async function downloadDriveThumbnail(
  env,
  fileId,
  { size = 400 } = {},
) {
  const id = String(fileId || "").trim();
  if (!id) {
    const error = new Error("Drive file id is required.");
    error.status = 400;
    throw error;
  }
  const edge = Math.max(64, Math.min(1600, Math.floor(Number(size) || 400)));
  const meta = await getDriveFile(env, id);
  const raw = String(meta?.thumbnailLink || "").trim();
  if (raw) {
    const thumbUrl = raw.includes("=")
      ? raw.replace(/=s\d+(-[a-z])?/i, `=s${edge}$1`)
      : `${raw}=s${edge}`;
    const token = await driveAccessToken(env);
    const response = await fetch(thumbUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      return {
        bytes: await response.arrayBuffer(),
        contentType:
          response.headers.get("content-type") || "image/jpeg",
        name: String(meta?.name || ""),
      };
    }
  }
  return downloadDriveFile(env, id);
}

function multipartRelatedBody(metadata, bytes, contentType, boundary) {
  const enc = new TextEncoder();
  const media = toUint8Array(bytes);
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + media.length + tail.length);
  body.set(head, 0);
  body.set(media, head.length);
  body.set(tail, head.length + media.length);
  return body;
}

export async function uploadDriveFile(
  env,
  { name, parentId, bytes, contentType },
) {
  const fileName = String(name || "image.jpg").trim() || "image.jpg";
  const parent = String(parentId || "").trim();
  const type = String(contentType || "application/octet-stream").trim();
  if (!parent) {
    const error = new Error("Drive parent folder id is required.");
    error.status = 400;
    throw error;
  }
  const media = toUint8Array(bytes);
  if (!media.byteLength) {
    const error = new Error("Image file is required.");
    error.status = 400;
    throw error;
  }
  const token = await driveAccessToken(env);
  const boundary = `ops_${crypto.randomUUID().replace(/-/g, "")}`;
  const body = multipartRelatedBody(
    { name: fileName, parents: [parent] },
    media,
    type,
    boundary,
  );
  const url = new URL(`${DRIVE_UPLOAD_API}/files`);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set(
    "fields",
    "id,name,mimeType,webViewLink,thumbnailLink,modifiedTime",
  );
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const error = new Error(
      payload.error?.message ||
        payload.error_description ||
        `Google Drive upload failed (${response.status}).`,
    );
    error.status = 502;
    throw error;
  }
  return mapDriveImage(payload);
}

export async function trashDriveFile(env, fileId) {
  const id = String(fileId || "").trim();
  if (!id) return;
  try {
    await driveFetch(env, `/files/${encodeURIComponent(id)}`, {
      method: "PATCH",
      query: { fields: "id,trashed" },
      body: { trashed: true },
    });
  } catch (error) {
    if (error?.status === 404) return;
    throw error;
  }
}

export async function untrashDriveFile(env, fileId) {
  const id = String(fileId || "").trim();
  if (!id) return;
  await driveFetch(env, `/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    query: { fields: "id,trashed" },
    body: { trashed: false },
  });
}

export async function renameDriveFile(env, fileId, name) {
  const id = String(fileId || "").trim();
  const next = String(name || "").trim();
  if (!id || !next) {
    const error = new Error("Drive file id and name are required.");
    error.status = 400;
    throw error;
  }
  const renamed = await driveFetch(env, `/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    query: { fields: "id,name,mimeType,webViewLink" },
    body: { name: next },
  });
  return {
    id: String(renamed.id || id),
    name: String(renamed.name || next),
    url: String(renamed.webViewLink || "") || driveFolderWebUrl(renamed.id || id),
  };
}

/** Move a file to another folder in the same drive. */
export async function moveDriveFile(env, fileId, { addParentId, removeParentId }) {
  const id = String(fileId || "").trim();
  const add = String(addParentId || "").trim();
  const remove = String(removeParentId || "").trim();
  if (!id || !add || !remove) {
    const error = new Error("Drive file id and parent folders are required.");
    error.status = 400;
    throw error;
  }
  return driveFetch(env, `/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    query: {
      addParents: add,
      removeParents: remove,
      fields: "id,name,parents",
    },
  });
}

/**
 * Create a folder under parent. Drive allows duplicate names; callers should
 * store the returned id as the event pointer.
 */
export async function createDriveFolder(env, { name, parentId }) {
  const folderName = String(name || "").trim();
  const parent = String(parentId || "").trim();
  if (!folderName) {
    const error = new Error("Drive folder name is required.");
    error.status = 400;
    throw error;
  }
  if (!parent) {
    const error = new Error("Drive parent folder id is required.");
    error.status = 400;
    throw error;
  }
  const created = await driveFetch(env, "/files", {
    method: "POST",
    query: { fields: "id,name,mimeType,webViewLink" },
    body: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [parent],
    },
  });
  return {
    id: String(created.id || ""),
    name: String(created.name || folderName),
    url: String(created.webViewLink || "") || driveFolderWebUrl(created.id),
  };
}

/**
 * Event library folder under the configured Events root.
 * Reuses an unreferenced folder of the same name so a deleted event
 * does not leave a twin behind when the name is used again.
 * `takenFolderIds` are folders already stored on other events.
 */
export async function createEventDriveFolder(
  env,
  eventName,
  { takenFolderIds = [] } = {},
) {
  const rootId = await driveEventsRootFolderId(env);
  if (!rootId) {
    const error = new Error(
      "google.drive_events_folder_id is not set in App Config.",
    );
    error.status = 503;
    throw error;
  }
  const children = await listDriveChildren(env, rootId);
  const existing = pickReusableDriveFolder(children, eventName, takenFolderIds);
  if (existing?.id) {
    return {
      id: String(existing.id),
      name: String(existing.name || eventName),
      url: String(existing.webViewLink || "") || driveFolderWebUrl(existing.id),
      reused: true,
    };
  }
  const created = await createDriveFolder(env, {
    name: eventName,
    parentId: rootId,
  });
  return { ...created, reused: false };
}

/** @internal test helper */
export function resetDriveTokenCacheForTests() {
  cachedToken = null;
  namedChildFolders.clear();
}
