/**
 * InstagramPublisher on the Instagram Graph API, through Facebook Login for
 * Business (#26): graph.facebook.com in production, our fake Instagram
 * (ops/instagram-fake) in dev. Same requests either way; only
 * INSTAGRAM_GRAPH_URL and the credentials differ.
 *
 * Guards, so dev can never reach the real account:
 * - production talks only to graph.facebook.com, whatever INSTAGRAM_GRAPH_URL says;
 * - anywhere else, a facebook.com or instagram.com address is refused;
 * - dev without INSTAGRAM_GRAPH_URL is a dry run (no calls), never production.
 */
import { environmentOf } from "../../../../../../shared/config.js";

/** The Graph API version ops is written against. Meta supports each for about two years. */
export const GRAPH_VERSION = "v24.0";
export const META_GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

const META_HOSTS = ["facebook.com", "instagram.com", "fb.com"];

function error(message, status, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

/** Instagram isn't set up in this environment (the tab says so instead of erroring). */
function notSetUp(message) {
  return error(message, 409, { notSetUp: true });
}

function parsedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function isMetaHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return META_HOSTS.some((meta) => host === meta || host.endsWith(`.${meta}`));
}

/**
 * Where and as whom this environment posts: { mode, baseUrl, token, userId }.
 * mode is "live" (production, Meta), "fake" (dev, our fake) or "dry-run".
 * Throws (`notSetUp`) when credentials are missing, and refuses a base URL
 * that would cross environments.
 */
export function graphSettings(env = {}) {
  const environment = environmentOf(env);
  const configured = String(env.INSTAGRAM_GRAPH_URL || "")
    .trim()
    .replace(/\/+$/, "");
  let mode;
  let baseUrl;
  // `npm run ops:prod` (a local copy on live data) records posts only in its
  // own local database, so it can't see what production posted: it never posts.
  if (environment === "production" && String(env.OPS_LOCAL_LIVE || "") === "1") {
    return { mode: "dry-run", baseUrl: "", token: "", userId: "", environment };
  }
  if (environment === "production") {
    baseUrl = configured || META_GRAPH_URL;
    const url = parsedUrl(baseUrl);
    if (!url || url.protocol !== "https:" || url.hostname !== "graph.facebook.com") {
      throw error(
        "Production ops only posts to Instagram itself (graph.facebook.com). Remove INSTAGRAM_GRAPH_URL from production.",
        409,
        { notSetUp: true },
      );
    }
    mode = "live";
  } else {
    if (!configured) return { mode: "dry-run", baseUrl: "", token: "", userId: "", environment };
    const url = parsedUrl(configured);
    if (!url) throw notSetUp("INSTAGRAM_GRAPH_URL isn't a web address. Point it at the fake Instagram.");
    if (isMetaHost(url.hostname)) {
      throw error(
        "Only production ops may talk to Instagram itself. Point INSTAGRAM_GRAPH_URL at the fake Instagram instead.",
        409,
        { notSetUp: true },
      );
    }
    baseUrl = configured;
    mode = "fake";
  }
  const token = String(env.INSTAGRAM_ACCESS_TOKEN || "").trim();
  const userId = String(env.INSTAGRAM_USER_ID || "").trim();
  if (!token || !userId) throw notSetUp("Instagram isn't set up in this environment yet.");
  return { mode, baseUrl, token, userId, environment };
}

/** Meta's error, in words an editor can act on. */
export function plainGraphError(payload, httpStatus = 400) {
  const meta = payload?.error || {};
  const code = Number(meta.code);
  const sub = Number(meta.error_subcode);
  const said = String(meta.error_user_msg || meta.message || "").trim();
  if (code === 190 || code === 102 || [458, 459, 460, 463, 464, 467].includes(sub)) {
    return error(
      "Instagram didn't accept our access token: it has expired or been withdrawn. The Meta setup needs a new token (docs/instagram.md).",
      424,
      { graph: meta },
    );
  }
  if (code === 10 || code === 200 || code === 3) {
    return error(
      "The Instagram account hasn't given ops permission to post. Check the app's permissions (docs/instagram.md).",
      403,
      { graph: meta },
    );
  }
  if ([4, 17, 32, 613].includes(code) || sub === 2207042) {
    return error("Instagram's limit on posts has been reached for now. Try again later.", 429, { graph: meta });
  }
  if (code === 36003 || sub === 2207009) {
    return error(
      "Instagram can't use this image's shape. It must be between 4:5 (portrait) and 1.91:1 (landscape).",
      422,
      { graph: meta },
    );
  }
  if (sub === 2207004) return error("The image is too large for Instagram.", 422, { graph: meta });
  if (sub === 2207026 || sub === 2207005) return error("Instagram only takes JPEG images for a post.", 422, { graph: meta });
  if (code === 9004 || sub === 2207052 || sub === 2207003) {
    return error("Instagram couldn't fetch the image. Check the event's image and try again.", 422, { graph: meta });
  }
  if (sub === 2207008 || sub === 2207020) {
    return error("Instagram's copy of the image expired before it was posted. Press Post again.", 409, { graph: meta });
  }
  if (sub === 2207027 || (code === 9007 && !sub)) {
    return error("Instagram is still preparing the image. Try again in a minute.", 409, { graph: meta, notReady: true });
  }
  if (code === 1 || code === 2 || sub === 2207001 || httpStatus >= 500) {
    return error("Instagram had a problem on its side. Try again in a few minutes.", 424, { graph: meta });
  }
  return error(said ? `Instagram said: ${said}` : "Instagram turned the post down.", 422, { graph: meta });
}

/**
 * @param {{ mode: string, baseUrl: string, token: string, userId: string }} settings
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export function graphPublisher(settings, { fetchImpl } = {}) {
  const { mode, baseUrl, token, userId } = settings;
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);

  async function call(method, path, params = {}) {
    const url = new URL(`${baseUrl}${path}`);
    const init = { method, headers: { Authorization: `Bearer ${token}` } };
    if (method === "GET") {
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    } else {
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    }
    let response;
    try {
      response = await doFetch(url.toString(), init);
    } catch {
      throw error("Couldn't reach Instagram. Try again in a minute.", 424);
    }
    const payload = await response.json().catch(() => null);
    if (!payload) {
      throw error(`Instagram didn't answer properly (HTTP ${response.status}). Try again in a minute.`, 424);
    }
    if (!response.ok || payload.error) throw plainGraphError(payload, response.status);
    return payload;
  }

  return {
    mode,
    async account() {
      const data = await call("GET", `/${userId}`, { fields: "id,username" });
      const username = String(data.username || "");
      return {
        id: String(data.id || userId),
        username,
        profileUrl: username ? `https://www.instagram.com/${username}/` : "",
      };
    },
    async quota() {
      const data = await call("GET", `/${userId}/content_publishing_limit`, { fields: "quota_usage,config" });
      const row = data?.data?.[0];
      if (!row) return null;
      return { used: Number(row.quota_usage) || 0, total: Number(row.config?.quota_total) || 0 };
    },
    async createImage(imageUrl, caption) {
      const data = await call("POST", `/${userId}/media`, { image_url: imageUrl, caption });
      return String(data.id);
    },
    async status(containerId) {
      const data = await call("GET", `/${containerId}`, { fields: "status_code" });
      return String(data.status_code || "");
    },
    async publish(containerId) {
      const data = await call("POST", `/${userId}/media_publish`, { creation_id: containerId });
      return String(data.id);
    },
    async permalink(mediaId) {
      const data = await call("GET", `/${mediaId}`, { fields: "permalink" });
      return String(data.permalink || "");
    },
  };
}
